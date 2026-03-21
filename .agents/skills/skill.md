--- 
Skill name: api-recupero-informazioni-certificati
description: questa skill contiene le informazioni per accedre tramite API Rest alle informazioni relative a Certifiati Finanziari
--- 

## Accesso API per Web App Esterne

L'applicazione espone un'interfaccia API REST ottimizzata per l'integrazione con altre piattaforme o Web App che necessitano dei dati dei certificati già censiti.

### Endpoint Pubblico: Recupero Asset
Per recuperare i dati JSON di un singolo certificato tramite il suo ISIN:

**GET** `/api/asset/{ISIN}`

-   **Output**: JSON strutturato contenente le specifiche del certificato (`certificate`) e la lista dei suoi sottostanti (`underlyings`).
-   **Performance**: Questo endpoint interroga direttamente il database (Fast Access), garantendo tempi di risposta minimi.
-   **CORS**: L'endpoint è configurato per accettare richieste da qualsiasi origine (`Allow-Origin: *`).
-   **Autenticazione**: L'accesso è protetto. È necessario inviare la chiave autorizzata nell'header HTTP `X-API-KEY`.

#### Esempio di Risposta JSON
```json
{
  "isin": "IT0001234567",
  "expiry_date": "31/12/2026",
  "barrier_level": "60.0%",
  "barrier_type": "Down",
  "coupon_pct": "5.2",
  "coupon_freq": "Mensile",
  "next_coupon_date": "15/04/2026",
  "trigger_level": "100.0",
  "has_memory": true,
  "is_autocallable": true,
  "overall_status": "OK",
  "worst_of": {
    "name": "Eni S.p.A.",
    "ticker": "ENI.MI",
    "strike": 14.50,
    "barrier": 8.70,
    "current": 13.20,
    "dist": 34.09
  },
  "underlyings": [
    {
      "name": "Eni S.p.A.",
      "ticker": "ENI.MI",
      "strike": 14.50,
      "barrier": 8.70,
      "current": 13.20,
      "dist": 34.09
    }
  ],
  "from_cache": true
}
```

#### Esempio di Integrazione (JavaScript)
```javascript
const response = await fetch('https://tua-app.vercel.app/api/asset/IT0001234567');
const data = await response.json();
console.log(data.certificate.barrier_pct);
```
