# PerixMonitor - Architettura e Stato Corrente (V2.0)

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
│                     http://localhost:3500                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER 1: FRONTEND                           │
│                    Next.js (porta 3500)                         │
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
| `npm run dev` | Frontend (Next.js) | 3500 | Interfaccia utente |
| `python api/index.py` | Backend (Flask) | 5328 | Logica di business e database |

> [!IMPORTANT]
> Se avvii solo il frontend senza il backend Python, vedrai errori del tipo `ECONNREFUSED 127.0.0.1:5328` perché il frontend non riesce a contattare l'API.

#### Struttura dei File Backend (Version 2.0)

```
api/
├── index.py          # Entry point principale - avvia Flask e registra tutte le route
├── dashboard.py      # API Dashboard: grafici, KPI, storico MWR, trend
├── memory.py         # [V2.0] API Memory/Storico: aggregazione transazioni, P&L, note, dividendi
├── analysis.py       # [V2.0] API Analisi: allocazione asset class, componenti, metriche granulari
├── portfolio.py      # Gestione portafogli (CRUD)
├── ingest.py         # Parsing e Safe Ingestion file Excel (Transazioni, Cedole)
├── backup_service.py # [V2.0] Logica avanzata Backup/Restore (full price history support)
├── finance.py        # Core Engine: Calcoli finanziari XIRR/MWR tiered
├── price_manager.py  # Gestione storico prezzi (salvataggio manuale, recupero efficiente)
├── color_manager.py  # [V2.0] Gestione colori persistenti per asset
├── config_api.py     # [V2.0] API per settings UI persistenti (colonne, filtri)
├── llm_asset_info.py # Integrazione AI (GPT-5, Web Search)
├── supabase_client.py# Client DB centralizzato
└── logger.py         # Sistema di audit e logging professionale
```

#### Principali Endpoint API

| Endpoint | Metodo | Funzione |
|----------|--------|----------|
| `/api/ingest` | POST | Preview Import: analizza Excel e propone modifiche (senza salvare) |
| `/api/sync` | POST | Safe Sync: Commit atomico delle modifiche approvate nel DB |
| `/api/memory/data` | GET | Recupera dati aggregati per pagina "Note & Storico" (incl. P&L netto) |
| `/api/analysis/allocation` | GET | Recupera dati allocazione per pagina "Analisi" |
| `/api/backup/download` | GET | Scarica JSON backup completo (incl. storico prezzi) |
| `/api/dashboard/summary` | GET | KPI Dashboard e grafici andamento |

#### Tecnologie Utilizzate

- **Runtime**: Python 3.9+
- **Framework API**: Flask (micro-framework web leggero)
- **Librerie Core**:
    - `pandas`: Parsing ed elaborazione dati Excel
    - `scipy`: Calcoli finanziari (XIRR ottimizzato)
    - `openai`: Integrazione con modelli AI per arricchimento dati asset
    - Sistema di audit professionale (`log_audit`) per operazioni critiche.

### Sicurezza e RLS

- **Row Level Security (RLS)**: Attiva su tutte le tabelle. Accesso diretto bloccato per utenti anonimi.
- **Service Role Proxy**: Il backend Python agisce come gatekeeper unico, utilizzando la `SERVICE_ROLE_KEY` per operazioni privilegiate previa validazione.

### Database (Schema V2.0)

- **Core Tables**:
    - `assets`: Anagrafica titoli (ISIN, Nome, Settore, Metadata AI).
    - `transactions`: Storico operazioni (Acquisto, Vendita).
    - `dividends`: Flussi di cassa (Cedole/Dividendi e Spese/Costi). Colonna `type` discrimina entrate/uscite.
    - `portfolios`: Contenitori logici.
    - `asset_prices`: Storico prezzi manuale (Timestamped). Fonte primaria per calcoli MWR.
    - `snapshots`: Storico aggregato valori totali post-upload.

- **New V2.0 Tables**:
    - `asset_notes`: Note testuali utente sugli asset (persistenti per portfolio).
    - `portfolio_asset_settings`: Configurazioni specifiche per asset nel contesto portfolio (es. `color` per grafici).
    - `app_config`: Key-Value store per impostazioni UI (es. visibilità colonne, ordinamento tabelle, config AI).

## 3. Moduli Funzionali Chiave (V2.0 architecture)

