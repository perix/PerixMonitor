"""
Modulo Ingestion per PerixMonitor
Gestisce 3 casi distinti:
- CASO 1: Acquisti/Vendite (campo "Operazione" presente)
- CASO 2: Cedole/Dividendi (campo "Valore Cedola (EUR)" presente)
- CASO 3: Aggiornamento Prezzi (default)
"""

import pandas as pd
import numpy as np
from datetime import datetime
from collections import defaultdict

try:
    from .logger import log_ingestion_start, log_ingestion_summary, logger
except ImportError:
    from logger import log_ingestion_start, log_ingestion_summary, logger


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def clean_money_value(val):
    """
    Parsing robusto di valori monetari da stringhe o numeri.
    Gestisce:
    - "5.05 €" -> 5.05
    - "1.200,50" -> 1200.50 (Formato IT)
    - "1,200.50" -> 1200.50 (Formato US)
    - None/NaN -> 0.0
    """
    if pd.isna(val) or val is None:
        return 0.0
    
    if isinstance(val, (int, float)):
        return float(val)
        
    s = str(val).strip()
    s = s.replace('€', '').replace('$', '').strip()
    
    # Euristiche per separatori
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):  # 1.200,50
            s = s.replace('.', '').replace(',', '.')
        else:  # 1,200.50
            s = s.replace(',', '')
    elif ',' in s:
        # Assumiamo standard IT: virgola = decimale
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) == 2: 
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '.')
             
    try:
        return float(s)
    except:
        return 0.0


def parse_date(raw_date):
    """
    Parsing robusto di date da vari formati.
    Ritorna stringa YYYY-MM-DD o None se non parsabile.
    """
    if pd.isna(raw_date) or raw_date is None:
        return None
        
    try:
        if isinstance(raw_date, datetime):
            return raw_date.strftime("%Y-%m-%d")
        
        str_d = str(raw_date).strip()
        
        # Gestione formato con /
        if '/' in str_d:
            pd_date = pd.to_datetime(str_d, dayfirst=True)
        else:
            pd_date = pd.to_datetime(str_d)
            
        return pd_date.strftime("%Y-%m-%d")
    except:
        return None


def find_column(df_columns, candidates):
    """
    Trova la prima colonna che matcha uno dei candidati.
    Ritorna il nome della colonna o None.
    """
    for candidate in candidates:
        if candidate in df_columns:
            return candidate
    return None


def normalize_columns(df):
    """Normalizza i nomi delle colonne: lowercase e strip."""
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


# =============================================================================
# MAIN DISPATCHER
# =============================================================================

def parse_portfolio_excel(file_stream, holdings_map=None):
    """
    Dispatcher principale che analizza il file e delega al parser corretto.
    
    Logica di identificazione:
    1. Se presente "valore cedola (eur)" → CASO 2 (Cedole/Dividendi)
    2. Se presente "operazione" → CASO 1 (Acquisti/Vendite)
    3. Altrimenti → CASO 3 (Aggiornamento Prezzi)
    
    holdings_map: dict {isin: quantity} per validazione vendite.
    """
    try:
        # Lettura file (Excel o CSV)
        try:
            df = pd.read_excel(file_stream)
        except:
            file_stream.seek(0)
            df = pd.read_csv(file_stream, sep=None, engine='python')
        
        df = normalize_columns(df)
        cols = set(df.columns)
        
        if df.empty:
            return {"data": [], "error": "Il file è vuoto o non contiene dati leggibili."}
        
        logger.info(f"Colonne rilevate nel file: {list(cols)}")
        
        # CASO 2: Cedole/Dividendi (trigger: "valore cedola (eur)")
        if "valore cedola (eur)" in cols:
            logger.info("Tipo file rilevato: CEDOLE/DIVIDENDI")
            return parse_dividends_file(df)
        
        # CASO 1: Acquisti/Vendite (trigger: "operazione")
        if "operazione" in cols:
            logger.info("Tipo file rilevato: ACQUISTI/VENDITE")
            return parse_transactions_file(df, holdings_map)
        
        # CASO 3: Aggiornamento Prezzi (default)
        logger.info("Tipo file rilevato: AGGIORNAMENTO PREZZI")
        return parse_prices_file(df)
        
    except Exception as e:
        logger.error(f"Errore parsing file: {e}")
        return {"data": [], "error": str(e)}


