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

#### 2. Redis per Caching Semplice
Per dati costosi da calcolare che cambiano raramente (es. Performance YTD o grafici storici complessi):
- **Implementazione**: Inserire un'istanza Redis (es. Upstash per serverless) tra Flask e Supabase.
- **Logica**:
    1.  Request arriva a Flask.
    2.  Check Redis: esiste chiave `portfolio_123_history`?
    3.  Se SI -> Ritorna JSON (5ms).
    4.  Se NO -> Calcola, salva in Redis con TTL (es. 1 ora), ritorna JSON.
- **Vantaggio**: Riduce drasticamente il carico cpu su Flask.

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

| Metrica | Scenario Attuale (< 1k transazioni) | Scenario Medio (10k - 50k) | Scenario Enterprise (> 100k) |
| :--- | :--- | :--- | :--- |
| **Storage DB** | Standard Tables | Indici ottimizzati | Partitioning per anno |
| **Backend Logic** | Pandas on-the-fly | Caching (Redis) | Pre-aggregazione (ETL/Materialized Views) |
| **Frontend State** | React Context | React Query | React Query + IndexedDB |
| **Rendering Grafici** | Punti Reali | Downsampling leggero | Aggregazione Aggressiva (LTTB algo) |

## 5. Raccomandazione Immediata (Next Steps)

Non è necessario introdurre Redis o complessità eccessiva oggi. L'azione più efficace a costo zero è:
1.  **Adottare TanStack Query** (ex React Query) al posto del Context artigianale nel frontend. Gestisce caching, background refetching e deduping delle richieste "out of the box".
2.  **Spostare aggregazioni semplici su SQL**: Invece di scaricare tutte le transazioni in Python per sommarle, fare `SELECT SUM(amount) ...` direttamente in SQL.
