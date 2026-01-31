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

### Strategia Evolutiva (Consigliata)
Per ottenere grafici "giornalieri" precisi anche con dati settimanali, si consiglia di spostare la logica di **Interpolazione su SQL** (Time Bucket Pattern):
- **Cosa fare**: Creare una query che genera una serie temporale giornaliera continua (tramite `generate_series`).
- **Come riempire i buchi**: Usare funzioni SQL come `locf()` (Last Observation Carried Forward) per proiettare l'ultimo prezzo noto sui giorni vuoti.
- **Vantaggio**: Il frontend riceve sempre una serie pulita e continua, indipendentemente dalla frequenza di caricamento dell'Excel, garantendo massima fluidità visiva.

## 5. Raccomandazione Immediata (Next Steps - Free Tier Compatible)

L'azione più efficace a costo zero è:
1.  **Spostare aggregazioni su SQL**: Smettere di scaricare tutte le transazioni in Python per le somme semplici. Usare query SQL dirette (es. `SUM`, `AVG`) per alleggerire la memoria delle Serverless Functions di Vercel (limite 1GB/10s).
2.  **Adottare TanStack Query**: Migliorare la gestione della cache lato client (gratis) per evitare chiamate ripetute al server.
