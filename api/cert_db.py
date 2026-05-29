"""
Accesso DB per i Certificati (tabelle `certificates` e `underlyings`).

Riscrittura di Python-analisi-Certificato/backend/database.py sul pattern REST di
PerixMonitor (db_helper.py + SERVICE_ROLE_KEY), al posto di psycopg2/DATABASE_URL.
Coerente con il resto del backend: un solo modo di parlare con Supabase.
"""

from datetime import datetime

from logger import logger
from db_helper import (
    query_table,
    execute_request,
    upsert_table,
    update_table,
    delete_table,
)


class CertDatabaseError(Exception):
    """Errore di accesso al DB dei certificati (credenziali mancanti o I/O fallito).

    Sollevata per distinguere un guasto del DB dal semplice 'ISIN non presente',
    così che il chiamante non riesegua inutilmente l'analisi AI quando il DB è giù."""
    pass


# Colonne ammesse per l'aggiornamento parziale via PATCH (whitelist anti-injection)
ALLOWED_UPDATE_FIELDS = {
    "expiry_date", "barrier_pct", "barrier_type",
    "coupon_pct", "coupon_freq", "next_coupon_date", "trigger_level",
}


def clean_numeric(val):
    """Pulisce e converte un valore in float. Ritorna 0.0 se non interpretabile.
    Gestisce '60.0%', '1.250,50', 'N.D.', None, ecc."""
    if val is None or str(val).strip().lower() in ["n.d.", "none", "null", "nan", ""]:
        return 0.0
    try:
        cleaned = "".join(c for c in str(val) if c.isdigit() or c in '.,-')
        cleaned = cleaned.replace(',', '.')
        if cleaned.count('.') > 1:  # es. 1.250.00 -> 1250.00
            parts = cleaned.split('.')
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
        return float(cleaned)
    except Exception:
        return 0.0


def get_cached_analysis(isin):
    """Ritorna {'certificate': {...}, 'underlyings': [...]} dalla cache DB,
    oppure None se l'ISIN non è presente."""
    cert_rows = query_table('certificates', '*', {'isin': isin})
    if not cert_rows:
        return None

    underlyings = query_table('underlyings', '*', {'isin': isin})
    return {
        "certificate": cert_rows[0],
        "underlyings": underlyings or [],
    }


def save_analysis(analysis_data):
    """Salva (upsert) il certificato e i suoi sottostanti.

    Preserva i `corrected_ticker` esistenti (override manuali dei ticker) prima di
    ricreare le righe dei sottostanti. Ritorna True in caso di successo."""
    isin = analysis_data['isin']

    # 1. Upsert del certificato
    cert_payload = {
        "isin": isin,
        "expiry_date": analysis_data.get('expiry_date'),
        "barrier_pct": clean_numeric(analysis_data.get('barrier_level')),
        "barrier_type": analysis_data.get('barrier_type'),
        "coupon_pct": clean_numeric(analysis_data.get('coupon_pct')),
        "coupon_freq": analysis_data.get('coupon_freq'),
        "has_memory": bool(analysis_data.get('has_memory')),
        "is_autocallable": bool(analysis_data.get('is_autocallable')),
        "trigger_level": clean_numeric(analysis_data.get('trigger_level')),
        "next_coupon_date": analysis_data.get('next_coupon_date'),
        "last_updated": datetime.now().isoformat(),
    }
    if not upsert_table('certificates', cert_payload, on_conflict='isin'):
        raise CertDatabaseError(f"Salvataggio certificato {isin} fallito")

    # 2. Preserva gli override manuali (corrected_ticker) esistenti
    existing_overrides = {}
    existing = query_table('underlyings', 'original_ticker,corrected_ticker', {'isin': isin})
    for row in (existing or []):
        if row.get('corrected_ticker'):
            existing_overrides[row.get('original_ticker')] = row['corrected_ticker']

    # 3. Reset dei sottostanti (più semplice di un sync incrementale)
    delete_table('underlyings', {'isin': isin})

    # 4. Reinserimento con override preservati
    new_underlyings = []
    for u in analysis_data.get('underlyings', []):
        ticker = u.get('ticker')
        new_underlyings.append({
            "isin": isin,
            "name": u.get('name'),
            "original_ticker": ticker,
            "corrected_ticker": existing_overrides.get(ticker),
            "strike": u.get('strike'),
            "barrier_abs": u.get('barrier'),
        })

    if new_underlyings:
        if not upsert_table('underlyings', new_underlyings, on_conflict='isin,original_ticker'):
            raise CertDatabaseError(f"Salvataggio sottostanti {isin} fallito")

    logger.info(f"[CERT_DB] Salvato certificato {isin} con {len(new_underlyings)} sottostanti")
    return True


def update_ticker_override(isin, original_ticker, new_ticker):
    """Imposta il corrected_ticker per uno specifico sottostante."""
    ok = update_table(
        'underlyings',
        {"corrected_ticker": new_ticker},
        {'isin': isin, 'original_ticker': original_ticker},
    )
    if not ok:
        raise CertDatabaseError(f"Aggiornamento ticker fallito per {isin}/{original_ticker}")
    logger.info(f"[CERT_DB] Override ticker {isin}: {original_ticker} -> {new_ticker}")
    return True


def update_certificate_fields(isin, fields: dict):
    """Aggiorna solo i campi whitelisted nella tabella certificates.
    Ritorna False se nessun campo valido è fornito."""
    safe_fields = {k: v for k, v in fields.items() if k in ALLOWED_UPDATE_FIELDS}
    if not safe_fields:
        logger.warning(f"[CERT_DB] Nessun campo valido da aggiornare per {isin}")
        return False

    safe_fields['last_updated'] = datetime.now().isoformat()
    ok = update_table('certificates', safe_fields, {'isin': isin})
    if not ok:
        raise CertDatabaseError(f"Aggiornamento campi fallito per {isin}")
    logger.info(f"[CERT_DB] Aggiornati campi {list(safe_fields.keys())} per {isin}")
    return True


def delete_certificate(isin):
    """Elimina il certificato e (per cascade FK) i suoi sottostanti.
    Cancella esplicitamente anche gli underlyings per robustezza."""
    delete_table('underlyings', {'isin': isin})
    ok = delete_table('certificates', {'isin': isin})
    if not ok:
        raise CertDatabaseError(f"Eliminazione certificato {isin} fallita")
    logger.info(f"[CERT_DB] Eliminato certificato {isin}")
    return True


def get_all_certificates():
    """Ritorna tutti i certificati con i relativi sottostanti, ordinati per
    last_updated desc. Forma: [{'certificate': {...}, 'underlyings': [...]}].
    Aggiunge l'alias 'barrier' (= barrier_abs) per compatibilità frontend."""
    resp = execute_request(
        'certificates', 'GET',
        params={'select': '*', 'order': 'last_updated.desc'},
    )
    certs = resp.json() if (resp is not None and resp.status_code == 200) else []
    if not certs:
        return []

    all_underlyings = query_table('underlyings', '*') or []
    by_isin = {}
    for u in all_underlyings:
        u_enriched = dict(u)
        u_enriched['barrier'] = u.get('barrier_abs')
        by_isin.setdefault(u['isin'], []).append(u_enriched)

    return [
        {"certificate": c, "underlyings": by_isin.get(c['isin'], [])}
        for c in certs
    ]
