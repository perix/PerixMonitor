import pandas as pd
import numpy as np
from datetime import datetime
try:
    from .logger import log_ingestion_start, log_ingestion_item, log_ingestion_summary, log_final_state, logger
except ImportError:
    from logger import log_ingestion_start, log_ingestion_item, log_ingestion_summary, log_final_state, logger

def parse_portfolio_excel(file_stream, debug=False):
    # Expected columns for Portfolio: A-I (9 columns)
    # Expected for Dividends: A-C (3 columns): ISIN, Amount, Date
    
    try:
        log_ingestion_start("Uploaded File Stream")
        df = pd.read_excel(file_stream)
        
        # --- DIVIDEND/COUPON DETECTION MODE ---
        # Heuristic: Check if column 3 (index 2) is specifically "Data Flusso"
        # This allows for extra columns as long as we have the core structure.
        is_dividend_file = False
        if df.shape[1] >= 3:
             # Check header of 3rd column (index 2)
            col3_header = str(df.columns[2]).strip().lower()
            if col3_header == "data flusso":
                is_dividend_file = True
                if debug: logger.info("Detected patterns for Dividend/Flow File (Header 'Data Flusso')")

        if is_dividend_file:
            dividends = []
            for idx, row in df.iterrows():
                # Expected: Col 0 = ISIN, Col 1 = Amount, Col 2 = Date
                if pd.isna(row.iloc[0]): continue
                
                isin = str(row.iloc[0]).strip()
                # [MODIFIED] Allow negative amounts (expenses)
                amount = float(row.iloc[1]) if not pd.isna(row.iloc[1]) else 0.0
                date_val = row.iloc[2]
                
                # Date parsing
                if pd.isna(date_val): 
                    date_val = None
                else:
                    try:
                        date_val = str(date_val)
                    except:
                        date_val = None
                
                # [MODIFIED] Check amount is not 0 (allow negative)
                if isin and abs(amount) > 0 and date_val:
                    dividends.append({
                        "isin": isin,
                        "amount": amount,
                        "date": date_val
                    })
            
            return {"type": "KPI_DIVIDENDS", "data": dividends, "message": f"Rilevate {len(dividends)} cedole/dividendi/spese."}


        # --- STANDARD PORTFOLIO INGESTION MODE ---
        if df.shape[1] < 8:
            columns_found = df.columns.tolist()
            if debug: logger.error(f"PARSE FAIL: Insufficient columns. Found {len(columns_found)}: {columns_found}")
            return {"error": f"Insufficient columns. Expected at least 8 (Portfolio) or 3 (Dividends), found {len(columns_found)}"}

        data = []
        for idx, row in df.iterrows():
            if pd.isna(row.iloc[1]): 
                continue
            
            isin = str(row.iloc[1]).strip()
            # ... (parsing logic) ...
            # Qty can be None (Price Update only) or float
            qty = float(row.iloc[2]) if not pd.isna(row.iloc[2]) else None
            
            # log_ingestion_item(isin, "PARSED", f"Row {idx+2}: Qty={qty} Op={row.iloc[6]}") # Silent in normal mode

            # Handle NaT (Not a Time) converting to None
            date_val = row.iloc[5]
            if pd.isna(date_val): 
                date_val = None
            else:
                try:
                    # Ensure it's a string or datetime compatible with JSON
                    date_val = str(date_val)
                except:
                    date_val = None
            
            # [NEW] Parse Asset Type dynamically by column name or fallback to index 9
            asset_type = None
            
            # 1. Try to find column by header name
            type_col_idx = -1
            for i, col_name in enumerate(df.columns):
                c_str = str(col_name).lower().strip()
                if "tipologia" in c_str or "asset class" in c_str or ("tipo" in c_str and "strumento" in c_str):
                    type_col_idx = i
                    break
            
            # Log debug info
            if debug:
                logger.info(f"INGEST DEBUG: Columns found: {df.columns.tolist()}")
                logger.info(f"INGEST DEBUG: Asset Type Column Detection -> Index: {type_col_idx} (Name match)")
            
            # 2. Fallback to column index 9 (J) if specifically 10+ columns and no header matched
            if type_col_idx == -1 and df.shape[1] > 9:
                type_col_idx = 9
                if debug: logger.info(f"INGEST DEBUG: Fallback to Index 9 for Asset Type")
            
            if type_col_idx != -1 and type_col_idx < df.shape[1]:
                raw_type = row.iloc[type_col_idx]
                if not pd.isna(raw_type):
                    asset_type = str(raw_type).strip().capitalize()
            
            if debug and idx < 3: # Debug first 3 rows
                 logger.info(f"INGEST DEBUG Row {idx}: ISIN={isin}, TypeRaw={row.iloc[type_col_idx] if type_col_idx != -1 else 'N/A'}, Extracted={asset_type}")

            entry = {
                "description": row.iloc[0],
                "isin": isin,
                "quantity": qty,
                "currency": row.iloc[3],
                "avg_price_eur": float(row.iloc[4]) if not pd.isna(row.iloc[4]) else 0.0,
                "date": date_val, 
                "operation": str(row.iloc[6]).strip() if not pd.isna(row.iloc[6]) else None,
                "op_price_eur": float(row.iloc[7]) if not pd.isna(row.iloc[7]) else 0.0,
                "current_price": float(row.iloc[8]) if df.shape[1] > 8 and not pd.isna(row.iloc[8]) else None,
                "asset_type": asset_type
            }
            data.append(entry)
            
        result = {
            "type": "PORTFOLIO_SYNC", 
            "data": data
        }
        
        if debug:
            result["debug"] = {
                "columns_found": df.columns.tolist(),
                "asset_type_col_index": type_col_idx
            }
            
        return result
            
    except Exception as e:
        logger.error(f"PARSE EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": f"Parse Error: {str(e)}"}

