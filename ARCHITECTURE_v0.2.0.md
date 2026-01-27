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

### Backend (Python API Server)

> [!NOTE]
> **Per i non addetti ai lavori**: L'applicazione è composta da **due server separati** che lavorano insieme. Il primo (Next.js) gestisce l'interfaccia grafica; il secondo (Python/Flask) esegue i calcoli complessi e comunica con il database.

#### Architettura a Due Server

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTENTE (Browser)                         │
│                     http://localhost:3000                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER 1: FRONTEND                           │
│                    Next.js (porta 3000)                         │
│                                                                 │
│  • Mostra l'interfaccia grafica (pagine, bottoni, grafici)     │
│  • Riceve input dall'utente (click, upload file)               │
│  • NON esegue calcoli complessi                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Richieste HTTP (es. /api/dashboard/summary)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER 2: BACKEND                            │
│                    Python/Flask (porta 5328)                    │
│                                                                 │
│  • Elabora file Excel caricati                                 │
│  • Calcola performance finanziarie (XIRR, MWR)                 │
│  • Legge/scrive dati nel database Supabase                     │
│  • Risponde con dati JSON al frontend                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE                                     │
│                    Supabase (PostgreSQL Cloud)                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Come Avviare l'Applicazione (Sviluppo Locale)

Per far funzionare PerixMonitor in locale, **entrambi i server devono essere attivi**:

| Comando | Server | Porta | Scopo |
|---------|--------|-------|-------|
| `npm run dev` | Frontend (Next.js) | 3000 | Interfaccia utente |
| `python api/index.py` | Backend (Flask) | 5328 | Logica di business e database |

> [!IMPORTANT]
> Se avvii solo il frontend senza il backend Python, vedrai errori del tipo `ECONNREFUSED 127.0.0.1:5328` perché il frontend non riesce a contattare l'API.

#### Struttura dei File Backend

```
api/
├── index.py          # Entry point principale - avvia Flask e registra tutte le route
├── dashboard.py      # API per la pagina Dashboard (grafici, KPI, storico)
├── portfolio.py      # Gestione portafogli (crea, elimina, lista)
├── assets.py         # Gestione anagrafica titoli
├── ingest.py         # Parsing file Excel
├── finance.py        # Calcoli finanziari (XIRR)
├── price_manager.py  # Salvataggio storico prezzi
├── llm_asset_info.py # Integrazione AI per info asset (OpenAI)
├── supabase_client.py# Connessione al database
└── logger.py         # Sistema di logging
```

#### Principali Endpoint API

| Endpoint | Metodo | Funzione |
|----------|--------|----------|
| `/api/ingest` | POST | Riceve file Excel, lo analizza, restituisce anteprima |
| `/api/sync` | POST | Conferma e salva transazioni/prezzi nel database |
| `/api/dashboard/summary` | GET | Restituisce KPI aggregati del portafoglio |
| `/api/dashboard/history` | GET | Restituisce storico performance per i grafici |
| `/api/portfolios` | POST/DELETE | Crea o elimina un portafoglio |
| `/api/admin/users` | GET | Lista utenti (solo admin) |

#### Tecnologie Utilizzate

- **Runtime**: Python 3.9+
- **Framework API**: Flask (micro-framework web leggero)
- **Librerie Core**:
    - `pandas`: Parsing ed elaborazione dati Excel
    - `scipy`: Calcoli finanziari (XIRR ottimizzato)
    - `openai`: Integrazione con modelli AI per arricchimento dati asset
- **Logging**: Sistema di logging su file (`perix_monitor.log`) con rotazione e stack trace completi

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
- La fonte di verità è la **Colonna I ("Prezzo Corrente") del file Excel**.
- Questi prezzi vengono salvati nella tabella `asset_prices` con `source='Manual Upload'`.
- Questi prezzi alimentano sia il valore corrente del portafoglio sia lo storico per i grafici.

### Client-Side Caching (Performance)
- **Problem**: La navigazione tra Dashboard e Portafoglio causava ricaricamenti ridondanti dei dati.
- **Solution**: Implementata una cache a livello di `PortfolioContext`.
    - **Dashboard Cache**: Memorizza Summary, History e Settings per ogni Portafoglio visitato.
    - **Portfolio Cache**: Memorizza lista Asset e dettagli Portafoglio.
- **Invalidation**: La cache viene invalidata automaticamente al caricamento di nuovi dati (Ingest) o alla modifica delle impostazioni.
- **Persistence**: I dati rimangono in memoria per la sessione corrente (o fino al reload pagina), garantendo navigazione istantanea.

