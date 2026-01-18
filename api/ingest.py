import pandas as pd
import numpy as np
from datetime import datetime
from logger import log_ingestion_start, log_ingestion_item, log_ingestion_summary, log_final_state, logger

def parse_portfolio_excel(file_stream):
    # ... (header comments) ...
    try:
        log_ingestion_start("Uploaded File Stream")
        df = pd.read_excel(file_stream)
        
        # ... validation ...
        if df.shape[1] < 8:
            columns_found = df.columns.tolist()
            logger.error(f"PARSE FAIL: Insufficient columns. Found {len(columns_found)}: {columns_found}")
            return {"error": f"Insufficient columns. Expected at least 8, found {len(columns_found)}"}

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

            entry = {
                "description": row.iloc[0],
                "isin": isin,
                "quantity": qty,
                "currency": row.iloc[3],
                "avg_price_eur": float(row.iloc[4]) if not pd.isna(row.iloc[4]) else 0.0,
                "date": date_val, 
                "operation": str(row.iloc[6]).strip() if not pd.isna(row.iloc[6]) else None,
                "op_price_eur": float(row.iloc[7]) if not pd.isna(row.iloc[7]) else 0.0,
                "current_price": float(row.iloc[8]) if df.shape[1] > 8 and not pd.isna(row.iloc[8]) else None
            }
            data.append(entry)
            
        return {"data": data}
            
    except Exception as e:
        logger.error(f"PARSE EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": f"Parse Error: {str(e)}"}

def calculate_delta(excel_data, db_holdings):
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
            "current_db_qty": db_qty,
            "new_total_qty": excel_qty
        }
        delta_actions.append(action)
        
    for isin, qty in db_holdings.items():
        if isin not in processed_isins and qty > 0:
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