### Gestione "Memory" & Storico
La nuova pagina "Note & Storico" (`memory.py`) centralizza la vista dettagliata dell'investimento:
- **Aggregazione**: Unifica transazioni di acquisto/vendita per calcolare giacenza media, costo totale e ricavi.
- **P&L Netto**: Calcola il Profit & Loss includendo non solo plusvalenze da prezzo (Capital Gain), ma anche Dividendi netti e Spese.
- **Note Persistenti**: Permette di annotare strategie su ogni singolo asset.
- **UI Settings**: Salva le preferenze di visualizzazione tabella (colonne nascoste, sort) per esperienza utente continua.

### Gestione "Analysis" & Allocazione
Il modulo Analisi (`analysis.py`) scompone il portafoglio in Componenti (Asset Class):
- **Logica Componenti**: Raggruppa asset (es. ETF Azionari, Bond Governativi) calcolando pesi percentuali e performance aggregate per classe.
- **Liquidità Manuale**: Supporta l'iniezione di una posizione di liquidità virtuale (tramite settings portfolio) che partecipa all'asset allocation totale.

### Protocollo Safe Ingestion & Dividend Management
- **Preview First**: Nessun dato viene scritto senza conferma esplicita post-analisi delta.
- **Dividend/Expense separation**: Rilevamento automatico dal segno dell'importo (Positivo=Cedola, Negativo=Spesa).
- **Idempotenza**: Gestione duplicati tramite chiave composita `(portfolio, asset, data, type)`.

### Backup & Restore "Full Fidelity"
Il servizio di Backup (`backup_service.py`) è stato riscritto per garantire **Zero Data Loss**:
- **Price History Inclusion**: Il JSON di backup include TUTTI i prezzi storici degli asset coinvolti, permettendo di ricostruire fedelmente i grafici MWRR anche su nuove installazioni.
- **Smart Restore**: 
    - Ricrea automaticamente anagrafiche asset mancanti.
    - Rimappa ID per entità dipendenti (Note, Settings, Colori).
    - Preserva configurazioni UI e preferenze.

## 4. Metodologia MWR (Money Weighted Return)

Il sistema calcola la performance reale tramite **XIRR (Extended Internal Rate of Return)**, l'unico metodo che pesa correttamente il timing dei flussi di cassa.

### Logica "Tiered" (Stabilità vs Precisione)
Per evitare distorsioni su periodi brevi:
| Periodo | Metodo | Descrizione |
|---------|--------|-------------|
| **< 30gg** | Simple Return | `(Valore - Costo) / Costo`. Evita proiezioni annualizzate folli su pochi giorni. |
| **30-365gg** | Period XIRR | XIRR de-annualizzato. Mostra il rendimento effettivo guadagnato nel periodo. |
| **> 365gg** | Annualized XIRR | CAGR classico. Rendimento medio annuo composto. |

### Calcolo Time-Series
Il grafico MWR viene generato dinamicamente simulando una "vendita fittizia" (Mark-to-Market) ad ogni punto storico, utilizzando i prezzi noti (LOCF - Last Observation Carried Forward) per valutare il portafoglio nel passato.

## 5. Stato Attuale (V2.0)

### Feature Completate (Stable)
- [x] **Core**: Safe Ingestion, Dashboard interattiva, Calcolo XIRR Tiered.
- [x] **Memory Module**: Tabella storico avanzata, P&L granulare, Net Dividend support.
- [x] **Analysis Module**: Asset allocation dinamica, supporto Liquidità manuale.
- [x] **Data Integrity**: Backup/Restore completo con storico prezzi.
- [x] **UI Persistence**: Salvataggio preferenze tabelle, colori custom asset, note.
- [x] **AI Integration**: Supporto GPT-5/Search opzionale per arricchimento dati.
- [x] **Performance**: Indicizzazione DB, Caching lato client, Batch processing prezzi.

### Prossimi Passi (Roadmap Future V2.1+)
- [ ] **Multi-Currency Support**: Gestione nativa cambi valuta storici.
- [ ] **Advanced Reporting**: Generazione PDF periodici.
- [ ] **Goal Tracking**: Impostazione obiettivi di risparmio e proiezione.

## 6. Ambiente e Vincoli
Progettato per **Vercel Hobby Tier** (Serverless Function timeout 10-60s) e **Supabase Free Tier** (500MB DB). 
L'architettura minimizza le chiamate DB ("Chatty" APIs evitate) e sposta il carico computazionale (aggregazioni) sul livello Python (Pandas) ottimizzato.
