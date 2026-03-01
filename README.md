# PerixMonitor

PerixMonitor è un'applicazione web avanzata per il tracciamento del patrimonio personale (Wealth Tracker), progettata specificamente per residenti fiscali italiani. 
Il sistema permette l'ingestione intelligente di file Excel bancari, la riconciliazione automatica delle transazioni e il calcolo delle performance finanziarie (MWRR/XIRR) senza dipendere da API esterne costose.

## Caratteristiche Principali

- **Safe Ingestion**: Protocollo "Read-Preview-Write" per importare file Excel senza corrompere il database.
- **Calcolo Performance**: Motore XIRR/MWRR ottimizzato per calcolare il rendimento reale ponderato per i flussi di cassa.
- **Privacy First**: I dati risiedono sul tuo database Supabase privato.
- **Dual Server Architecture**: Frontend Next.js reattivo + Backend Python per calcoli finanziari complessi.

## Prerequisiti

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (per il database locale)
- [Python 3.9+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Guida all'Avvio (Sviluppo Locale)

L'applicazione richiede l'avvio coordinato di 3 componenti in terminali separati:

### 1. Database & infrastruttura
Avvia Supabase locale (database, auth, storage):
```bash
supabase start
```

### 2. Backend (Python API)
Gestisce la logica di business e i calcoli finanziari.
```bash
# Attiva virtual environment (Windows)
.\.venv\Scripts\activate

# Installa dipendenze (se necessario)
pip install -r requirements.txt

# Avvia il server (Porta 5328)
python api/index.py
```

### 3. Frontend (Next.js)
Interfaccia utente.
```bash
# Avvia il server di sviluppo (Porta 3500)
npm run dev
```
> **Nota**: Il frontend è configurato sulla porta 3500 per evitare conflitti. Apri [http://localhost:3500](http://localhost:3500).

## Documentazione

- [Architettura del Sistema](docs/architecture/system_architecture.md)
- [Analisi Performance & Caching](docs/architecture/performance.md)
- [Guida al Deployment](docs/guides/deployment.md)
- [Guida all'Importazione Dati](docs/guides/user_manual_import.md)

## Struttura del Progetto

- `/api`: Backend Python Flask.
- `/app` & `/components`: Frontend Next.js (App Router).
- `/supabase`: Configurazioni database e migrazioni.

## Logica di Ingestion ed Errori (Protocollo Semplificato)
 
L'importazione dei file Excel segue ora una logica diretta basata sulle operazioni di transazione:
 
### 1. Transazioni (Acquisto / Vendita)
Se una riga contiene un'operazione esplicita (**"Acquisto"** o **"Vendita"**), il valore nella colonna **Quantità** indica esattamente il numero di quote acquistate o vendute (Transaction Delta).
-   **Acquisto**: Le quote vengono *sommate* al portafoglio esistente.
-   **Vendita**: Le quote vengono *sottratte* dal portafoglio esistente.
    -   *Errore*: Se si tenta di vendere una quantità superiore a quella posseduta nel database, l'operazione viene bloccata (`ERROR_NEGATIVE_QTY`).
 
### 2. Aggiornamento Prezzi
Se una riga **NON** contiene alcuna operazione:
-   Il sistema considera la riga come **Aggiornamento di Prezzo**.
-   **Controllo**: La quantità indicata nel file DEVE corrispondere a quella presente nel database.
    -   *Eccezione*: Se la cella **Quantità è vuota**, il sistema ignora il controllo (valido per aggiornamenti listino).
-   **Errore**: Se la quantità è **presente ma diversa** da quella in DB (e.g. file dice 100, DB ha 50), il sistema genera un errore di discrepanza (`ERROR_QTY_MISMATCH_NO_OP`). Questo segnala una probabile operazione mancante.
-   **Risultato**: L'ingestion viene bloccata per quella riga. L'utente deve correggere il file aggiungendo l'operazione mancante o correggendo la quantità.
 
### 3. Logica Semplificata (Transaction-Only)
Il sistema **NON** effettua più una riconciliazione "State-Based" (confronto saldo totale).
-   Non verifica se un asset presente nel DB manca nel file Excel.
-   Non calcola automaticamente delta per allineare le quantità totali.
-   Si basa **esclusivamente** sulle operazioni esplicite dichiarate nel file.

### Regole di Coerenza (Strict Checks)
Per le operazioni dichiarate (**Acquisto** o **Vendita**), il sistema applica regole rigide:
1.  **Quantità Obbligatoria**: La cella *Quantità* non può essere vuota.
2.  **Prezzo Operazione Obbligatorio**: La cella *Prezzo Operazione* (Colonna H) deve essere presente.
Se manca uno di questi dati, l'operazione viene segnalata come **Incompleta** (`ERROR_INCOMPLETE_OP`) e l'ingestione viene bloccata per quella riga.
 
### 4. Riconciliazione (Preview)
Prima di salvare qualsiasi modifica, il sistema mostra una `Preview` delle azioni:
-   **Transazioni**: Acquisti/Vendite rilevati.
-   **Aggiornamenti Prezzi**: Nuovi prezzi per asset esistenti.
-   **Aggiornamenti Anagrafica**: Cambi di Tipologia o Descrizione.
-   **Cedole/Dividendi e Spese/Costi**: Riepilogo separato per tipo, con colonne "In Archivio", "Nuovi Incassi/Costi" e "Dopo Importazione".
-   **Errori**: Discrepanze o dati mancanti che impediscono il salvataggio.
Solo confermando la preview i dati vengono scritti nel database.

## Changelog GUI / Funzionalità (31/01/2026)

### Dashboard & Grafici
- **Layout Fluido**: I grafici ora si adattano dinamicamente all'altezza dei contenitori (flexbox), garantendo un perfetto allineamento con i pannelli laterali (es. dettaglio asset).
- **Asse X Lineare**: L'asse temporale è ora basato su scala lineare (timestamp). Le date sono spaziate in modo proporzionale al tempo reale, eliminando distorsioni visive in caso di dati mancanti.
- **Formattazione Data**: Le etichette dell'asse X sono formattate come `dd/mm/yy` e ruotate di 45° per migliorare la leggibilità.
- **Statistiche Dinamiche (Windowed)**: 
  - Nel pannello di dettaglio asset, i valori di **Profitto/Perdita** e **MWR** si aggiornano in tempo reale in base alla finestra temporale selezionata tramite lo slider.
  - Il calcolo utilizza un'approssimazione *Modified Dietz* per il periodo visibile (o il valore preciso backend se si parte dall'inizio).

### Integrazione AI & Audit (01/02/2026)
- **AI Avanzata (GPT-5)**: Supporto nativo per `gpt-5-mini` e modelli reasoning via **OpenAI Responses API**.
- **Native Web Search**: Integrazione della ricerca web autonoma per arricchimento dati asset.
- **UI Agnostica**: Pannello configurazione AI che si adatta dinamicamente alle capacità del modello.
- **Supporto CORS & Long-running tasks**: Ottimizzazione del timeout (5 min) e bypass proxy per query AI complesse.
- **Sistema di Audit**: Nuovo motore di logging professionale con attivazione dinamica dei log tecnici.
- **Codebase Clean-up**: Consolidamento dipendenze e rimozione script legacy.

### UI Ingestion & Trend Logic (02/02/2026)
- **Safe Ingestion UI**: 
    - **Blocking Overlay**: Schermata di attesa bloccante durante la sincronizzazione per prevenire errori di concorrenza.
    - **AI Search**: Disattivata di default per maggiore controllo manuale.
- **Trend Calculation Engine**:
    - **Logica Unificata**: Il calcolo del trend (prezzo vs prezzo precedente) ora è coerente per qualsiasi tipo di operazione (singolo prezzo, sovrascrittura data, ricostruzione storica).
    - **Sold Assets**: Gestione automatica assets venduti (Quantità=0) -> Il trend viene forzato a `NULL` nel DB per pulizia visiva.
    - **Historical Fills**: Supporto robusto per iniezione massiva di prezzi storici senza corrompere l'indicatore "Ultima Variazione".

### Release 2.0 - "Memory & Analysis" (14/02/2026)

- **System Architecture V2.0**:
    - Aggiornamento completo della documentazione architetturale.
    - Consolidamento moduli backend: `memory.py`, `analysis.py`, `backup_service.py`.

- **Backup & Restore "Full Fidelity"**:
    - **Inclusione Storico Prezzi**: Il backup ora salva e ripristina l'intera serie storica dei prezzi, garantendo grafici MWRR coerenti.
    - **Smart Restore**: Ricreazione automatica asset e rimappatura dipendenze (Note, Settings).

- **Gestione "Memory" & P&L**:
    - Nuova pagina "Note & Storico" con aggregazione transazioni e calcolo P&L netto (inclusi dividendi e spese).
    - Note persistenti per asset.

- **Modulo "Analysis"**:
    - Breakdown Asset Allocation per classe e componente.
    - Supporto Liquidità Manuale iniettabile.

- **Ottimizzazioni UX & Core**:
    - **Safe Ingestion**: Protocollo Read-Preview-Write per file Excel (Transazioni, Dividendi, Spese).
    - **Color Manager**: Assegnazione colori persistenti e unici per asset.
- **AI Audit**: Integrazione avanzata GPT-5 e Conditional Logging.

### Ottimizzazioni MWR e Dashboard Dinamica (28/02/2026)
- **Bugfix MWR Subset**: Risolto un problema di distorsione del MWR (XIRR) quando si filtra la dashboard per un sottoinsieme di asset. I dividendi considerati nel calcolo dei cash flow sono stati scollegati dal portafoglio globale e ora vengono filtrati dinamicamente per appartenere *solo* agli asset selezionati.
- **Metriche Slider Dinamiche**: Le card KPI principali della Dashboard (Controvalore, MWR, Profitto/Perdita) visualizzano ora istantaneamente le performance relative *al solo periodo selezionato* visivamente tramite il range slider sul grafico. L'engine applica un'approssimazione "Modified Dietz" sul frontend per un'esperienza a latenza zero, senza sovraccaricare il server backend.
