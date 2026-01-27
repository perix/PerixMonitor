import pandas as pd
import numpy as np
from datetime import datetime
from logger import log_ingestion_start, log_ingestion_item, log_ingestion_summary, log_final_state, logger

def parse_portfolio_excel(file_stream):
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
                logger.info("Detected patterns for Dividend/Flow File (Header 'Data Flusso')")

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
            logger.error(f"PARSE FAIL: Insufficient columns. Found {len(columns_found)}: {columns_found}")
            return {"error": f"Insufficient columns. Expected at least 8 (Portfolio) or 3 (Dividends), found {len(columns_found)}"}

        data = []
        for idx, row in df.iterrows():
            if pd.isna(row.iloc[1]): 
                continue
            
            isin = str(row.iloc[1]).strip()
            # ... (parsing logic) ...
            qty = float(row.iloc[2]) if not pd.isna(row.iloc[2]) else 0.0
            
            log_ingestion_item(isin, "PARSED", f"Row {idx+2}: Qty={qty} Op={row.iloc[6]}")

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
            logger.info(f"INGEST DEBUG: Columns found: {df.columns.tolist()}")
            logger.info(f"INGEST DEBUG: Asset Type Column Detection -> Index: {type_col_idx} (Name match)")
            
            # 2. Fallback to column index 9 (J) if specifically 10+ columns and no header matched
            if type_col_idx == -1 and df.shape[1] > 9:
                type_col_idx = 9
                logger.info(f"INGEST DEBUG: Fallback to Index 9 for Asset Type")
            
            if type_col_idx != -1 and type_col_idx < df.shape[1]:
                raw_type = row.iloc[type_col_idx]
                if not pd.isna(raw_type):
                    asset_type = str(raw_type).strip().capitalize()

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
            
        return {
            "type": "PORTFOLIO_SYNC", 
            "data": data, 
            "debug": {
                "columns_found": df.columns.tolist(),
                "asset_type_col_index": type_col_idx
            }
        }
            
    except Exception as e:
        logger.error(f"PARSE EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": f"Parse Error: {str(e)}"}

def calculate_delta(excel_data, db_holdings, ignore_missing=False):
    # ...
    delta_actions = []
    processed_isins = set()
    
    for row in excel_data:
        isin = row['isin']
        excel_qty = row['quantity']
        processed_isins.add(isin)
        
        db_qty = db_holdings.get(isin, 0.0)
        diff = excel_qty - db_qty
        
        if abs(diff) < 1e-6:
            log_ingestion_item(isin, "SKIP", "No qty change")
            continue 

        # [MODIFIED] Check for "Price Only" update strategy
        # If Excel Qty is 0 (implied empty) and DB Qty > 0, traditionally this means SELL EVERYTHING.
        # But user wants to support "Price Update" only rows.
        # So we ONLY sell if "Vendita" (case insensitive) is explicitly declared.
        op_declared = row.get('operation')
        is_explicit_sell = op_declared and str(op_declared).strip().lower() == 'vendita'

        if excel_qty == 0 and db_qty > 0 and not is_explicit_sell:
             log_ingestion_item(isin, "SKIP", f"Qty=0 but not explicit 'Vendita'. Treating as Price Update only.")
             continue

            
        # strict check for NEW ISINS (not in DB)
        # User Rule: "Se un ISIN non è presente in DB ma è presente nell'excel 
        # ma senza che l'operazione di acquisto sia esplicitata e ci sia una data e un prezzo... deve essere saltato."
        is_new_isin = (db_qty == 0)
        
        op_declared = row.get('operation')
        op_price = row.get('op_price_eur')
        op_date = row.get('date')
        
        # We consider it "Explicit Buy" if Operation is 'Acquisto' (case insensitive), Price > 0, and Date is set
        is_explicit_buy = (
            op_declared and str(op_declared).lower().strip() == 'acquisto' and 
            op_price and op_price > 0 and 
            op_date is not None
        )

        if is_new_isin and not is_explicit_buy:
             log_ingestion_item(isin, "INCONSISTENT", f"New ISIN {isin} has missing buy details. Skipped.")
             delta_actions.append({
                "isin": isin,
                "type": "INCONSISTENT_NEW_ISIN",
                "quantity_change": diff, # Show what we found
                "current_db_qty": db_qty,
                "new_total_qty": excel_qty,
                "details": "Mancano dati operazione (Data/Prezzo/Operazione)"
             })
             continue

        action_type = "Acquisto" if diff > 0 else "Vendita"
        log_ingestion_item(isin, "DELTA", f"{action_type} {abs(diff)} (Exc={excel_qty} DB={db_qty})")
        
        action = {
            "isin": isin,
            "type": action_type,
            "quantity_change": abs(diff),
            "excel_operation_declared": op_declared,
            "excel_price": op_price,
            "excel_date": op_date,
            "excel_description": row.get('description'),  # Asset name from Excel column A
            "asset_type_proposal": row.get('asset_type'), # [NEW] Pass asset type proposal
            "current_db_qty": db_qty,
            "new_total_qty": excel_qty
        }
        delta_actions.append(action)
        
    for isin, qty in db_holdings.items():
        if isin not in processed_isins and qty > 0:
            if ignore_missing:
                log_ingestion_item(isin, "SKIP_MISSING", "Ignored missing asset due to user flag.")
                continue

            log_ingestion_item(isin, "MISSING", f"In DB ({qty}) but not in Excel")
            delta_actions.append({
                "isin": isin,
                "type": "MISSING_FROM_UPLOAD",
                "quantity_change": qty,
                "current_db_qty": qty,
                "new_total_qty": 0 
            })

    log_ingestion_summary(len(excel_data), len(delta_actions), len([d for d in delta_actions if d['type'] == 'MISSING_FROM_UPLOAD']))
    
    # Mock final state logging (in real app, this would query DB after sync)
    # Here we log what the DB *should* look like assuming these applied
    log_final_state([f"{row['isin']}: {row['quantity']}" for row in excel_data]) 

    return delta_actions
