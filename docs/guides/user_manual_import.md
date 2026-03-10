# Guida Formati File di Importazione (Ingestion)

Questa guida descrive i requisiti tecnici per i file Excel/CSV accettati dal sistema PerixMonitor.

> [!IMPORTANT]
> **Tutte le importazioni sono basate sul NOME della colonna (Header) e NON sulla posizione.** 
> L'ordine delle colonne è irrilevante, ma i nomi devono contenere parole chiave specifiche (case-insensitive).
> **Se una riga non contiene TUTTI i campi obbligatori per il tipo di file, verrà SCARTATA.**

---

## 1. Transazioni (Acquisti/Vendite)
File utilizzato per registrare i movimenti di portafoglio (Acquisti e Vendite).

### Identificazione
Il sistema riconosce questo formato se trova la colonna **`Operazione`**.

### Colonne Obbligatorie (TUTTE RICHIESTE)
Il file deve contenere **necessariamente** questi dati per ogni riga valida.
*Sono accettati diversi alias per ogni colonna (l'importante è usarne uno).*

1.  **ISIN**
    *   Header: `isin`, `codice isin`
2.  **Descrizione Asset**
    *   Header: `descrizione`, `titolo`, `descrizione asset`, `descrizione titolo`, `nome`
3.  **Quantità**
    *   Header: `quantità`, `quantity`, `q.tà`
4.  **Prezzo Operazione (EUR)**
    *   Header: `prezzo operazione (eur)`, `prezzo operazione`
5.  **Operazione**
    *   Header: `operazione`
    *   Valori ammessi: `Acquisto`, `Vendita` (Case-insensitive)
6.  **Data (Acquisto/Vendita)**
    *   Header: `data`, `data operazione`, `data (acquisto/vendita)`

6.  **Tipologia**
    *   Header: `tipologia`, `tipo strumento`, `asset class`
    *   Regola: **Obbligatoria per "Acquisto"**, Opzionale per "Vendita".
    *   Nota: Se presente, il valore sovrascriverà quello esistente in anagrafica.

### Colonne Opzionali
*   (Nessuna specifica per le transazioni oltre a quelle base, ma vedi sopra per Tipologia in Vendita)

### Regole di Validazione
*   Le transazioni devono essere coerenti cronologicamente (non è possibile vendere un asset prima di averlo acquistato nello storico fornito).
*   Se il saldo progressivo di un asset diventa negativo durante l'importazione, l'operazione verrà bloccata con errore.

---

## 2. Cedole e Dividendi / Spese e Costi
File utilizzato per importare lo storico dei flussi di cassa (incassi e uscite).

### Identificazione
Il sistema riconosce questo formato se trova la colonna **`Valore Cedola (EUR)`**.

### Colonne Obbligatorie
1.  **ISIN**
    *   Header: `isin`, `codice isin`
2.  **Valore Cedola (EUR)**
    *   Header: `valore cedola (eur)`
    *   Nota: Può contenere valori **positivi** (cedole, dividendi) e **negativi** (spese, costi, tasse).
3.  **Data Flusso**
    *   Header: `data flusso`, `data stacco`, `data`

### Classificazione Automatica per Tipo
Il sistema classifica automaticamente ogni riga in base al **segno dell'importo**:
*   **Importo positivo** → Tipo `DIVIDEND` (cedola, dividendo, incasso)
*   **Importo negativo** → Tipo `EXPENSE` (spesa, costo, tassa)

Questo permette di avere **entries separate** per cedole e spese sullo stesso asset nella stessa data (vincolo DB: `portfolio_id + asset_id + date + type`).

### Aggregazione Automatica
*   Se il file contiene **più righe** con lo stesso ISIN, stessa data e stesso tipo, gli importi vengono **sommati automaticamente** in un'unica entry prima dell'importazione.
*   Se nel database esistono già entries per lo stesso asset/data/tipo, il sistema mostra il **totale attuale in archivio** e il **risultato finale** dopo l'importazione (somma).

### Riconciliazione Visiva
La modale di riconciliazione mostra un riepilogo per asset con **sezioni separate**:
*   **Cedole e Dividendi** (icona indaco): per tutti i flussi positivi.
*   **Spese e Costi** (icona arancione): per tutti i flussi negativi.

Per ogni asset vengono mostrate le colonne:
| Colonna | Significato |
|---------|-------------|
| In Archivio | Totale attualmente salvato nel DB per quel tipo |
| Nuovi Incassi / Nuovi Costi | Importo proveniente dal file corrente |
| Dopo Importazione | Totale risultante (archivio + nuovo) |

### Note
*   L'ISIN deve corrispondere ad un asset già presente in portafoglio, altrimenti la riga verrà segnalata come errore.

---

## 3. Storico Prezzi / Aggiornamento Prezzi
File utilizzato per aggiornare o ricostruire lo storico dei prezzi di mercato.

### Identificazione
Il sistema assume questo formato se il file **NON** contiene le colonne `Operazione` o `Valore Cedola (EUR)`.

### Colonne Obbligatorie
1.  **ISIN**
    *   Header: `isin`, `codice isin`
2.  **Prezzo**
    *   Header: `prezzo corrente (eur)`, `prezzo`, `chiusura`, `last`, `quotazione`
3.  **Data**
    *   Header: `data`, `date`

### Colonne Opzionali
*   **Descrizione Asset**
    *   Header: `descrizione`, `titolo`, `descrizione asset`, `nome`
    *   Nota: Se presente, può essere usata per aggiornare o creare l'anagrafica dell'asset.

### Note
*   È possibile inserire più righe con date diverse per lo stesso ISIN (per ricostruire lo storico).
*   Se un ISIN non è presente nel portafoglio, verrà ignorato (con warning).
*   Se sono presenti prezzi diversi per lo stesso ISIN nella stessa data, verrà generato un warning e usato l'ultimo valore.

---

## 4. Logica di Ingestion ed Errori (Protocollo Semplificato)
 
L'importazione dei file Excel segue una logica diretta basata sulle operazioni di transazione:
 
### 4.1 Transazioni (Acquisto / Vendita)
Se una riga contiene un'operazione esplicita (**"Acquisto"** o **"Vendita"**), il valore nella colonna **Quantità** indica esattamente il numero di quote acquistate o vendute (Transaction Delta).
-   **Acquisto**: Le quote vengono *sommate* al portafoglio esistente.
-   **Vendita**: Le quote vengono *sottratte* dal portafoglio esistente.
    -   *Errore*: Se si tenta di vendere una quantità superiore a quella posseduta nel database, l'operazione viene bloccata (`ERROR_NEGATIVE_QTY`).
 
### 4.2 Aggiornamento Prezzi
Se una riga **NON** contiene alcuna operazione:
-   Il sistema considera la riga come **Aggiornamento di Prezzo**.
-   **Controllo**: La quantità indicata nel file DEVE corrispondere a quella presente nel database.
    -   *Eccezione*: Se la cella **Quantità è vuota**, il sistema ignora il controllo (valido per aggiornamenti listino).
-   **Errore**: Se la quantità è **presente ma diversa** da quella in DB (e.g. file dice 100, DB ha 50), il sistema genera un errore di discrepanza (`ERROR_QTY_MISMATCH_NO_OP`). Questo segnala una probabile operazione mancante.
-   **Risultato**: L'ingestion viene bloccata per quella riga.
 
### 4.3 Logica Semplificata (Transaction-Only)
Il sistema **NON** effettua più una riconciliazione "State-Based" (confronto saldo totale).
-   Non verifica se un asset presente nel DB manca nel file Excel.
-   Non calcola automaticamente delta per allineare le quantità totali.
-   Si basa **esclusivamente** sulle operazioni esplicite dichiarate nel file.
 
### 4.4 Regole di Coerenza (Strict Checks)
Per le operazioni dichiarate (**Acquisto** o **Vendita**), il sistema applica regole rigide:
1.  **Quantità Obbligatoria**: La cella *Quantità* non può essere vuota.
2.  **Prezzo Operazione Obbligatorio**: La cella *Prezzo Operazione* deve essere presente.
Se manca uno di questi dati, l'operazione viene segnalata come **Incompleta** (`ERROR_INCOMPLETE_OP`) e l'ingestione viene bloccata per quella riga.
