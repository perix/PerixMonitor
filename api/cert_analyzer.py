"""
Motore di analisi dei Certificati (port di Python-analisi-Certificato/backend/analyzer.py).

Differenze rispetto all'originale:
- usa il logger di PerixMonitor (niente logging.basicConfig dedicato);
- persistenza via cert_db (REST), non psycopg2;
- rimosso l'import inutile di BeautifulSoup e il meccanismo di override su file
  (ticker_overrides.json): gli override vivono solo nella colonna DB corrected_ticker.

API principale:
- analyze_certificate(isin, force_refresh=False): cache-first; se non in cache estrae
  dal web (LLM + web_search) e arricchisce con prezzi live; calcola Worst-Of.
- get_enriched_cached_analysis(isin): legge dalla cache DB e aggiorna solo i prezzi live.
- get_live_price(ticker): prezzo live via Yahoo Finance.
"""

import os
from datetime import datetime
from typing import Optional

import yfinance as yf
from openai import OpenAI

from logger import logger
import cert_db as database
from cert_extractor import extract_certificate_via_web


# ==============================================================================
# FUNZIONALITÀ LLM (fallback ticker)
# ==============================================================================

def calculate_llm_cost(input_tokens, output_tokens, model):
    if model == "gpt-5-mini":
        return (input_tokens / 1_000_000 * 0.25) + (output_tokens / 1_000_000 * 2.00)
    return (input_tokens / 1_000_000 * 0.15) + (output_tokens / 1_000_000 * 0.60)


def get_ticker_suggestions(asset_name):
    """Suggerisce ticker Yahoo Finance alternativi via LLM quando il ticker primario
    non restituisce un prezzo. Ritorna (lista_ticker, costo)."""
    logger.info(f"[CERT-Suggest] Ricerca ticker alternativi per '{asset_name}'...")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return [], 0.0
    client = OpenAI(api_key=api_key)

    prompt = f"""
Trova i ticker corretti utilizzati su Yahoo Finance per l'asset '{asset_name}' (mercato italiano o europeo).
Usa le tue capacità per verificare i ticker più recenti e accurati privilegiando .MI, .PA, .DE.
Limitati a fornire come risposta solo un JSON con i ticker trovati in ordine di utilità.
Esempio:
{{
  "tickers": ["STMMI.MI", "STM.PA", "STLAM.MI"]
}}
"""
    try:
        import json
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)
        tickers = data.get("tickers", [])
        usage = response.usage
        cost = calculate_llm_cost(usage.prompt_tokens, usage.completion_tokens, "gpt-4o-mini")
        logger.info(f"[CERT-Suggest] Suggerimenti: {tickers}. Costo: ${cost:.6f}")
        return tickers, cost
    except Exception as e:
        logger.error(f"[CERT-Suggest] Errore: {e}")
        return [], 0.0


# ==============================================================================
# RECUPERO PREZZI (Yahoo Finance)
# ==============================================================================

def get_live_price(ticker):
    """Prezzo live per un ticker. Ritorna float arrotondato o None (degrada con grazia
    in caso di errore/rate-limit/ticker errato, senza propagare eccezioni)."""
    if not ticker:
        return None
    logger.info(f"[YFinance] Recupero prezzo per {ticker}...")
    try:
        asset = yf.Ticker(ticker)
        # 1. Tentativo Real-Time (fast_info)
        try:
            info = asset.fast_info
            if 'lastPrice' in info:
                price = info['lastPrice']
                if price is not None and price == price:  # not NaN
                    return round(float(price), 4)
        except Exception:
            pass

        # 2. Tentativo History
        for period in ["1d", "5d"]:
            try:
                hist = asset.history(period=period)
                if not hist.empty:
                    last_price = float(hist["Close"].iloc[-1])
                    if last_price == last_price:  # not NaN
                        return round(last_price, 4)
            except Exception:
                continue
        logger.warning(f"[YFinance] Nessun prezzo trovato per {ticker}")
        return None
    except Exception as e:
        logger.error(f"[YFinance] Errore per {ticker}: {e}")
        return None


# ==============================================================================
# UTILITY
# ==============================================================================

def format_date(date_str):
    """Formattazione date GG/MM/AAAA (standard applicativo)."""
    if not date_str or str(date_str).lower() in ["null", "nan", "none", ""]:
        return "N.D."
    date_str = str(date_str).strip()

    if 'T' in date_str:
        date_str = date_str.split('T')[0]

    normalized = date_str.replace('-', '/').replace('.', '/')
    parts = [p for p in normalized.split('/') if p]

    if len(parts) == 3:
        if len(parts[0]) == 4:  # YYYY/MM/DD -> GG/MM/AAAA
            return f"{parts[2].zfill(2)}/{parts[1].zfill(2)}/{parts[0]}"
        return f"{parts[0].zfill(2)}/{parts[1].zfill(2)}/{parts[2]}"

    return date_str


# ==============================================================================
# MAIN ENGINE
# ==============================================================================

