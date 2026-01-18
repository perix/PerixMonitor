# PerixMonitor - Architettura e Stato Corrente (v0.1.0)

## 1. Panoramica
PerixMonitor è un'applicazione web per il tracciamento del patrimonio personale (Wealth Tracker) ottimizzata per residenti fiscali italiani. 
L'obiettivo principale è l'ingestione "intelligente" di file Excel di portafoglio, la riconciliazione automatica delle transazioni e il calcolo delle performance (MWR/XIRR).

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
- **Schema**:
    - `assets`: Anagrafica titoli (ISIN, Nome, Settore).
    - `transactions`: Storico operazioni (Acquisto, Vendita, Dividendo).
    - `portfolios`: Contenitore logico per utente.
    - `snapshots`: Storico degli upload Excel.
    - `asset_prices`: Storico prezzi manuale (ISIN, Prezzo, Data, Fonte).

## 3. Flusso di Ingestione (Smart Ingestion)

Il cuore dell'applicazione è la logica di riconciliazione automatica (`api/ingest.py`):

1.  **Parsing**: Il file Excel caricato viene letto da Pandas.
2.  **Delta Calculation**:
    - Il sistema confronta lo stato attuale del DB con le quantità presenti nell'Excel.
    - **Differenze Positive** (`Excel > DB`): Interpretate come **ACQUISTI** (se sono presenti data e prezzo nel file).
    - **Differenze Negative** (`Excel < DB`): Interpretate come **VENDITE**.
    - **Nuovi Asset**: Se un ISIN è nuovo ma mancano dettagli (Data/Prezzo), viene segnato come `INCONSISTENT_NEW_ISIN`.
    - **Asset Mancanti**: Se un ISIN è nel DB ma non nell'Excel, viene segnato come `MISSING_FROM_UPLOAD` (possibile vendita totale).
3.  **Riconciliazione UI**:
    - Una modale (Dialog) mostra all'utente le modifiche rilevate.
    - L'utente deve confermare manualmente le date e i prezzi per le "Vendite totali" (dato che non sono nel file Excel).
    - Gli "Aggiornamenti validi" vengono mostrati per primi.
    - Gli errori bloccanti sono in fondo.

## 4. Stato Attuale (v0.1.0 - UI Verified)

### Funzionalità Completate
- [x] **Setup Progetto**: Configurazione Next.js + Python + Supabase.
- [x] **UI/UX**: Landing page moderna, Modali reattive, localizzazione Italiana completa.
- [x] **Ingestione Backend**: Logica di calcolo differenziale e gestione errori robusta.
- [x] **Logging**: File di log dettagliato per debug backend.
- [x] **Reset DB**: Funzionalità (simulata) per pulire il database da UI.

### Prossimi Passi (Roadmap)
- [ ] **Persistenza**: Collegare l'endpoint `/api/sync` a Supabase per salvare effettivamente le transazioni.
- [ ] **Dashboard**: Creare grafici a torta (Allocazione) e a linea (Andamento Valore).
- [ ] **Market Data**: Arricchire i dati degli asset (Nomi, Settori) usando database interno popolato da Excel.
