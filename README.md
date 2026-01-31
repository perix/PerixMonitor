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

- [Architettura del Sistema](ARCHITECTURE_v0.2.0.md)
- [Guida al Deployment](App_Deployment_Guide.md)

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