# =============================================================================
# CASO 1: ACQUISTI E VENDITE
# =============================================================================

def parse_transactions_file(df, holdings_map=None):
    """
    Parser per file Acquisti/Vendite.
    
    Campi obbligatori:
    - ISIN
    - Descrizione Asset
    - Quantità
    - Data (acquisto/vendita)
    - Prezzo Operazione (EUR)
    - Operazione ("Acquisto" o "Vendita")
    - Tipologia
    
    Validazioni:
    - Operazione deve essere "Acquisto" o "Vendita"
    - Ordine cronologico per validare che non si vendano asset non posseduti
    - Quantità non può diventare negativa
    """
    col_map = {
        'isin': ['isin', 'codice isin'],
        'description': ['descrizione asset', 'descrizione', 'titolo', 'descrizione strumento', 'descrizione titolo'],
        'quantity': ['quantità', 'quantity', 'q.tà', 'quantitÃ\xa0', 'quantitÃ'], # Handle potential encoding issues
        'date': ['data (acquisto/vendita)', 'data', 'data operazione'],
        'price': ['prezzo operazione (eur)', 'prezzo operazione'],
        'operation': ['operazione'],
        'asset_type': ['tipologia', 'tipo strumento', 'asset class', 'tipo']
    }
    
    transactions = []
    errors = []
    
    for index, row in df.iterrows():
        row_num = index + 2  # +2 per header e 0-index
        
        try:
            # 1. ISIN (Obbligatorio)
            isin_col = find_column(df.columns, col_map['isin'])
            if not isin_col or pd.isna(row[isin_col]):
                errors.append(f"Riga {row_num}: ISIN mancante")
                continue
            isin = str(row[isin_col]).strip().upper()
            if len(isin) < 5:
                errors.append(f"Riga {row_num}: ISIN non valido '{isin}'")
                continue
            
            # 2. Descrizione (Obbligatorio)
            desc_col = find_column(df.columns, col_map['description'])
            if not desc_col or pd.isna(row[desc_col]):
                errors.append(f"Riga {row_num}: Descrizione mancante per ISIN {isin}")
                continue
            description = str(row[desc_col]).strip()
            
            # 3. Quantità (Obbligatorio)
            qty_col = find_column(df.columns, col_map['quantity'])
            if not qty_col:
                errors.append(f"Riga {row_num}: Colonna Quantità non trovata")
                continue
            quantity = clean_money_value(row[qty_col])
            if quantity <= 0:
                errors.append(f"Riga {row_num}: Quantità deve essere positiva per ISIN {isin}")
                continue
            
            # 4. Data (Obbligatorio)
            date_col = find_column(df.columns, col_map['date'])
            if not date_col:
                errors.append(f"Riga {row_num}: Colonna Data non trovata")
                continue
            date = parse_date(row[date_col])
            if not date:
                errors.append(f"Riga {row_num}: Data non valida per ISIN {isin}")
                continue
            
            # 5. Prezzo (Obbligatorio)
            price_col = find_column(df.columns, col_map['price'])
            if not price_col:
                errors.append(f"Riga {row_num}: Colonna Prezzo Operazione non trovata")
                continue
            price = clean_money_value(row[price_col])
            
            # 6. Operazione (Obbligatorio: "Acquisto" o "Vendita")
            op_col = find_column(df.columns, col_map['operation'])
            if not op_col or pd.isna(row[op_col]):
                errors.append(f"Riga {row_num}: Operazione mancante per ISIN {isin}")
                continue
            operation = str(row[op_col]).strip().lower()
            if operation not in ['acquisto', 'vendita']:
                errors.append(f"Riga {row_num}: Operazione '{row[op_col]}' non valida. Usare 'Acquisto' o 'Vendita'")
                continue
            operation = 'Acquisto' if operation == 'acquisto' else 'Vendita'
            
            # 7. Tipologia (Obbligatorio per Acquisto, Opzionale per Vendita)
            asset_type = None
            type_col = find_column(df.columns, col_map['asset_type'])
            
            if type_col and pd.notna(row[type_col]):
                asset_type = str(row[type_col]).strip()
            
            if operation == 'Acquisto' and not asset_type:
                 errors.append(f"Riga {row_num}: Tipologia obbligatoria per Acquisto (ISIN {isin})")
                 continue
            
            transactions.append({
                'isin': isin,
                'description': description,
                'quantity': quantity,
                'date': date,
                'price': price,
                'operation': operation,
                'asset_type': asset_type
            })
            
        except Exception as e:
            errors.append(f"Riga {row_num}: Errore parsing - {str(e)}")
            continue
    
    if not transactions:
        return {
            "type": "TRANSACTIONS",
            "data": [],
            "error": "Nessuna transazione valida trovata. " + "; ".join(errors[:5])
        }
    
    # Validazione cronologica
    validation_result = validate_transactions_chronology(transactions, holdings_map)
    if validation_result['error']:
        return {
            "type": "TRANSACTIONS",
            "data": [],
            "error": validation_result['error']
        }
    
    # Log warnings se presenti
    if errors:
        logger.warning(f"Transazioni con warning: {errors[:10]}")
    
    return {
        "type": "TRANSACTIONS",
        "data": validation_result['validated_transactions'],
        "warnings": errors if errors else None,
        "error": None
    }