def get_enriched_cached_analysis(isin):
    """Legge i dati dalla cache DB e aggiorna SOLO i prezzi live, ricalcolando
    le distanze dalla barriera e il Worst-Of. Ritorna None se l'ISIN non è in cache."""
    cached = database.get_cached_analysis(isin)
    if not cached:
        return None

    logger.info(f"[Cache] Dati trovati nel DB per {isin}. Recupero solo prezzi live.")
    cert = cached['certificate']
    underlyings_db = cached['underlyings']

    processed_underlyings = []
    for u in underlyings_db:
        ticker_to_use = u.get('corrected_ticker') or u.get('original_ticker')
        current = get_live_price(ticker_to_use)

        barrier_abs = float(u['barrier_abs']) if u.get('barrier_abs') else 0.0
        if current and current > 0 and barrier_abs > 0:
            dist = round((current - barrier_abs) / current * 100.0, 2)
        else:
            dist = None

        processed_underlyings.append({
            "name": u.get('name'),
            "ticker": ticker_to_use,
            "original_ticker": u.get('original_ticker'),
            "strike": float(u['strike']) if u.get('strike') else 0.0,
            "barrier": barrier_abs,
            "current": current,
            "dist": dist,
        })

    valid_underlyings = [u for u in processed_underlyings if u['current'] is not None]
    worst_of = None
    overall_status = "N.D."
    if valid_underlyings:
        worst_of = min(valid_underlyings, key=lambda x: x['dist'] if x['dist'] is not None else 999)
        overall_status = "OK" if (worst_of['dist'] is not None and worst_of['dist'] > 0) else "BARRIERA ROTTA"

    return {
        "isin": isin,
        "expiry_date": format_date(cert.get('expiry_date')),
        "barrier_level": f"{cert.get('barrier_pct')}%",
        "barrier_type": cert.get('barrier_type'),
        "underlyings": processed_underlyings,
        "coupon_pct": cert.get('coupon_pct'),
        "coupon_freq": cert.get('coupon_freq'),
        "has_memory": cert.get('has_memory'),
        "is_autocallable": cert.get('is_autocallable'),
        "trigger_level": cert.get('trigger_level'),
        "next_coupon_date": format_date(cert.get('next_coupon_date')),
        "worst_of": worst_of,
        "overall_status": overall_status,
        "total_cost": 0.0,
        "last_updated": cert.get('last_updated'),
        "from_cache": True,
    }


def analyze_certificate(isin, force_refresh=False):
    """Analizza un certificato. Cache-first: se presente in DB (e non force_refresh)
    ritorna i dati in cache con prezzi aggiornati. Altrimenti estrae dal web (LLM +
    web_search), arricchisce con i prezzi live e calcola il Worst-Of.

    NB: il salvataggio su DB del risultato fresco è responsabilità del chiamante
    (vedi assets.py / cert_routes.py)."""
    logger.info(f"=== INIZIO ANALISI ISIN: {isin} (Force: {force_refresh}) ===")

    if not force_refresh:
        enriched = get_enriched_cached_analysis(isin)
        if enriched:
            return enriched

    # Estrazione web (Responses API + Structured Outputs)
    try:
        llm_data, cost, sources = extract_certificate_via_web(isin)
    except Exception as e:
        logger.error(f"[Main] Errore estrazione web: {e}")
        return {"error": f"Errore durante l'estrazione AI: {str(e)}"}

    barrier_val_pct = 60.0
    if llm_data.get('barrier') and llm_data['barrier'].get('level_percent'):
        try:
            val_str = str(llm_data['barrier'].get('level_percent')).replace('%', '').replace(',', '.')
            barrier_val_pct = float(val_str)
        except Exception:
            pass

    total_cost = cost
    underlyings = []
    logger.info(f"[Market] Arricchimento dati per {len(llm_data.get('underlyings', []))} sottostanti")

    for u in llm_data.get('underlyings', []):
        name = u.get('name', 'N/A')
        ticker = u.get('ticker')
        strike = u.get('strike')

        if ticker and strike:
            current = get_live_price(ticker)

            if not current:
                logger.warning(f"[Market] Ticker {ticker} fallito. Fallback AI per {name}")
                suggestions, s_cost = get_ticker_suggestions(name)
                total_cost += s_cost
                for sug in suggestions:
                    sug = sug.strip().upper()
                    if sug != ticker:
                        current = get_live_price(sug)
                        if current:
                            logger.info(f"[Market] Ticker funzionante trovato: {sug}")
                            ticker = sug
                            break

            barrier_val = strike * (barrier_val_pct / 100)
            dist = 0.0
            if current and current > 0:
                dist = (current - barrier_val) / current * 100.0

            underlyings.append({
                "name": name,
                "ticker": ticker,
                "strike": strike,
                "barrier": barrier_val,
                "current": current,
                "dist": round(dist, 2) if current else None,
            })

    valid_underlyings = [u for u in underlyings if u['current'] is not None]
    worst_of = None
    overall_status = "N.D."
    if valid_underlyings:
        worst_of = min(valid_underlyings, key=lambda x: x['dist'])
        overall_status = "OK" if worst_of['dist'] > 0 else "BARRIERA ROTTA"
        logger.info(f"[Result] Worst-of: {worst_of['name']} dist {worst_of['dist']}%")
    else:
        logger.warning("[Result] Impossibile determinare Worst-Of (nessun prezzo valido)")

    result = {
        "isin": isin,
        "expiry_date": format_date(llm_data.get('expiry_date')),
        "barrier_level": f"{barrier_val_pct}%",
        "barrier_type": llm_data.get('barrier', {}).get('type', 'Down'),
        "underlyings": underlyings,
        "coupon_pct": llm_data.get('coupon', {}).get('percentage', 'N.D.'),
        "coupon_freq": llm_data.get('coupon', {}).get('frequency', 'N.D.'),
        "has_memory": llm_data.get('coupon', {}).get('has_memory', False),
        "is_autocallable": llm_data.get('features', {}).get('is_autocallable', False),
        "trigger_level": llm_data.get('features', {}).get('trigger_level', 'N.D.'),
        "next_coupon_date": format_date(llm_data.get('next_coupon_date')),
        "worst_of": worst_of,
        "overall_status": overall_status,
        "total_cost": round(total_cost, 6),
        "sources": sources,
        "from_cache": False,
    }

    logger.info(f"=== FINE ANALISI ISIN: {isin} (Costo: ${total_cost:.6f}) ===")
    return result
