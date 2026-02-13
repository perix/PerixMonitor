# Guida al Deployment su Vercel

Questa guida spiega come configurare l'applicazione per il deployment su Vercel, mantenendo la compatibilità con l'ambiente di sviluppo locale.

## 1. Prerequisiti
- Un account [GitHub](https://github.com/) con il repository del progetto aggiornato.
- Un account [Vercel](https://vercel.com/).
- Un progetto [Supabase](https://supabase.com/) configurato.

## 2. Configurazione del Progetto su Vercel

1. **Importa il Progetto**:
   - Dalla dashboard di Vercel, clicca su "Add New..." -> "Project".
   - Importa il repository GitHub di `PerixMonitor`.

2. **Configurazione Framework**:
   - Vercel dovrebbe rilevare automaticamente **Next.js**.
   - Assicurati che la directory di root sia corretta (solitamente `./`).

3. **Environment Variables**:
   Aggiungi le seguenti variabili d'ambiente nella sezione "Environment Variables" del progetto Vercel. Copia i valori dal tuo file `.env.local` o `.env.production`.

   | Nome Variabile | Descrizione |
   | :--- | :--- |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del tuo progetto Supabase. |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave pubblica anonima di Supabase. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Chiave service_role (per backend Python). **NON METTERE QUESTA NEI PREFISSI NEXT_PUBLIC**. |
   | `OPENAI_API_KEY` | Chiave API di OpenAI per le funzionalità LLM. |

4. **Deploy**:
   - Clicca su "Deploy".
   - Vercel installerà le dipendenze Python (`requirements.txt`) e Node.js (`package.json`) automaticamente.

## 3. Verifica del Funzionamento

### Locale (Development)
- Esegui `npm run dev` in un terminale.
- Esegui il backend Python (se non gestito automaticamente) in un altro terminale o usa lo script unico se presente.
- `next.config.ts` reindirizzerà le chiamate `/api/*` al server Python locale (`127.0.0.1:5328`).

### Cloud (Vercel Production)
- Naviga all'URL del tuo progetto (es. `perix-monitor.vercel.app`).
- Le chiamate verso `/api/*` verranno gestite automaticamente da Vercel utilizzando `api/index.py` come Serverless Function (grazie a `vercel.json`).

## Nota sui Costi e Limiti (Free Tier)
Il progetto è ottimizzato per restare nei piani gratuiti ("Hobby") a tempo indeterminato.

- **Vercel Free (Hobby)**:
  - **Serverless Function Duration**: Max **10 secondi** per default (estendibile a 60s in alcuni casi, ma non garantito).
  - **Rischio**: L'analisi di file Excel enormi o calcoli XIRR su migliaia di transazioni potrebbero andare in timeout.
  - **Funzioni Serverless**: Max 12 funzioni (qui ne usiamo 1 monolitica `api/index.py` che va bene).

- **Supabase Free**:
  - **Database Size**: Max **500MB**. Monitorare la dimensione se si caricano molti dati testuali/metadata.
  - **Egress**: Max 2GB banda in uscita (sufficiente per uso personale).
  - **Pause**: Il database viene messo in pausa dopo 7 giorni di inattività (riattivabile dal pannello Supabase).

- **Mitigazioni nel Codice**:
  - L'app usa il caching lato client per ridurre le chiamate al server.
  - I calcoli pesanti sono fatti in Python ma ottimizzati; in futuro si sposteranno sempre più aggregazioni su SQL per evitare timeout.

- **OpenAI**: Non ha free tier. È l'unico costo variabile (pochi centesimi al mese per uso personale). L'app funziona anche se la chiave non è configurata (le descrizioni asset non verranno arricchite).

---

## 4. Monitoraggio e Logs

Puoi visualizzare i logs dell'applicazione in produzione in due modi:

### Metodo 1: Vercel Dashboard (Consigliato)
1. Vai sulla tua dashboard Vercel.
2. Seleziona il progetto `perix-monitor` (o il nome del tuo progetto).
3. Clicca sulla tab **Logs** in alto.
4. Qui vedrai sia i logs di build (Deployment) che i logs di runtime (Application) in tempo reale.

### Metodo 2: Vercel CLI
Dal terminale del tuo IDE, puoi usare il comando:
```bash
npx vercel logs <tuo-dominio>
# Esempio:
npx vercel logs portmon.vercel.app
```
Questo mostrerà gli ultimi log e rimarrà in ascolto per nuovi output.

**Nota sul file `perix_monitor.log`:**
In ambiente di produzione (Vercel), il file `perix_monitor.log` **NON viene generato né persistito**, poiché il file system è effimero. Tutti i log dell'applicazione vengono invece inviati allo "Standard Output" e sono visibili nella Dashboard di Vercel come descritto sopra.

**In caso di problemi:**
Se il backend Python fallisce, controlla i logs per errori come "ModuleNotFoundError" (dipendenze mancanti in `requirements.txt`) o "KeyError" (variabili d'ambiente mancanti).

### Troubleshooting "npm run build"
Se la build fallisce su Vercel:
1. Controlla che le variabili `NEXT_PUBLIC_*` siano impostate (senza di esse la build frontend fallisce).
2. Prova a fare "Redeploy" disabilitando la cache ("Use existing build cache").
