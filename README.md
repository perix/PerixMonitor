# PerixMonitor

PerixMonitor è un'applicazione web avanzata per il tracciamento del patrimonio personale (Wealth Tracker), progettata per residenti fiscali italiani.
Il sistema permette l'ingestione intelligente di file Excel bancari, la riconciliazione automatica delle transazioni e il calcolo delle performance finanziarie (MWR/XIRR) in totale privacy.

---

## 🌟 Novità: Analisi Certificati Integrata (V2.8)

L'analisi dei certificati è ora **interamente integrata** in PerixMonitor, senza dipendenze da servizi esterni. Dato un ISIN, l'app estrae le caratteristiche del certificato (Barriere, Cedole, Autocall, scadenze) tramite ricerca web AI e recupera i prezzi live dei sottostanti per calcolare la distanza dalla barriera (Worst-Of). I risultati vengono salvati in cache nel database e mostrati nel pannello dettagli dell'asset.

È disponibile inoltre una pagina dedicata **Certificati** che elenca tutti i certificati analizzati, con distanza Worst-Of live, aggiornamento on-demand, modifica manuale dei dati e dei ticker, ed eliminazione.

---

## 🚀 Guida Rapida all'Avvio (Sviluppo Locale)

L'applicazione richiede l'avvio coordinato di 3 componenti in terminali separati:

### 1. Database & infrastruttura

```bash
supabase start
```

### 2. Backend (Python API)

```bash
# Windows
.\.venv\Scripts\activate
python api/index.py
```

### 3. Frontend (Next.js)

```bash
npm run dev
```

> Apri [http://localhost:3500](http://localhost:3500).

---

## 📚 Documentazione Completa

Per approfondire il funzionamento del sistema, consulta i documenti dedicati nella cartella `docs/`:

### Architettura e Performance

- 🏗️ **[Architettura del Sistema](docs/architecture/system_architecture.md)**: Stack tecnologico, schema database e logica MWR/XIRR.
- ⚡ **[Analisi Performance &amp; Scalabilità](docs/architecture/performance.md)**: Ottimizzazioni DB, Caching e Virtualizzazione.

### Guide Utente

- 📥 **[Guida all&#39;Importazione Dati](docs/guides/user_manual_import.md)**: Come preparare i file Excel (Transazioni, Dividendi, Prezzi).
- ☁️ **[Guida al Deployment](docs/guides/deployment.md)**: Istruzioni per caricare il progetto su Vercel/Supabase Cloud.

### Altro

- 📜 **[Changelog Storico](docs/changelog.md)**: Tutte le novità e le release precedenti.

---

*PerixMonitor - Sviluppato per la massima precisione e privacy finanziaria.*