### Gestione Cedole, Dividendi e Spese
- **Rilevamento File**: Identificazione automatica tramite intestazione colonna C ("Data Flusso") o struttura a 3 colonne.
- **Formato Flessibile**: Supporta file con più di 3 colonne (le colonne extra vengono ignorate).
- **Flussi Negativi**: Supporta importi negativi nella colonna B per registrare spese o uscite di cassa.
- **Memorizzazione**: Dati salvati nella tabella `dividends` con riferimento all'asset e al portafoglio.
- **Utilizzo**: Partecipano al calcolo del MWRR (XIRR) come flussi di cassa (positivi o negativi).

## 5. Stato Attuale (v0.2.0)

### Funzionalità Completate
- [x] **Safe Ingestion**: Implementato protocollo Read-Preview-Write.
- [x] **Dividend Support**: Parsing file 3 colonne e tabella DB dedicata.
- [x] **Manual Prices**: Salvataggio storico prezzi da Excel.
- [x] **UI/UX**: Integrazione modali di conferma e feedback visivi.
- [x] **Performance**: Caching client-side per navigazione istantanea.

### Prossimi Passi (Roadmap)
- [ ] **MWRR Engine**: Aggiornare il calcolo XIRR per includere i dividendi.
- [ ] **Asset History Fill**: Popolare `asset_metrics_history` durante la sync per abilitare grafici per singolo asset.
### Dashboard 2.0 & UI Enhancements
- [x] **Asset Filtering**: Lista "Asset Attivi" con checkbox per filtrare il grafico MWR.
- [x] **Time Window**: Range Slider bi-direzionale per zoomare su specifici periodi temporali.
- [x] **Persistent Colors**: Assegnazione colori univoci e persistenti per Asset nel database (`portfolio_asset_settings`).
- [x] **Resizable Layout**: Layout a pannelli ridimensionabile con persistenza della posizione (LocalStorage) e miglior gestione larghezze minime.
- [x] **Y-Axis Controls**: Slider verticale per scalare l'asse Y e toggle per griglie (Major/Minor).

### Ingestion Logic Refinement
- [x] **Price decoupling**: Salvataggio prezzi storici (Colonna I) anche per asset con quantità zero (Watchlist).
- [x] **Button Logic**: Fix abilitazione bottone "Conferma" su upload di soli prezzi.

### Prossimi Passi (Roadmap)
- [ ] **MWRR Engine**: Aggiornare il calcolo XIRR per includere i dividendi.
- [ ] **Asset History Fill**: Popolare `asset_metrics_history` durante la sync per abilitare grafici per singolo asset.

## 6. Ambiente di Test e Produzione

Il progetto è configurato per supportare due ambienti distinti, garantendo la possibilità di testare in locale prima del deploy:

### 1. Locale (Sviluppo & Test)
L'ambiente locale utilizza **Docker Desktop** e richiede l'avvio coordinato di tre componenti in terminali separati.

#### Procedura di Avvio (Step-by-Step)

1.  **Tab 1: Infrastructure (Supabase)**
    - Assicurati che Docker Desktop sia aperto.
    - Esegui: `supabase start`
    - *Nota*: Questo avvia il database, l'autenticazione e lo storage.

2.  **Tab 2: Backend (Python API)**
    - Attiva il virtual environment (se non già attivo): `.\.venv\Scripts\activate`
    - Installa le dipendenze: `pip install -r requirements.txt`
    - Esegui: `python api/index.py`
    - *Porta*: **5328**
    - *Scopo*: Gestisce i calcoli finanziari (XIRR), l'analisi Excel e la logica di business. Deve rimanere attivo affinché il frontend possa funzionare.

3.  **Tab 3: Frontend (Next.js)**
    - Esegui: `npm run dev`
    - *Porta*: **3500** (URL: `http://localhost:3500`)
    - *Scopo*: Interfaccia utente interattiva.

#### Troubleshooting Locale
- **Errore `ECONNREFUSED 127.0.0.1:5328`**: Il server Backend Python non è attivo o si è interrotto. Controlla il Tab 2.
- **Porta Occupata (EACCES)**: Se ricevi errori sulla porta 3000 o 3010, il comando `npm run dev` è già configurato per usare la **3500**.
- **Errore Database**: Se `supabase start` fallisce, prova a eseguire `supabase stop` prima di riavviare.
- **Variabili d'ambiente**: Localmente vengono lette dal file `.env.local`.

### 2. Produzione (Vercel)
L'ambiente live accessibile via web.

- **Database**: Project Supabase ospitato su Cloud (Piano Free).
- **Backend**: Le API Python vengono convertite in **Serverless Functions** su Vercel.
- **Frontend**: Compilato e servito dalla CDN di Vercel.
- **Configurazione**: Le variabili d'ambiente sono gestite tramite la dashboard di Vercel (Project Settings > Environment Variables).

