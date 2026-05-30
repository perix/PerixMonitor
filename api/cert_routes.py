"""
Rotte di dominio per i Certificati (pagina "Certificati" + azioni di modifica).

Blueprint separato da assets.py: assets.py espone solo /api/assets/<isin>/external
(usato dal pannello dettaglio del Portafoglio), mentre qui vivono le operazioni di
gestione della "base dati certificati": lista, refresh, modifica, eliminazione.
"""

from flask import Blueprint, request, jsonify

from logger import logger
import cert_db
from cert_analyzer import analyze_certificate, get_live_price

certificates_bp = Blueprint('certificates', __name__)


def _enrich_underlyings(underlyings):
    """Arricchisce ogni sottostante con prezzo live (`current`) e distanza % dalla
    barriera (`dist`, segno +/-), recuperando i prezzi una sola volta per ticker.
    Ritorna (lista_arricchita, worst_dist) dove worst_dist è la distanza minima
    (None se nessun prezzo disponibile). Stessa formula di get_enriched_cached_analysis."""
    enriched = []
    worst = None
    for u in underlyings:
        ticker = u.get('corrected_ticker') or u.get('original_ticker')
        barrier_abs = u.get('barrier_abs') or u.get('barrier')
        current = get_live_price(ticker)
        dist = None
        if current and current > 0 and barrier_abs:
            try:
                dist = round((current - float(barrier_abs)) / current * 100.0, 2)
                if worst is None or dist < worst:
                    worst = dist
            except Exception:
                dist = None
        enriched.append({**u, "current": current, "dist": dist})
    return enriched, worst


@certificates_bp.route('/api/certificates', methods=['GET'])
def list_certificates():
    """Elenca tutti i certificati in DB (master data globale). Ogni voce è arricchita
    con la distanza Worst-Of live (best-effort). Query param opzionale ?live=false per
    saltare il recupero prezzi (lista più veloce)."""
    try:
        include_live = request.args.get('live', 'true').lower() != 'false'
        certs = cert_db.get_all_certificates()

        result = []
        for entry in certs:
            cert = entry['certificate']
            underlyings = entry['underlyings']
            if include_live:
                underlyings, worst_dist = _enrich_underlyings(underlyings)
            else:
                worst_dist = None
            result.append({
                **cert,
                "underlyings": underlyings,
                "underlyings_count": len(underlyings),
                "worst_dist": worst_dist,
            })

        return jsonify(certificates=result)
    except Exception as e:
        logger.error(f"CERT LIST ERROR: {e}")
        return jsonify(error=str(e)), 500


@certificates_bp.route('/api/certificates/<isin>/refresh', methods=['POST', 'OPTIONS'])
def refresh_certificate(isin):
    """Forza la ri-analisi dal web (LLM) e salva il risultato in DB."""
    if request.method == 'OPTIONS':
        return jsonify(status="ok"), 200
    try:
        result = analyze_certificate(isin, force_refresh=True)
        if result.get('error'):
            return jsonify(result), 502
        cert_db.save_analysis(result)
        result['from_cache'] = False
        return jsonify(result)
    except Exception as e:
        logger.error(f"CERT REFRESH ERROR {isin}: {e}")
        return jsonify(error=str(e)), 500


@certificates_bp.route('/api/certificates/<isin>', methods=['PATCH'])
def patch_certificate(isin):
    """Aggiorna parzialmente i campi whitelisted del certificato."""
    try:
        fields = request.json or {}
        updated = cert_db.update_certificate_fields(isin, fields)
        if not updated:
            return jsonify(error="Nessun campo valido da aggiornare"), 400
        return jsonify(status="ok", isin=isin)
    except Exception as e:
        logger.error(f"CERT PATCH ERROR {isin}: {e}")
        return jsonify(error=str(e)), 500


@certificates_bp.route('/api/certificates/<isin>/ticker', methods=['POST', 'OPTIONS'])
def set_ticker_override(isin):
    """Imposta l'override manuale del ticker per un sottostante.
    Body: {old_ticker, new_ticker}."""
    if request.method == 'OPTIONS':
        return jsonify(status="ok"), 200
    try:
        data = request.json or {}
        old_ticker = data.get('old_ticker')
        new_ticker = (data.get('new_ticker') or '').strip().upper()
        if not old_ticker or not new_ticker:
            return jsonify(error="old_ticker e new_ticker sono obbligatori"), 400
        cert_db.update_ticker_override(isin, old_ticker, new_ticker)
        return jsonify(status="ok", isin=isin, old_ticker=old_ticker, new_ticker=new_ticker)
    except Exception as e:
        logger.error(f"CERT TICKER ERROR {isin}: {e}")
        return jsonify(error=str(e)), 500


@certificates_bp.route('/api/certificates/<isin>', methods=['DELETE'])
def delete_certificate_route(isin):
    """Elimina il certificato e i suoi sottostanti."""
    try:
        cert_db.delete_certificate(isin)
        return jsonify(status="ok", deleted=isin)
    except Exception as e:
        logger.error(f"CERT DELETE ERROR {isin}: {e}")
        return jsonify(error=str(e)), 500


@certificates_bp.route('/api/certificates/price/<ticker>', methods=['GET'])
def get_ticker_price(ticker):
    """Prezzo live di un ticker (per calcoli/anteprime lato UI)."""
    try:
        price = get_live_price(ticker)
        return jsonify(ticker=ticker, price=price)
    except Exception as e:
        logger.error(f"CERT PRICE ERROR {ticker}: {e}")
        return jsonify(error=str(e)), 500
