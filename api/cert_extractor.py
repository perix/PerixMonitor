"""
Estrazione dati certificato a partire dall'ISIN tramite OpenAI Responses API
con tool di ricerca web (web_search) e Structured Outputs (schema Pydantic rigido).

Port di Python-analisi-Certificato/backend/extractor.py. Differenze:
- la configurazione (modello/effort) non viene da config.py ma da variabili
  d'ambiente (CERT_EXTRACTION_MODEL/CERT_REASONING_EFFORT) con fallback alla
  config centralizzata `openai_config` salvata in app_config (db_helper.get_config);
- usa il logger di PerixMonitor.

`extract_certificate_via_web(isin)` ritorna `(llm_data, cost, sources)` dove `llm_data`
ha la STESSA forma annidata consumata da cert_analyzer.analyze_certificate.
"""

import os
from datetime import datetime
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field
from openai import OpenAI

from logger import logger
from db_helper import get_config

# Default usato se né env né openai_config forniscono un modello.
# Deve supportare web_search + structured outputs (famiglia gpt-5/o-*).
DEFAULT_EXTRACTION_MODEL = "gpt-5-mini"
DEFAULT_REASONING_EFFORT = "medium"

# ==============================================================================
# PREZZI MODELLI (USD per 1M token) - stima costo estrazione (token-only).
# ==============================================================================
MODEL_PRICING = {
    "gpt-5.5":      {"input": 5.00, "output": 30.00},
    "gpt-5.4-mini": {"input": 0.25, "output": 2.00},
    "gpt-5-mini":   {"input": 0.25, "output": 2.00},
    "gpt-4o-mini":  {"input": 0.15, "output": 0.60},
}
_DEFAULT_PRICING = {"input": 5.00, "output": 30.00}


def _get_extraction_config() -> Tuple[str, str]:
    """Risolve (model, reasoning_effort) per l'estrazione certificati.
    Priorità: env CERT_* > app_config.openai_config > default."""
    model = os.getenv("CERT_EXTRACTION_MODEL")
    effort = os.getenv("CERT_REASONING_EFFORT")
    if not model:
        try:
            cfg = get_config("openai_config") or {}
        except Exception:
            cfg = {}
        model = cfg.get("model") or DEFAULT_EXTRACTION_MODEL
        if not effort:
            effort = cfg.get("reasoning_effort") or DEFAULT_REASONING_EFFORT
    return model, (effort or DEFAULT_REASONING_EFFORT)


def _calc_cost(usage, model: str) -> float:
    if usage is None:
        return 0.0
    pricing = MODEL_PRICING.get(model, _DEFAULT_PRICING)
    in_tok = getattr(usage, "input_tokens", 0) or 0
    out_tok = getattr(usage, "output_tokens", 0) or 0
    return (in_tok / 1_000_000 * pricing["input"]) + (out_tok / 1_000_000 * pricing["output"])


# ==============================================================================
# SCHEMA DI OUTPUT (Structured Outputs). Campi Optional: il modello lascia null
# ciò che non trova con una fonte, invece di inventare.
# ==============================================================================
class Underlying(BaseModel):
    name: str = Field(description="Nome del sottostante, es. 'Eni S.p.A.'")
    ticker: Optional[str] = Field(
        default=None,
        description="Miglior ticker Yahoo Finance (preferisci .MI/.PA/.DE). null se ignoto.",
    )
    strike: Optional[float] = Field(default=None, description="Prezzo strike/iniziale del sottostante.")


class CertificateExtraction(BaseModel):
    isin: str
    expiry_date: Optional[str] = Field(default=None, description="Data di scadenza in formato YYYY-MM-DD.")
    next_coupon_date: Optional[str] = Field(
        default=None, description="Prossima data di rilevamento/cedola >= oggi, formato YYYY-MM-DD."
    )
    barrier_level_percent: Optional[float] = Field(
        default=None, description="Livello barriera in percentuale (es. 60 per 60%)."
    )
    barrier_type: Optional[str] = Field(default=None, description="Tipo barriera: 'Down' o 'Up'.")
    coupon_percentage: Optional[str] = Field(default=None, description="Percentuale della cedola (es. '0.85%').")
    coupon_frequency: Optional[str] = Field(
        default=None, description="Frequenza cedola: Mensile/Trimestrale/Semestrale/Annuale."
    )
    has_memory: Optional[bool] = Field(default=None, description="True se il certificato ha effetto memoria.")
    is_autocallable: Optional[bool] = Field(default=None, description="True se il certificato è autocallable.")
    trigger_level: Optional[str] = Field(
        default=None,
        description="SOLO il livello di trigger autocall corrente come percentuale concisa, es. '100%'. "
        "Niente frasi descrittive (no 'step-down', no date): solo il valore percentuale.",
    )
    underlyings: List[Underlying] = Field(default_factory=list, description="Elenco dei sottostanti.")
    sources: List[str] = Field(
        default_factory=list, description="URL delle fonti realmente consultate per l'estrazione."
    )


