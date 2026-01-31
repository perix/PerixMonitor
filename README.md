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