def validate_transactions_chronology(transactions, holdings_map=None):
    """
    Valida che le transazioni rispettino la cronologia:
    - Non si può vendere più di quanto posseduto (considerando holdings opzionali e tolleranza 0.01)
    - Ordina per data e verifica running balance
    """
    # Raggruppa per ISIN
    by_isin = defaultdict(list)
    for tx in transactions:
        by_isin[tx['isin']].append(tx)
    
    validated = []
    errors = []
    
    # Init mappa holdings se None
    if holdings_map is None:
        holdings_map = {}
    
    for isin, txs in by_isin.items():
        # Ordina per data
        txs_sorted = sorted(txs, key=lambda x: x['date'])
        
        # Init running quantity da DB se presente, altrimenti 0
        running_qty = holdings_map.get(isin, 0.0)
        logger.info(f"INGEST DEBUG: Validation {isin} - Start Qty: {running_qty}")
        is_new = True 
        
        for tx in txs_sorted:
            if tx['operation'] == 'Acquisto':
                running_qty += tx['quantity']
            else:  # Vendita
                # Calcola rimanenza teorica
                remaining = running_qty - tx['quantity']
                
                # Tolleranza: se < -0.01 -> ERRORE
                # Tolleranza: se < -0.01 -> ERRORE
                if remaining < -0.01:
                    # Invece di bloccare tutto, segniamo questa transazione come ERRORE
                    # e continuiamo, così l'utente lo vede nella tabella.
                    logger.warning(f"INGEST: Negative Qty Error for {isin}. Remaining would be {remaining}")
                    
                    tx_copy = tx.copy()
                    tx_copy['operation'] = 'ERROR_NEGATIVE_QTY' 
                    # quantity is preserved
                    # details/description can be enhanced in index.py
                    
                    # NON aggiorniamo running_qty. Assumiamo che la vendita non avvenga.
                    # Ma dobbiamo decidere se le vendite successive falliranno.
                    # Probabilmente sì, ma è corretto che l'utente veda tutto ciò che non va.
                    
                    validated.append(tx_copy)
                    # Skip update of running_qty and appending normal tx
                    continue
                
                # Se tra -0.01 e 0.01 -> considera 0
                if abs(remaining) < 0.01:
                    remaining = 0.0
                
                running_qty = remaining
            
            # Aggiungi info se è nuovo asset
            tx_copy = tx.copy()
            tx_copy['is_new_asset'] = is_new and tx['operation'] == 'Acquisto'
            tx_copy['running_quantity'] = running_qty
            validated.append(tx_copy)
            
            if tx['operation'] == 'Acquisto':
                is_new = False
    
    return {
        'error': None,
        'validated_transactions': validated
    }


