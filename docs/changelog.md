# Changelog

Archivio storico delle release e delle funzionalità implementate in PerixMonitor.

## Release 2.7 - "Live Certificate Intelligence" (21/03/2026)

- **Integrazione API Esterna (Proxy)**:
    - Nuovo endpoint `/api/assets/<isin>/external` che agisce come proxy sicuro per l'API di `analisicertificati.vercel.app`.
    - Gestione sicura delle chiavi API (`API_KEY_AUTHORIZED`) lato backend per proteggere i segreti.
- **UI "Get Info" Certificati**:
    - Pulsante dedicato nel pannello dettagli dell'asset per scaricare dati live.
    - Layout dinamico: visualizzazione completa di Barriere (livello e tipo), Cedole (memoria, frequenza, prossimi stacchi), Autocall e Stato generale.
    - Sezione **Worst-Of** e **Sottostanti** con calcolo della distanza dalla barriera e codifica colore dinamica per i rischi (es. rosso per distanze < 10%).
    - Possibilità di switch immediato tra metadati DB storici e dati live API.

## Release 2.6 - "Price History & Performance" (10/03/2026)

- **Asset Price History Management**:
    - Nuova finestra modale per la gestione granulare dello storico prezzi (accessibile dal dettaglio asset).
    - Supporto per **Editing Diretto** (con validazione numerica e mantenimento precisione float) ed **Eliminazione** di punti prezzo manuali.
    - Feedback visivo immediato: prezzi modificati in rosso, righe eliminate semitrasparenti.
    - Ricalcolo automatico del trend ("Ultima Variazione") e refresh del portafoglio al salvataggio.

- **Ottimizzazioni Performance (Scalabilità)**:
    - **Filtro Temporale (Lazy Loading)**: Caricamento predefinito dell'ultimo anno di dati per minimizzare la latenza, con opzioni UI per caricare 2 anni o l'intero storico su richiesta.
    - **Virtualizzazione della Tabella**: Implementata logica di "windowing" che renderizza solo le righe visibili (costanti ~20 elementi DOM). Questo garantisce fluidità assoluta anche con serie storiche di migliaia di record.
    - **UI/UX Polishing**: Uniformità del separatore decimale (punto `.`), reset automatico dello scroll al cambio filtro e layout ottimizzato per prevenire sovrapposizioni.

## Release 2.5 - "Asynchronous Analytics & Robust Reporting" (04/03/2026)

- **Asynchronous LLM Processing**: 
    - Nuovo sistema a task asincroni (`/start`, `/status`) per gestire analisi AI di lunga durata senza timeout del browser.
- **Reporting PDF Avanzato**:
    - **Sanificazione Testo**: Funzione `clean_text_for_pdf` per gestire caratteri speciali.
    - **Logica Pro-rata Precisa**: Correzione del calcolo dei costi simulati (Consulenza, Patrimoniale).
    - **Visual Excellence**: Label migliorate e rendering robusto delle tabelle.

## Ottimizzazioni MWR e Dashboard Dinamica (28/02/2026)
- **Bugfix MWR Subset**: Risolto il problema di distorsione del MWR quando si filtra per sottoinsieme di asset.
- **Metriche Slider Dinamiche**: KPI card reagiscono istantaneamente allo slider temporale (approccio Modified Dietz).

## Release 2.0 - "Memory & Analysis" (14/02/2026)
- **Backup & Restore "Full Fidelity"**: Inclusione dello storico prezzi nel backup.
- **Gestione "Memory" & P&L**: Nuova pagina Note & Storico con aggregazione transazioni e P&L netto.
- **Modulo "Analysis"**: Breakdown Asset Allocation per classe e componente.

## UI Ingestion & Trend Logic (02/02/2026)
- **Blocking Overlay**: Schermata di attesa durante la sincronizzazione.
- **Trend Calculation Engine**: Logica unificata per calcolo trend (prezzo vs prezzo precedente).

## Integrazione AI & Audit (01/02/2026)
- **AI Avanzata**: Supporto GPT-5 e Responses API.
- **Native Web Search**: Ricerca web autonoma per dati asset.
- **Sistema di Audit**: Nuovo motore di logging professionale.

## Changelog GUI / Funzionalità (31/01/2026)
- **Layout Fluido**: Grafici flessibili e allineati.
- **Asse X Lineare**: Scala temporale reale nei grafici.
- **Statistiche Dinamiche**: Update real-time dei valori P&L e MWR nel dettaglio asset.
