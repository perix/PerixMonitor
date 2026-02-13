# Analisi Performance, Caching e Scalabilità

## 1. Stato Attuale delle Performance

### Frontend (Client-Side)
Attualmente, l'applicazione utilizza un approccio **SPA (Single Page Application)** con Next.js.
- **Rendering**: La UI è reattiva grazie a React. I componenti complessi (grafici Recharts) vengono renderizzati lato client.
- **Caching**: È stato implementato un `PortfolioContext` che funge da store globale e cache di sessione.
    - **Meccanismo**: Alla prima visita di una pagina (es. Dashboard), i dati vengono caricati dal backend e salvati nello stato del Context. Le visite successive leggono direttamente dallo stato senza nuove chiamate API (fino al refresh della pagina o cambio portafoglio).
    - **Vantaggi**: Navigazione istantanea tra le tab, ridotto carico sul server.
    - **Limiti**: La cache è volatile (in-memory). Se l'utente preme F5, tutto viene ricaricato.

### Backend (Server-Side)
Il backend è un server Flask monolitico che agisce da proxy intelligente verso Supabase.
- **Data Processing**: Utilizza `pandas` per manipolare i dati. Questo è efficiente per dataset piccoli/medi (< 100k righe), ma computazionalmente costoso per dataset molto grandi poiché carica tutto in RAM.
- **Calcoli Finanziari**: XIRR e altri KPI vengono calcolati on-the-fly ad ogni richiesta che non colpisce la cache.

### Database (Supabase/PostgreSQL)
- **Struttura**: Tabelle relazionali standard con indici primari.
- **Query**: Le query attuali sono dirette (`SELECT * FROM transactions WHERE portfolio_id = ...`). Non ci sono aggregazioni pre-calcolate lato DB.

---

## 2. Analisi Scalabilità (Scenario "Big Data")

Se il numero di transazioni storiche dovesse crescere significativamente (> 100.000 record per portafoglio), si prevedono i seguenti colli di bottiglia:

1.  **Latenza Network**: Trasferire il JSON di tutte le transazioni dal DB al Backend e dal Backend al Frontend diventerebbe lento (payload > 5-10MB).
2.  **Memory Overhead Backend**: Pandas carica l'intero dataset in RAM per calcolare il XIRR. Flask (in modalità serverless su Vercel) ha limiti di memoria rigidi (es. 1024MB nel tier Pro, meno nel Free).
3.  **Rendering UI**: Passare migliaia di punti dati a `Recharts` può bloccare il main thread del browser, rendendo la UI scattosa.

---

## 3. Strategie di Ottimizzazione Proposte

### A. Ottimizzazione Architetturale (Backend & DB)

#### 1. Materialized Views (PostgreSQL)
Invece di calcolare sommatorie e KPI ogni volta partendo dai dati raw, si possono creare **Viste Materializzate** su Supabase che vengono aggiornate solo all'inserimento di nuovi dati (Trigger).
- **Cosa pre-calcolare**:
    - Somma totale investito per mese.
    - Valore corrente per asset type.
    - Dividendi totali per anno.
- **Vantaggio**: Le query di dashboard diventano istantanee (`SELECT * FROM dashboard_summary_mv WHERE id=...`).

#### 2. Caching (Vincolo Free Tier)
Dato il vincolo "Zero Cost/Free Tier", l'uso di Redis gestito (solitamente a pagamento o con limiti stretti) è **sconsigliato** a meno che non si utilizzi un tier gratuito (es. Upstash Free).
- **Alternativa Preferita (SQL Optimization)**: Sfruttare la potenza di PostgreSQL (già incluso in Supabase Free) per fare il "lavoro sporco".
- **Logica**:
    - Evitare di tirare fuori 50.000 righe e sommarle in Python (lento + memoria Vercel).
    - Fare `SELECT SUM(amount) FROM transactions` (Veloce + carico sul DB).
- **Materialized Views**: Sono disponibili nel piano Free di Supabase e sono la soluzione migliore per "cacheare" risultati complessi a costo zero.

### B. Ottimizzazione Frontend