# =============================================================================
# CASO 2: CEDOLE / DIVIDENDI
# =============================================================================

def parse_dividends_file(df):
    """
    Parser per file Cedole/Dividendi.
    
    Campi obbligatori:
    - ISIN
    - Valore Cedola (EUR) - può essere negativo (spese)
    - Data Flusso
    
    Nota: L'ISIN deve esistere in portafoglio (validato a livello API)
    """
    col_map = {
        'isin': ['isin', 'codice isin'],
        'amount': ['valore cedola (eur)'],
        'date': ['data flusso', 'data stacco', 'data']
    }
    
    dividends = []
    errors = []
    
    for index, row in df.iterrows():
        row_num = index + 2
        
        try:
            # 1. ISIN (Obbligatorio)
            isin_col = find_column(df.columns, col_map['isin'])
            if not isin_col or pd.isna(row[isin_col]):
                errors.append(f"Riga {row_num}: ISIN mancante")
                continue
            isin = str(row[isin_col]).strip().upper()
            if len(isin) < 5:
                errors.append(f"Riga {row_num}: ISIN non valido '{isin}'")
                continue
            
            # 2. Valore Cedola (Obbligatorio - può essere negativo)
            amount_col = find_column(df.columns, col_map['amount'])
            if not amount_col:
                errors.append(f"Riga {row_num}: Colonna 'Valore Cedola (EUR)' non trovata")
                continue
            # NON usiamo abs() - ammessi valori negativi per spese
            amount = clean_money_value(row[amount_col])
            
            # 3. Data Flusso (Obbligatorio)
            date_col = find_column(df.columns, col_map['date'])
            if not date_col:
                errors.append(f"Riga {row_num}: Colonna Data Flusso non trovata")
                continue
            date = parse_date(row[date_col])
            if not date:
                errors.append(f"Riga {row_num}: Data non valida per ISIN {isin}")
                continue
            
            dividends.append({
                'isin': isin,
                'amount': amount,
                'date': date
            })
            
        except Exception as e:
            errors.append(f"Riga {row_num}: Errore parsing - {str(e)}")
            continue
    
    # [NEW] Aggregazione: Somma valori per stesso ISIN, Data e Tipo nel file
    # Type is determined by sign: positive = DIVIDEND, negative = EXPENSE
    if dividends:
        from collections import defaultdict
        aggregated = defaultdict(float)  # (isin, date, type) -> amount
        for d in dividends:
            d_type = 'EXPENSE' if d['amount'] < 0 else 'DIVIDEND'
            key = (d['isin'], d['date'], d_type)
            aggregated[key] += d['amount']
        dividends = [{'isin': k[0], 'date': k[1], 'type': k[2], 'amount': v} for k, v in aggregated.items()]
        logger.info(f"DIVIDENDS: Aggregated to {len(dividends)} unique (isin, date, type) entries.")

    if not dividends:
        return {
            "type": "DIVIDENDS",
            "data": [],
            "error": "Nessuna cedola/dividendo valido trovato. " + "; ".join(errors[:5])
        }
    
    if errors:
        logger.warning(f"Cedole con warning: {errors[:10]}")
    
    return {
        "type": "DIVIDENDS",
        "data": dividends,
        "warnings": errors if errors else None,
        "error": None
    }


# =============================================================================
# CASO 3: AGGIORNAMENTO PREZZI
# =============================================================================