def calculate_delta(excel_data, db_holdings, ignore_missing=True):
    # db_holdings structure: {isin: {"qty": float, "metadata": dict}} OR {isin: float} (legacy fallback)
    # [SIMPLIFIED LOGIC]
    # 1. If column 'Operation' is "Acquisto"/"Vendita" -> Qty is TRANSACTION AMOUNT (Delta).
    # 2. If 'Operation' is NOT present -> Price Update Only. Ignore Qty.
    # 3. No "Missing Asset" checks. (ignore_missing is effectively always True).
    
    delta_actions = []
    
    for row in excel_data:
        isin = row['isin']
        excel_qty = row['quantity'] # In this new logic, this is POTENTIALLY the transaction amount.
        
        # Unpack DB info safely
        db_entry = db_holdings.get(isin)
        db_qty = 0.0
        db_type = None
        
        if isinstance(db_entry, dict):
            db_qty = db_entry.get("qty", 0.0)
            meta = db_entry.get("metadata") or {}
            db_type = meta.get("assetType")
        elif isinstance(db_entry, (int, float)):
             db_qty = float(db_entry)
        
        # Check Operation
        op_declared = row.get('operation')
        op_str = str(op_declared).strip().lower() if op_declared else ""
        is_explicit_buy = (op_str == 'acquisto' or op_str == 'buy')
        is_explicit_sell = (op_str == 'vendita' or op_str == 'sell')
        
        # Logic Branching
        diff = 0.0
        new_total_qty = db_qty
        action_type = None
        is_price_only = False
        
        if is_explicit_buy:
            if excel_qty is None:
                 log_ingestion_item(isin, "ERROR_MISSING_QTY", "Buy Op but No Qty")
                 delta_actions.append({"isin": isin, "type": "ERROR_QTY_MISMATCH", "quantity_change": 0, "current_db_qty": db_qty, "new_total_qty": db_qty, "details": "Operazione Acquisto senza quantità."})
                 continue
                 
            diff = excel_qty
            new_total_qty = db_qty + excel_qty
            action_type = "Acquisto"
            
        elif is_explicit_sell:
            if excel_qty is None:
                 log_ingestion_item(isin, "ERROR_MISSING_QTY", "Sell Op but No Qty")
                 delta_actions.append({"isin": isin, "type": "ERROR_QTY_MISMATCH", "quantity_change": 0, "current_db_qty": db_qty, "new_total_qty": db_qty, "details": "Operazione Vendita senza quantità."})
                 continue

            # Validate: Cannot sell more than owned
            if excel_qty > db_qty + 1e-6: # Tolerance
                log_ingestion_item(isin, "ERROR_NEGATIVE_QTY", f"Attempt to sell {excel_qty} > Owned {db_qty}")
                delta_actions.append({
                    "isin": isin,
                    "type": "ERROR_NEGATIVE_QTY",
                    "quantity_change": excel_qty,
                    "current_db_qty": db_qty,
                    "new_total_qty": db_qty - excel_qty,
                    "details": f"Tentativo di vendita ({excel_qty}) superiore alla quantità posseduta ({db_qty})."
                })
                continue
            
            diff = -excel_qty
            new_total_qty = db_qty - excel_qty
            action_type = "Vendita"
            
        else:
            # No Operation -> Price Update Only
            # [STRICT CHECK] If Quantity differs from DB, it's an error.
            # User might have forgotten to add "Acquisto"/"Vendita".
            # EXCEPTION: If excel_qty is NONE (Empty cell), we IGNORE IT. It is NOT a mismatch.
            
            if excel_qty is not None:
                diff = excel_qty - db_qty
                if abs(diff) > 1e-6:
                    log_ingestion_item(isin, "ERROR_MISMATCH_NO_OP", f"Qty mismatch {db_qty}->{excel_qty} but no Op.")
                    delta_actions.append({
                        "isin": isin,
                        "type": "ERROR_QTY_MISMATCH_NO_OP",
                        "quantity_change": diff,
                        "current_db_qty": db_qty,
                        "new_total_qty": excel_qty,
                        "details": "Quantità diversa dal DB ma nessuna operazione specificata. Verificare se manca Acquisto/Vendita."
                    })
                    continue

            # If Qty matches (or is None), treat as Price Update.
            is_price_only = True
            log_ingestion_item(isin, "PRICE_UPDATE", "No Op declared. Treating as Price Update only.")

        # Metadata Check (Asset Type)
        excel_type = row.get('asset_type')
        if excel_type and excel_type != db_type:
             log_ingestion_item(isin, "META_DIFF", f"Type change: DB='{db_type}' -> Excel='{excel_type}'")
             # We always include metadata update if changed, even for Price Updates
             # If it's Price Only, we generate a specific METADATA_UPDATE action if type changed
             if is_price_only:
                 delta_actions.append({
                    "isin": isin,
                    "type": "METADATA_UPDATE",
                    "quantity_change": 0,
                    "current_db_qty": db_qty,
                    "new_total_qty": db_qty,
                    "asset_type_proposal": excel_type,
                    "excel_description": row.get('description'),
                    "details": "Aggiornamento Anagrafica (Tipologia)"
                 })
        
        if is_price_only:
            continue # No transaction to record

        # Add Transaction Action
        op_price = row.get('op_price_eur')
        op_date = row.get('date')
        
        # New ISIN Check for Buying
        if db_qty == 0 and action_type == "Acquisto":
             # Ensure we have price and date for new asset
             if not (op_price and op_price > 0 and op_date):
                 log_ingestion_item(isin, "INCONSISTENT_NEW_ISIN", "New ISIN buy missing price/date")
                 delta_actions.append({
                    "isin": isin,
                    "type": "INCONSISTENT_NEW_ISIN",
                    "quantity_change": excel_qty, 
                    "current_db_qty": 0,
                    "new_total_qty": excel_qty,
                    "details": "Mancano dati operazione (Data/Prezzo) per nuovo titolo."
                 })
                 continue

        action = {
            "isin": isin,
            "type": action_type,
            "quantity_change": abs(diff),
            "excel_operation_declared": op_declared,
            "excel_price": op_price,
            "excel_date": op_date,
            "excel_description": row.get('description'), 
            "asset_type_proposal": row.get('asset_type'),
            "current_db_qty": db_qty,
            "new_total_qty": new_total_qty
        }
        delta_actions.append(action)
        log_ingestion_item(isin, "DELTA", f"{action_type} {abs(diff)} (NewTotal={new_total_qty})")

    # [SIMPLIFIED LOGIC] No Missing Check Loop.
    
    log_ingestion_summary(len(excel_data), len(delta_actions), 0)
    return delta_actions