#### 1. Data Downsampling
Per i grafici storici su lunghi periodi (es. 10 anni), non serve inviare al browser ogni singolo giorno.
- **Tecnica**: Il backend dovrebbe aggregare i dati (media settimanale o mensile) prima di inviarli, riducendo i punti da 3650 a ~120.

#### 2. Virtualizzazione Liste
Per la tabella delle transazioni storiche:
- **Tecnica**: Usare librerie come `react-window` o le feature di `@tanstack/react-table` per renderizzare solo le righe visibili nello schermo (DOM Recycling).
- **Vantaggio**: Il browser non crasha anche con 10.000 righe.

#### 3. Service Workers (PWA)
Implementare una cache persistente lato client (browser) più robusta del semplice Context React.
- **Tecnica**: Usare `React Query` (o TanStack Query) con persistenza su `localStorage` o `IndexedDB`.
- **Vantaggio**: I dati persistono anche se l'utente chiude e riapre il browser.

---

## 4. Tabella Riassuntiva Scenario Evolutivo

| Metrica | Scenario Attuale (< 1k transazioni) | Scenario Medio (10k - 50k) | Scenario "High Volume" (Free Tier) |
| :--- | :--- | :--- | :--- |
| **Storage DB** | Standard Tables | Indici ottimizzati | Archiviazione vecchi dati (Cold Storage) |
| **Backend Logic** | Pandas on-the-fly | SQL Aggregations | Materialized Views (Postgres) |
| **Frontend State** | React Context | TanStack Query | TanStack Query + IndexedDB |
| **Rendering Grafici** | Punti Reali | Downsampling leggero | Aggregazione Server-Side (SQL) |

## 4.1 Gestione Serie Storiche Irregolari (Price Ingestion)
Poiché l'ingestione dei prezzi è irregolare (settimanale/episodica), i grafici temporali richiedono una strategia per gestire i "buchi" nei dati senza compromettere la fluidità della UI.

### Strategia Attuale
- Il frontend collega i punti disponibili. Se i punti sono distanti (es. 1 settimana), si vede una linea retta.

### Strategia Evolutiva Implementata (Python + Pandas)
Per garantire una fluidità del 100% nei grafici anche con dati sparsi e senza accesso DDL diretto (Create Function):
- **Implementazione**: È stata inserita la funzione `get_interpolated_price_history` nel Backend.
- **Logica**:
    1.  Scarica lo storico grezzo dal DB.
    2.  Usa `pandas` per reindicizzare la serie su base giornaliera (`date_range`, `reindex`).
    3.  Applica `ffill()` (Forward Fill) per propagare l'ultimo prezzo noto nei giorni vuoti (Logic LOCF).
- **Risultato**: `dashboard.py` ora esegue lookup O(1) invece di ricerche sequenziali O(N), migliorando drasticamente la velocità di calcolo dello storico e eliminando i "buchi" visivi.

## 5. Raccomandazione Immediata (Next Steps - Free Tier Compatible)

L'azione più efficace a costo zero è:
1.  **Spostare aggregazioni su SQL**: Smettere di scaricare tutte le transazioni in Python per le somme semplici. Usare query SQL dirette (es. `SUM`, `AVG`) per alleggerire la memoria delle Serverless Functions di Vercel (limite 1GB/10s).
2.  **Adottare TanStack Query**: Migliorare la gestione della cache lato client (gratis) per evitare chiamate ripetute al server.

---

## 6. Ottimizzazioni Applicate (P0 — Febbraio 2026)

Le seguenti ottimizzazioni sono state implementate per risolvere i colli di bottiglia critici identificati nell'analisi performance.

### 6.1 Indici Database
**Migration**: `20260212190000_add_performance_indexes.sql`

Aggiunti indici sulle tabelle più interrogate per evitare full table scan:

| Indice | Tabella | Colonne | Pattern Query |
|---|---|---|---|
| `idx_transactions_portfolio_date` | `transactions` | `(portfolio_id, date)` | Dashboard, History, Memory |
| `idx_transactions_portfolio_asset` | `transactions` | `(portfolio_id, asset_id)` | Portfolio assets, XIRR |
| `idx_dividends_portfolio` | `dividends` | `(portfolio_id)` | Dashboard, Portfolio |
| `idx_dividends_portfolio_asset` | `dividends` | `(portfolio_id, asset_id)` | Memory, per-asset P&L |
| `idx_pas_portfolio_asset` | `portfolio_asset_settings` | `(portfolio_id, asset_id)` | Colori, slider settings |
| `idx_asset_notes_portfolio` | `asset_notes` | `(portfolio_id)` | Memory table |

### 6.2 Batch Price Fetching in Portfolio
**File**: `portfolio.py` → `get_portfolio_assets()`

Sostituito il pattern N+1 (`get_latest_price(isin)` in loop) con `get_latest_prices_batch(active_isins)`.
- **Prima**: 2 HTTP calls per ogni asset attivo (es. 20 asset = 40 calls)
- **Dopo**: 2 HTTP calls totali (1 per `asset_prices`, 1 per `transactions`)

### 6.3 Filtro Date Server-Side per Prezzi
**File**: `price_manager.py` → `get_interpolated_price_history_batch()`

Aggiunto filtro `date >= min_date` alle query su `asset_prices` e `transactions`. Senza filtro, tutte le righe storiche venivano scaricate anche per finestre temporali brevi.

---

## 7. Strategia Data Compaction (Pianificata)

### Scopo
Ridurre nel tempo la crescita di `asset_prices` eliminando i data point ridondanti (stessa area di prezzo, giorni consecutivi). I grafici rimangono identici grazie al LOCF (forward fill).

### Parametri Configurabili

```
# ------- PARAMETRI DATA COMPACTION -------
# Questi valori possono essere modificati per adattare la strategia
# alle esigenze dell'utente o alla crescita dei dati.

# Fascia 1: Nessuna compaction per dati recenti
COMPACTION_RECENT_MONTHS = 6          # Mesi di "alta risoluzione" (default: 6)

# Fascia 2: Rimozione punti ridondanti per dati meno recenti  
COMPACTION_THRESHOLD_PCT = 0.5        # Variazione minima (%) per considerare un
                                      # punto "significativo" (default: 0.5%)
                                      # Punti con variazione < 0.5% rispetto ai
                                      # vicini vengono rimossi.

# Fascia 3: Decimazione aggressiva per dati molto vecchi
COMPACTION_OLD_YEARS = 2              # Soglia "dati vecchi" in anni (default: 2)
COMPACTION_OLD_MAX_FREQ = 'weekly'    # Frequenza massima per dati oltre la soglia
                                      # Valori: 'daily', 'weekly', 'biweekly', 'monthly'

# Punti protetti (MAI rimossi):
# - Date coincidenti con transazioni BUY/SELL
# - Date coincidenti con dividendi
# - Massimi e minimi locali (inversioni di trend)
# - Primo e ultimo punto per ogni ISIN
```

### Trigger di Esecuzione
- **Manuale**: Endpoint `/api/admin/compact-prices` dalla pagina Manutenzione
- **Automatico (opzionale)**: Post-sync, solo se `asset_prices` > 5000 righe
### 6.4 Batch Price Sync (P1)
**File**: `api/index.py`
Sostituito il loop sequenziale di `upsert` con un'unica operazione batch alla fine del sync. Riduce drasticamente il tempo di I/O e previene timeout su Vercel Serverless.

### 6.5 LocalStorage Caching (P1)
**File**: `context/PortfolioContext.tsx`
Implementata persistenza della cache del portafoglio e della dashboard su `localStorage` con TTL di 5 minuti. Mantiene i dati tra i refresh della pagina (F5).

### 6.6 Data Compaction (P1)
**File**: `api/data_compaction.py`, `api/index.py`
Creato endpoint `/api/admin/compact-prices` per ottimizzare le dimensioni della tabella `asset_prices` eliminando dati ridondanti storici secondo la strategia tiered (Recent/Medium/Old).

### 6.7 Aggregation Views (P1)
**Migration**: `20260212190200_add_aggregation_views.sql`
Create viste SQL (`portfolio_holdings`, `dividend_totals`, `portfolio_stats`) per spostare il calcolo delle aggregazioni dal livello applicativo al database.