def parse_prices_file(df):
    """
    Parser per file Aggiornamento Prezzi.
    
    Campi obbligatori:
    - ISIN
    - Data
    - Prezzo Corrente (EUR)
    
    Note:
    - Più date per stesso ISIN ammesse
    - Solo asset in portafoglio vengono salvati (validato a livello API)
    - Stesso ISIN+data con prezzi diversi = warning
    """
    col_map = {
        'isin': ['isin', 'codice isin'],
        'date': ['data', 'date'],
        'price': ['prezzo corrente (eur)', 'prezzo', 'chiusura', 'last', 'quotazione', 'ultimo']
    }
    
    prices = []
    errors = []
    warnings = []
    
    # Traccia duplicati ISIN+data
    seen_prices = {}  # (isin, date) -> price
    
    # Campo Opzionale: Descrizione
    desc_keys = ['descrizione', 'titolo', 'descrizione asset', 'nome', 'descrizione titolo']
    
    for index, row in df.iterrows():
        row_num = index + 2
        
        try:
            # 1. ISIN (Obbligatorio)
            isin_col = find_column(df.columns, col_map['isin'])
            if not isin_col or pd.isna(row[isin_col]):
                errors.append(f"Riga {row_num}: ISIN mancante")
                continue
            isin = str(row[isin_col]).strip().upper()
            if len(isin) < 5:
                errors.append(f"Riga {row_num}: ISIN non valido '{isin}'")
                continue
            
            # 2. Data (Obbligatorio)
            date_col = find_column(df.columns, col_map['date'])
            if not date_col:
                errors.append(f"Riga {row_num}: Colonna Data non trovata")
                continue
            date = parse_date(row[date_col])
            if not date:
                errors.append(f"Riga {row_num}: Data non valida per ISIN {isin}")
                continue
            
            # 3. Prezzo (Obbligatorio)
            price_col = find_column(df.columns, col_map['price'])
            if not price_col:
                errors.append(f"Riga {row_num}: Colonna Prezzo non trovata")
                continue
            price = clean_money_value(row[price_col])
            
            # [DEBUG] Log raw vs clean
            # logger.debug(f"Row {row_num} ISIN {isin}: Raw price '{row[price_col]}' -> Clean {price}")

            if price <= 0:
                errors.append(f"Riga {row_num}: Prezzo deve essere positivo per ISIN {isin}")
                continue
            
            # 4. Descrizione (Opzionale)
            description = None
            desc_col = find_column(df.columns, desc_keys)
            if desc_col and pd.notna(row[desc_col]):
                description = str(row[desc_col]).strip()

            # Check duplicati ISIN+data con prezzi diversi
            key = (isin, date)
            if key in seen_prices:
                if abs(seen_prices[key] - price) > 0.0001:
                    warnings.append(
                        f"ISIN {isin} data {date}: prezzi multipli rilevati "
                        f"({seen_prices[key]} vs {price}). Usato ultimo valore."
                    )
                    seen_prices[key] = price  # Usa ultimo
                continue  # Skip duplicato
            
            seen_prices[key] = price
            
            item = {
                'isin': isin,
                'date': date,
                'price': price,
                'source': 'Manual Upload'
            }
            if description:
                item['description'] = description
                
            prices.append(item)
            
        except Exception as e:
            errors.append(f"Riga {row_num}: Errore parsing - {str(e)}")
            continue
    
    logger.info(f"[DEBUG_PRICES] Found {len(prices)} valid price entries.")
    if prices:
        logger.info(f"[DEBUG_PRICES] First entry: {prices[0]}")

    if not prices:
        return {
            "type": "PRICES",
            "data": [],
            "error": "Nessun prezzo valido trovato. " + "; ".join(errors[:5])
        }
    
    if errors:
        logger.warning(f"Prezzi con errori: {errors[:10]}")
    
    return {
        "type": "PRICES",
        "data": prices,
        "warnings": warnings if warnings else None,
        "error": None
    }
