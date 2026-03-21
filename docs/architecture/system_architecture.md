# PerixMonitor - Architettura e Stato Corrente (V2.7)

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

#### Struttura dei File Backend (Version 2.6)

```
api/
├── index.py          # Entry point principale
├── dashboard.py      # API Dashboard: grafici, KPI, storico MWR, trend
├── memory.py         # API Memory/Storico: aggregazione transazioni, P&L, note, dividendi
├── analysis.py       # API Analisi: allocazione asset class, componenti, metriche granulari
├── portfolio.py      # Gestione portafogli (CRUD)
├── ingest.py         # Parsing e Safe Ingestion file Excel (Transazioni, Cedole)
├── backup_service.py # Logica avanzata Backup/Restore
├── finance.py        # Core Engine: Calcoli finanziari XIRR/MWR tiered
├── price_manager.py  # Gestione storico prezzi (salvataggio manuale, recupero efficiente)
├── asset_prices.py   # API Prezzi: endpoint per CRUD e range filtering (V2.6)
├── color_manager.py  # Gestione colori persistenti per asset
├── config_api.py     # API per settings UI persistenti
├── llm_asset_info.py # API base per info asset via AI
├── llm_report.py     # API Analisi Asincrona: reportistica
├── llm_utils.py      # Utility LLM
├── supabase_client.py# Client DB centralizzato
└── logger.py         # Sistema di audit e logging professionale
```

#### Principali Endpoint API

| Endpoint | Metodo | Funzione |
|----------|--------|----------|
| `/api/ingest` | POST | Preview Import: analizza Excel e propone modifiche |
| `/api/sync` | POST | Safe Sync: Commit atomico nel DB |
| `/api/report/generate` | GET | Genera dati strutturati per il report PDF |
| `/api/asset-prices` | GET | Recupera storico prezzi con filtro temporale (V2.6) |
| `/api/memory/data` | GET | Recupera dati aggregati per pagina "Note & Storico" |
| `/api/analysis/allocation` | GET | Recupera dati allocazione per pagina "Analisi" |
| `/api/backup/download` | GET | Scarica JSON backup completo |
| `/api/assets/<isin>/external` | GET | Proxy sicuro per recupero dati live certificati (V2.7) |

### Sicurezza e RLS

- **Row Level Security (RLS)**: Attiva su tutte le tabelle. Accesso diretto bloccato per utenti anonimi.
- **Service Role Proxy**: Il backend Python agisce come gatekeeper unico utilizzando la `SERVICE_ROLE_KEY`.

### Database (Schema V2.6)

- **Core Tables**:
    - `assets`: Anagrafica titoli.
    - `transactions`: Storico operazioni.
    - `dividends`: Flussi di cassa (Cedole/Dividendi e Spese/Costi).
    - `portfolios`: Contenitori logici.
    - `asset_prices`: Storico prezzi manuale.
    - `snapshots`: Storico aggregato valori totali.

- **UI & Persistence Tables**:
    - `asset_notes`: Note testuali utente sugli asset.
    - `portfolio_asset_settings`: Configurazioni specifiche (es. `color` per grafici).
    - `app_config`: Key-Value store per impostazioni UI.

## 3. Moduli Funzionali Chiave

### Gestione "Memory" & Storico
La pagina "Note & Storico" (`memory.py`) centralizza la vista dettagliata dell'investimento:
- **Aggregazione**: Unifica transazioni per calcolare giacenza media e costo totale.
- **P&L Netto**: Include Capital Gain, Dividendi netti e Spese.

### Gestione Prezzi & Virtualizzazione (V2.6)
Il modulo prezzi è stato potenziato per scalabilità massiva:
- **Dialog Prezzi**: Permette l'editing granulare, l'eliminazione e la visualizzazione dello storico.
- **Windowing**: Utilizzo di virtualizzazione React per gestire tabelle con migliaia di righe a 60fps.
- **Time Filtering**: Caricamento lazy dei dati storici (1A, 2A, Tutto) per ottimizzare il network payload.

### Protocollo Safe Ingestion & Dividend Management
- **Preview First**: Nessun dato viene scritto senza conferma esplicita post-analisi delta.
- **Dividend/Expense separation**: Rilevamento automatico dal segno dell'importo.

### Backup & Restore "Full Fidelity"
- **Price History Inclusion**: Il JSON include TUTTI i prezzi storici degli asset.
- **Smart Restore**: Ricrea anagrafiche asset e rimappa ID per entità dipendenti.

## 4. Metodologia MWR (Money Weighted Return)

Il sistema calcola la performance reale tramite **XIRR (Extended Internal Rate of Return)**.

### Logica "Tiered" (Stabilità vs Precisione)
Per evitare distorsioni su periodi brevi:
| Periodo | Metodo | Descrizione |
|---------|--------|-------------|
| **< 30gg** | Simple Return | `(Valore - Costo) / Costo`. |
| **30-365gg** | Period XIRR | XIRR de-annualizzato. |
| **> 365gg** | Annualized XIRR | CAGR classico. |

### Metodi di Calcolo XIRR
- **Standard**: Newton-Raphson tradizionale (Guess 10%).
- **Multi-Guess**: Tentativi paralleli con molteplici punti di partenza per evitare non-convergenza su flussi irregolari.

### Rendimenti Dinamici (Sliding Window)
- Il frontend calcola la variazione netta del *Profitto (Delta P&L)* visibile.
- Applica la **Modified Dietz Approximation** per fornire una stima in tempo reale senza ricaricare dal backend.

## 5. Stato Attuale (V2.7)

### Feature Completate (Stable)
- [x] **Core**: Safe Ingestion, Dashboard interattiva, Calcolo XIRR Tiered.
- [x] **Live Info (V2.7)**: Integrazione API esterna per dati certificati real-time.
- [x] **Memory Module**: Tabella storico avanzata, P&L granulare, Dividendi.
- [x] **Analysis Module**: Asset allocation dinamica, Liquidità manuale.
- [x] **Data Integrity**: Backup/Restore completo con storico prezzi.
- [x] **UI Persistence**: Salvataggio preferenze tabelle, colori custom, note.
- [x] **AI Integration**: Supporto GPT-5/Search opzionale.
- [x] **Scalabilità Prezzi**: Virtualizzazione della tabella e filtro temporale (V2.6).
- [x] **Asynchronous Reporting (V2.5)**: Sistema a task per analisi LLM lunghe.

## 6. Ambiente e Vincoli
Progettato per **Vercel Hobby Tier** (Serverless Function timeout 10-60s) e **Supabase Free Tier** (500MB DB). 
L'architettura minimizza le chiamate DB e sposta il carico computazionale sul livello Python (Pandas) ottimizzato.
