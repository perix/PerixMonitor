# Analisi codice PerixMonitor: errori logici, incoerenze e colli di bottiglia

## Obiettivo
Questo documento raccoglie un'analisi tecnica del backend di PerixMonitor con focus su:
- errori reali o regressioni,
- incoerenze logiche nel trattamento dati,
- colli di bottiglia prestazionali,
- proposte di patch concrete e a basso rischio.

---

## Ambito analizzato
Moduli principali analizzati:
- `api/ingest.py`
- `api/index.py`
- `api/dashboard.py`
- `api/price_manager.py`
- `api/db_helper.py`
- test Python in `tests/`

Comandi principali usati durante l'analisi:
- `pytest -q`
- `rg "def calculate_delta|calculate_delta\(" -n api tests`
- lettura puntuale dei file con `nl -ba ... | sed -n ...`

---

## Problemi rilevati

### 1) Regressione test: funzione `calculate_delta` mancante
**Descrizione**
I test storici importano `calculate_delta` da `api.ingest` (o `ingest`), ma la funzione non è più presente.

**Evidenza**
- `tests/test_ingest_extended.py`
- `tests/test_reconciliation_logic.py`
- `pytest -q` fallisce già in fase di collection per `ImportError`.

**Impatto**
- La suite di regressione su ingestione/riconciliazione è attualmente inutilizzabile.
- Alto rischio di introdurre bug senza feedback automatico.

**Priorità**: Alta

---

### 2) Bug logico su prezzo più recente in `price_manager` (RISOLTO - 23/03/2026)
**Descrizione**
Il motore di calcolo del trend (`update_asset_trend`) è stato integralmente rivisto. Ora esegue una query esplicita sullo storico del database per recuperare i due prezzi più recenti cronologicamente, garantendo che il delta calcolato sia sempre basato sulla realtà storica, anche in caso di aggiornamenti a date intermedie o caricamenti non sequenziali.

**Impatto**
- Possibili errori nelle metriche e nelle decisioni che dipendono dall'ultimo prezzo.
- Potenziale incoerenza tra viste diverse del sistema.

**Priorità**: Alta

---

### 3) Parsing date ambiguo in ingestione
**Descrizione**
In `parse_date`, il comportamento cambia in base alla presenza di `/`:
- con `/` usa `dayfirst=True`,
- senza `/` usa parsing generico.

Questo può introdurre ambiguità su date come `01-02-2024`.

**Impatto**
- Possibili errori silenziosi su ordinamento cronologico e calcoli finanziari (MWR/XIRR).

**Priorità**: Media-Alta

---

### 4) Semantica errore vendite eccedenti: scelta valida ma da uniformare
**Descrizione**
In `validate_transactions_chronology`, una vendita che porterebbe quantità negativa viene trasformata in `ERROR_NEGATIVE_QTY` e mantenuta in output per preview, anziché bloccare l'intero file.

**Impatto**
- Approccio utile lato UX (mostra tutte le anomalie),
- ma va uniformato con frontend, sync e test per evitare discrepanze di comportamento.

**Priorità**: Media

---

## Colli di bottiglia e opportunità performance

### A) Lookup colonne ripetuto su ogni riga (ingest)
`find_column(...)` viene richiamata ripetutamente dentro i loop per ogni record.

**Effetto**
- Overhead CPU evitabile su file grandi.

**Miglioria**
- Risolvere la mappa colonne una sola volta prima del loop.

---

### B) Batch prezzi: volume dati potenzialmente eccessivo
In `get_latest_prices_batch` si recuperano molte righe e poi si usa pandas per trovare l'ultima per ISIN.

**Effetto**
- Crescita costi CPU/RAM con storico ampio.

**Miglioria**
- Spostare il calcolo “latest per isin” nel DB (vista/materialized view o query dedicata).

---

### C) Dashboard summary ricalcolata interamente a ogni richiesta
`calculate_portfolio_summary` ricalcola holdings/cash-flow da tutte le transazioni/dividendi ogni volta.

**Effetto**
- Latenza crescente col numero di movimenti.

**Miglioria**
- Caching breve,
- pre-aggregazioni,
- calcolo incrementale dopo sync.

---

### D) DB helper senza session pooling / retry policy
`execute_request` usa chiamate HTTP singole senza una sessione persistente e senza backoff centralizzato.

**Effetto**
- Overhead connessioni,
- minore resilienza a errori transienti.

**Miglioria**
- Introdurre `requests.Session` condivisa e retry/backoff.

---

## Proposta patch (quick wins + stabilizzazione)

## Fase 1 — Fix immediati ad alto valore
1. **Fix `get_latest_price`**
   - cambiare `history[-1]` in `history[0]`.
2. **Ripristino regressione test**
   - reintrodurre `calculate_delta` in `api/ingest.py` come funzione compatibile con i test esistenti,
   - oppure, in alternativa, aggiornare test e farli puntare al flusso API nuovo.

> Raccomandazione: compat-layer `calculate_delta` + test aggiornati in seconda fase (minor rischio).

## Fase 2 — Coerenza logica dati
3. **Refactor `parse_date`**
   - parsing esplicito con ordine di tentativi controllato,
   - warning sui formati ambigui,
   - test parametrizzati per i formati frequenti.
4. **Allineamento semantico errori ingest**
   - definire chiaramente il contratto: cosa va in preview, cosa può essere sincronizzato, cosa blocca il salvataggio.

## Fase 3 — Performance/scalabilità
5. **Ottimizzare latest prices lato DB**
6. **Caching summary/dashboard**
7. **Sessione HTTP + retry in db_helper**

---

## Piano di validazione consigliato
- Test automatici:
  - `pytest -q`
- Verifiche mirate:
  - test unitario su `get_latest_price`,
  - test ingest su vendite eccedenti e mismatch quantità,
  - test parsing date ambiguo.
- Smoke test API:
  - endpoint ingest preview,
  - endpoint dashboard summary.

---

## Conclusione
Il sistema è strutturalmente solido ma presenta alcuni punti critici:
- una regressione test importante (`calculate_delta`),
- un bug funzionale concreto (`get_latest_price`),
- alcune aree di robustezza/performance migliorabili.

Con la patch proposta in 3 fasi è possibile ottenere un miglioramento rapido della qualità e ridurre il rischio operativo, mantenendo basso l'impatto sul comportamento utente.