def _build_prompt(isin: str) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    return f"""Agisci come un Analista Finanziario esperto di Certificati di Investimento.
Dato il certificato con ISIN {isin}, CERCA SUL WEB i dati ufficiali e aggiornati e compilali nello schema richiesto.
Data di oggi (per i calcoli sulle date): {today}.

FONTI DA CONSULTARE (in quest'ordine di priorità):
1. La scheda su certificatiederivati.it: https://www.certificatiederivati.it/db_bs_scheda_certificato.asp?isin={isin}
2. Borsa Italiana (SeDeX / CERT-X): cerca l'ISIN su borsaitaliana.it
3. Il KID / factsheet dell'emittente (documento ufficiale del prodotto)
4. CedLab (cedlab.it) o altre schede certificati affidabili

REGOLE DI ESTRAZIONE:
- expiry_date: data di scadenza del certificato (YYYY-MM-DD).
- barrier_level_percent: livello della barriera in percentuale (numero, es. 60). barrier_type: 'Down' o 'Up'.
- underlyings: per ogni sottostante indica name, il miglior ticker Yahoo Finance (preferisci .MI/.PA/.DE per titoli europei) e lo strike iniziale.
- coupon_percentage, coupon_frequency (Mensile/Trimestrale/Semestrale/Annuale), has_memory (effetto memoria).
- next_coupon_date: la prima data di rilevamento/pagamento cedola >= {today} (YYYY-MM-DD).
- is_autocallable e trigger_level: per trigger_level indica SOLO la percentuale del trigger autocall corrente (es. '100%'), senza descrizioni testuali, step-down o date.
- sources: elenca gli URL che hai effettivamente consultato.

IMPORTANTE: NON inventare dati. Se un'informazione non è reperibile da una fonte affidabile, lasciala null.
Verifica i numeri (barriera, strike, cedola) confrontando più fonti quando possibile."""


def _to_llm_data(parsed: CertificateExtraction) -> dict:
    """Converte lo schema piatto nella forma annidata attesa da analyze_certificate,
    OMETTENDO i campi None nei sotto-oggetti così che i .get(..., default) a valle
    applichino gli stessi default del comportamento storico."""
    barrier = {}
    if parsed.barrier_level_percent is not None:
        barrier["level_percent"] = parsed.barrier_level_percent
    if parsed.barrier_type is not None:
        barrier["type"] = parsed.barrier_type

    coupon = {}
    if parsed.coupon_percentage is not None:
        coupon["percentage"] = parsed.coupon_percentage
    if parsed.coupon_frequency is not None:
        coupon["frequency"] = parsed.coupon_frequency
    if parsed.has_memory is not None:
        coupon["has_memory"] = parsed.has_memory

    features = {}
    if parsed.is_autocallable is not None:
        features["is_autocallable"] = parsed.is_autocallable
    if parsed.trigger_level is not None:
        features["trigger_level"] = parsed.trigger_level

    return {
        "isin": parsed.isin,
        "expiry_date": parsed.expiry_date,
        "next_coupon_date": parsed.next_coupon_date,
        "barrier": barrier,
        "coupon": coupon,
        "features": features,
        "underlyings": [
            {"name": u.name, "ticker": u.ticker, "strike": u.strike} for u in parsed.underlyings
        ],
    }


def _is_reasoning_model(model: str) -> bool:
    """True se il modello supporta il parametro reasoning (famiglia gpt-5.x e serie o-*)."""
    m = (model or "").lower()
    return m.startswith("gpt-5") or m.startswith(("o1", "o3", "o4"))


def extract_certificate_via_web(isin: str) -> Tuple[dict, float, List[str]]:
    """Estrae i dati del certificato dato l'ISIN usando la Responses API con web_search.
    Ritorna (llm_data, cost, sources). Solleva un'eccezione su errore di chiamata API."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY non configurata")

    model, effort = _get_extraction_config()
    client = OpenAI(api_key=api_key, timeout=180.0)

    params = dict(
        model=model,
        tools=[{"type": "web_search"}],
        input=_build_prompt(isin),
        text_format=CertificateExtraction,
    )
    if _is_reasoning_model(model):
        params["reasoning"] = {"effort": effort}
        logger.info(f"[CERT_EXTRACT] Estrazione web {isin} (model={model}, effort={effort})")
    else:
        logger.info(f"[CERT_EXTRACT] Estrazione web {isin} (model={model}, non-reasoning)")

    response = client.responses.parse(**params)

    parsed: CertificateExtraction = response.output_parsed
    if parsed is None:
        raise RuntimeError("Il modello non ha restituito un output strutturato valido.")

    cost = _calc_cost(getattr(response, "usage", None), model)
    sources = list(dict.fromkeys(parsed.sources or []))  # dedup mantenendo l'ordine

    logger.info(
        f"[CERT_EXTRACT] {isin}: {len(parsed.underlyings)} sottostanti, "
        f"{len(sources)} fonti, costo stimato ${cost:.6f}"
    )
    return _to_llm_data(parsed), cost, sources
