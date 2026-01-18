# PerixMonitor - Architettura e Stato Corrente (v0.2.0)

## 1. Panoramica
PerixMonitor è un'applicazione web per il tracciamento del patrimonio personale (Wealth Tracker) ottimizzata per residenti fiscali italiani. 
L'obiettivo principale è l'ingestione "intelligente" di file Excel di portafoglio, la riconciliazione automatica delle transazioni e il calcolo delle performance (MWR/XIRR) utilizzando uno storico prezzi ed operazioni manuale, senza dipendere da API esterne costose o instabili.

## 2. Stack Tecnologico

### Frontend
- **Framework**: Next.js 14+ (App Router).
- **Linguaggio**: TypeScript.
- **UI & Styling**: Tailwind CSS, Shadcn/UI.
- **Design System**: Glassmorphism (Sfondi sfocati, gradienti scuri/blu), Font Serif per titoli istituzionali.
- **Localizzazione**: Interfaccia completamente in Italiano.

### Backend
- **Runtime**: Python 3.9+ (Serverless Functions su Vercel).
- **Framework API**: Flask (utilizzato come bridge per le API route).
- **Librerie Core**:
    - `pandas`: Parsing ed elaborazione dati Excel.
    - `scipy`: Calcoli finanziari (XIRR ottimizzato).
- **Logging**: Sistema di logging su file (`perix_monitor.log`) con rotazione e stack trace completi.

### Database
- **Provider**: Supabase (PostgreSQL).
- **Schema Aggiornato (v2)**:
    - `assets`: Anagrafica titoli (ISIN, Nome, Settore).
    - `transactions`: Storico operazioni (Acquisto, Vendita).
    - `dividends`: Storico Flussi di Cassa in entrata (Cedole/Dividendi).
    - `portfolios`: Contenitore logico per utente.
    - `snapshots`: Storico aggregato degli upload Excel (Valore Totale, Capitale Investito, Data Upload).
    - `asset_prices`: Storico prezzi manuale (ISIN, Prezzo, Data, Fonte). Fonte primaria: Colonna I file Excel.
    - `asset_metrics_history`: Storico calcolato performance per asset (MWRR, Valore) per grafici nel tempo.

## 3. Protocollo "Safe Ingestion" (Nuova Architettura)

Il sistema adotta un approccio "Read-Preview-Write" per evitare contaminazione del database con dati errati:

1.  **Phase 1: Ingest (Read-Only)**
    - L'utente carica il file. L'API `/api/ingest` lo legge.
    - Il sistema RILEVA il tipo file:
        - **Portfolio File (9 Colonne)**: Calcola le differenze (Delta) e estrae i PREZZI CORRENTI (Colonna I).
        - **Dividend File (3 Colonne)**: Rileva automaticamente pattern [ISIN, Valore, Data] per importazione cedole.
    - **Nessun dato viene salvato nel DB**. L'API restituisce un JSON con le proposte di modifica (`delta`, `prices_to_save`, `snapshot_proposal`).

2.  **Phase 2: Preview & Reconciliation**
    - Il Frontend mostra all'utente cosa sta per succedere (transazioni mancanti, cedole rilevate).
    - L'utente deve confermare esplicitamente.

3.  **Phase 3: Sync (Transactional Write)**
    - Solo alla conferma, il frontend invia il payload approvato all'API `/api/sync`.
    - Il backend esegue le scritture nel DB (Transazioni, Prezzi, Snapshot, Dividendi) in modo atomico o sequenziale sicuro.

## 4. Strategie di Dati

### Manual Price Ingestion
- Non usiamo API esterne (es. Yahoo Finance) per i prezzi.
- La fonte di verità è la **Colonna I ("Prezzo Corrente") del file Excel**.
- Questi prezzi vengono salvati nella tabella `asset_prices` con `source='Manual Upload'`.
- Questi prezzi alimentano sia il valore corrente del portafoglio sia lo storico per i grafici.

### Gestione Cedole e Dividendi
- File dedicato o rilevamento smart (3 colonne).
- Memorizzati in tabella `dividends`.
- Partecipano al calcolo del MWRR (XIRR) come flussi di cassa positivi.

## 5. Stato Attuale (v0.2.0)

### Funzionalità Completate
- [x] **Safe Ingestion**: Implementato protocollo Read-Preview-Write.
- [x] **Dividend Support**: Parsing file 3 colonne e tabella DB dedicata.
- [x] **Manual Prices**: Salvataggio storico prezzi da Excel.
- [x] **UI/UX**: Integrazione modali di conferma e feedback visivi.

### Prossimi Passi (Roadmap)
- [ ] **MWRR Engine**: Aggiornare il calcolo XIRR per includere i dividendi.
- [ ] **Asset History Fill**: Popolare `asset_metrics_history` durante la sync per abilitare grafici per singolo asset.
### Dashboard 2.0
- [x] **Asset Filtering**: Lista "Asset Attivi" con checkbox per filtrare il grafico MWR.
- [x] **Time Window**: Range Slider bi-direzionale per zoomare su specifici periodi temporali.
- [x] **Color Matching**: Sincronizzazione colori tra lista asset e linee del grafico.

### Ingestion Logic Refinement
- [x] **Price decoupling**: Salvataggio prezzi storici (Colonna I) anche per asset con quantità zero (Watchlist).
- [x] **Button Logic**: Fix abilitazione bottone "Conferma" su upload di soli prezzi.

### Prossimi Passi (Roadmap)
- [ ] **MWRR Engine**: Aggiornare il calcolo XIRR per includere i dividendi.
- [ ] **Asset History Fill**: Popolare `asset_metrics_history` durante la sync per abilitare grafici per singolo asset.
