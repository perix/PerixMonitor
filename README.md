# PerixMonitor

PerixMonitor è un'applicazione web avanzata per il tracciamento del patrimonio personale (Wealth Tracker), progettata per residenti fiscali italiani. 
Il sistema permette l'ingestione intelligente di file Excel bancari, la riconciliazione automatica delle transazioni e il calcolo delle performance finanziarie (MWR/XIRR) in totale privacy.

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
- ⚡ **[Analisi Performance & Scalabilità](docs/architecture/performance.md)**: Ottimizzazioni DB, Caching e Virtualizzazione.

### Guide Utente
- 📥 **[Guida all'Importazione Dati](docs/guides/user_manual_import.md)**: Come preparare i file Excel (Transazioni, Dividendi, Prezzi).
- ☁️ **[Guida al Deployment](docs/guides/deployment.md)**: Istruzioni per caricare il progetto su Vercel/Supabase Cloud.

### Altro
- 📜 **[Changelog Storico](docs/changelog.md)**: Tutte le novità e le release precedenti.

---

*PerixMonitor - Sviluppato per la massima precisione e privacy finanziaria.*
