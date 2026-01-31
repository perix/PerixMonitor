# PerixMonitor - Architettura e Stato Corrente (V1.0)

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
        - **Portfolio Full/Partial Sync**:
            -   Supporta "Partial Updates" (file con sole vendite): ignora asset mancanti senza venderli.
            -   Supporta "Strict Sync" per discrepanze: Segnala errore se la quantità cambia senza operazione esplicita.
        -   **Dividend File**: Rileva automaticamente pattern [ISIN, Valore, Data] per importazione cedole.
    - **Nessun dato viene salvato nel DB**. L'API restituisce un JSON con le proposte di modifica (`delta`, `prices_to_save`, `snapshot_proposal`).

2.  **Phase 2: Preview & Reconciliation**
    - Il Frontend mostra all'utente cosa sta per succedere (transazioni mancanti, cedole rilevate).
    - Il sistema permette di riconciliare i nomi asset e le tipologie asset per uniformità.
    - L'utente deve confermare esplicitamente.

3.  **Phase 3: Sync (Transactional Write)**
    - Solo alla conferma, il frontend invia il payload approvato all'API `/api/sync`.
    - Il backend esegue le scritture nel DB (Transazioni, Prezzi, Snapshot, Dividendi) in modo atomico o sequenziale sicuro.
    - Il backend esegue update/backfill di asset type e description se forniti nel payload di sync.

## 4. Strategie di Dati

### Manual Price Ingestion & Frequency
- La fonte di verità è la **Colonna I ("Prezzo Corrente") del file Excel**.
- **Frequenza Irregolare**: L'applicazione è progettata per gestire aggiornamenti di prezzo sporadici (es. settimanali o su richiesta).
- **Logica di Continuità (LOCF)**:
    - Poiché i prezzi non sono giornalieri, il sistema adotta la logica **Last Observation Carried Forward**.
    - Il valore di un asset al giorno X (se non presente un prezzo esplicito) è assunto uguale all'ultimo prezzo noto precedente.
    - Questo garantisce che i grafici di andamento ("Portfolio History") non abbiano "buchi" temporali e rimangano fluidi anche con dati sparsi.
- Questi prezzi vengono salvati nella tabella `asset_prices` con `source='Manual Upload'`.

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

### Gestione Ciclo di Vita Asset (Active vs Historical)
- **Asset Attivi**:
    - Sono gli strumenti con quantità > 0 nel portafoglio attuale.
    - Sono visibili nel grafico a torta "Allocation", contribuiscono al "Total Value" e vengono aggiornati con i prezzi correnti (manuali).
    - Nella UI sono raggruppati in cima alla lista filtri.
- **Asset Storici (Chiusi)**:
    - Sono strumenti interamente venduti (quantità = 0).
    - **Performance**: Continuano a contribuire al calcolo del XIRR globale (cash flows passati).
    - **Visualizzazione**: Sono esclusi dall'Allocation corrente (valore nullo).
    - **UI**: Compaiono in una sezione separata "Storici (Venduti)" per permettere l'analisi ex-post, ma sono distinti visivamente (grigio/italico) per non confondere la view corrente.
    - **Prezzi**: Non richiedono aggiornamenti prezzi futuri.

## 5. Stato Attuale (V1.0)

### Funzionalità Completate
- [x] **Safe Ingestion**: Implementato protocollo Read-Preview-Write.
- [x] **Dividend Support**: Parsing file 3 colonne e tabella DB dedicata.
- [x] **Manual Prices**: Salvataggio storico prezzi da Excel.
- [x] **UI/UX**: Integrazione modali di conferma e feedback visivi.
- [x] **Performance**: Caching client-side per navigazione istantanea.
- [x] **Dashboard 2.0 & UI Enhancements**:
    - **Asset Filtering**: Lista "Asset Attivi" con checkbox per filtrare il grafico MWR.
    - **Asset Type**: Visualizzazione corretta categorie asset (ETF, Bond, Azioni).
    - **Dual Axis**: Grafico a doppio asse per performance asset vs portafoglio.
    - **Time Window**: Range Slider bi-direzionale per zoomare su specifici periodi temporali.
    - **Persistent Colors**: Assegnazione colori univoci e persistenti per Asset nel database.
    - **Resizable Layout**: Layout a pannelli ridimensionabile.

### Prossimi Passi (Roadmap Future V1.1+)
- [ ] **MWRR Engine Refinement**: Aggiornare il calcolo XIRR per includere i dividendi in modo più granulare.
- [ ] **Asset History Fill**: Popolare `asset_metrics_history` in modo asincrono.
- [ ] **Performance Optimization**: Valutare migrazione aggregazioni su DB (Materialized Views) o Caching Layer (Redis) se il volume dati cresce > 50k transazioni.

## 6. Ambiente di Test e Produzione

Il progetto è configurato per supportare due ambienti distinti:

### 1. Locale (Sviluppo & Test)
L'ambiente locale utilizza **Docker Desktop** e richiede l'avvio coordinato di tre componenti in terminali separati.

#### Procedura di Avvio (Step-by-Step)

1.  **Tab 1: Infrastructure (Supabase)**
    - `supabase start`
2.  **Tab 2: Backend (Python API)**
    - Attiva venv: `.\.venv\Scripts\activate`
    - `python api/index.py` (Porta 5328)
3.  **Tab 3: Frontend (Next.js)**
    - `npm run dev` (Porta 3500)

### 2. Produzione (Vercel)
L'ambiente live accessibile via web.
- **Frontend & Backend**: Deployed su Vercel (Next.js + Serverless Python).
- **Database**: Supabase Cloud.

## 7. Vincoli di Progetto (Free Tier)
Il progetto è strettamente vincolato all'utilizzo dei piani **Free** di Vercel e Supabase. Le scelte architetturali riflettono questi limiti:

1.  **Vercel (Hobby Plan)**:
    - **Serverless Function Timeout**: Max 10 secondi (default) o fino a 60s per funzioni. L'ingestione di file Excel molto grandi (> 5MB) potrebbe fallire se l'elaborazione Python supera questo limite.
    - **Back-end Strategy**: Ottimizzazione del codice Python (`pandas`) per processare i dati rapidamente ed evitare timeout.

2.  **Supabase (Free Plan)**:
    - **Database Size**: Limite di 500MB. I file binari (PDF/Excel) non vengono salvati nel database. Vengono salvati solo i metadati e le transazioni estratte.
    - **Compute**: Risorse CPU condivise. Le query complesse devono essere ottimizzate e indicizzate.
    - **No Pro Features**: Non si utilizzano feature a pagamento come PITR (Point in Time Recovery) o Log retention estesa.

3.  **Strategia "Zero Cost"**:
    - **Nessun Redis/Cache esterno a pagamento**: Il caching avviene in memoria lato client (React Context) o tramite ottimizzazioni SQL, senza aggiungere servizi esterni a pagamento.
    - **OpenAI**: Unico costo vivo accettato (pay-per-use), ma opzionale. Il sistema funziona anche senza arricchimento AI.
