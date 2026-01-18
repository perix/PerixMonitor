from flask import Flask, jsonify, request
# Load env vars before other imports
from dotenv import load_dotenv
import os
load_dotenv('.env.local')

import pandas as pd
import numpy as np
from ingest import parse_portfolio_excel, calculate_delta
# from isin_resolver import resolve_isin (Removed)
from finance import xirr
from logger import logger
import io
import traceback

app = Flask(__name__)
import sys
logger.info("Backend API Initialized")
logger.info(f"debug_exec: {sys.executable}")
logger.info(f"debug_path: {sys.path}")

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled Exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify(error=str(e)), 500

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify(message="Hello from Python!")

from supabase_client import get_supabase_client, get_or_create_default_portfolio

@app.route('/api/sync', methods=['POST'])
def sync_transactions():
    try:
        data = request.json
        changes = data.get('changes', [])
        portfolio_id = data.get('portfolio_id')

        if not portfolio_id:
            return jsonify(error="Missing portfolio_id"), 400
        
        if not changes:
            return jsonify(message="No changes to sync"), 200

        supabase = get_supabase_client()
        
        # 1. Collect all unique ISINs to process
        target_isins = {item.get('isin') for item in changes if item.get('quantity_change') and item.get('isin')}
        if not target_isins:
             return jsonify(message="No valid ISINs found in changes"), 200

        # 2. Batch Fetch existing assets
        # Note: Supabase .in_() expects a list
        res_assets = supabase.table('assets').select("id, isin").in_('isin', list(target_isins)).execute()
        asset_map = {row['isin']: row['id'] for row in res_assets.data}
        
        # 3. Identify and Create missing assets
        missing_isins = target_isins - set(asset_map.keys())
        
        if missing_isins:
            new_assets_payload = [{"isin": isin, "name": isin} for isin in missing_isins]
            res_new = supabase.table('assets').insert(new_assets_payload).execute()
            if res_new.data:
                for row in res_new.data:
                    asset_map[row['isin']] = row['id']
        
        valid_transactions = []
        
        for item in changes:
            isin = item.get('isin')
            qty_change = float(item.get('quantity_change', 0))
            
            if qty_change == 0 or not isin:
                continue
                
            # Determine Transaction Type
            trans_type = 'BUY' if qty_change > 0 else 'SELL'
            abs_qty = abs(qty_change)
            
            # Determine Price and Date
            price = item.get('price') # User input
            if price is None:
                price = item.get('excel_price') # Excel data
            
            date_val = item.get('date') # User input
            if date_val is None:
                 date_val = item.get('excel_date') # Excel data
            
            if price is None or date_val is None:
                logger.warning(f"Skipping {isin}: Missing Price or Date ({price}, {date_val})")
                continue

            asset_id = asset_map.get(isin)
            
            if asset_id:
                valid_transactions.append({
                    "portfolio_id": portfolio_id,
                    "asset_id": asset_id,
                    "type": trans_type,
                    "quantity": abs_qty,
                    "price_eur": float(price),
                    "date": date_val
                })
        
        if valid_transactions:
            res = supabase.table('transactions').insert(valid_transactions).execute()
            logger.info(f"SYNC SUCCESS: Inserted {len(valid_transactions)} transactions for portfolio {portfolio_id}.")
            return jsonify(message=f"Successfully synced {len(valid_transactions)} transactions"), 200
        else:
            return jsonify(message="No valid transactions to insert"), 200

    except Exception as e:
        logger.error(f"SYNC FAIL: {e}")
        logger.error(traceback.format_exc()) # Log strict traceback
        print(f"SYNC FAIL: {e}") # Force stdout
        traceback.print_exc() # Force stdout
        return jsonify(error=str(e)), 500

@app.route('/api/reset', methods=['POST'])
def reset_db_route():
    logger.warning("RESET DB REQUEST RECEIVED")
    try:
        data = request.json
        portfolio_id = data.get('portfolio_id')
        
        if not portfolio_id:
            return jsonify(error="Missing portfolio_id"), 400

        supabase = get_supabase_client()
        
        # Delete transactions for this portfolio
        supabase.table('transactions').delete().eq('portfolio_id', portfolio_id).execute()
        logger.info(f"DB Reset: Cleared transactions for portfolio {portfolio_id}")
        return jsonify(status="ok", message="Transactions cleared"), 200
            
    except Exception as e:
        logger.error(f"RESET FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/ingest', methods=['POST'])
def ingest_excel():
    from logger import clear_log_file
    # We clear the log at the very beginning
    try:
        clear_log_file()
    except:
        pass # If clearing fails, we still want to log the rest

    try:
        if 'file' not in request.files:
            logger.error("INGEST FAIL: No file part in request")
            return jsonify(error="No file part"), 400
        
        file = request.files['file']
        if file.filename == '':
            logger.error("INGEST FAIL: No selected file")
            return jsonify(error="No selected file"), 400

        parse_result = parse_portfolio_excel(file.stream)
        
        if "error" in parse_result:
            logger.error(f"INGEST FAIL: Parse Error - {parse_result['error']}")
            return jsonify(error=parse_result["error"]), 400
        
        portfolio_id = request.form.get('portfolio_id')
        
        # Fetch DB Holdings
        db_holdings = {}
        if portfolio_id:
            try:
                supabase = get_supabase_client()
                res = supabase.table('transactions').select("quantity, type, assets(isin)").eq('portfolio_id', portfolio_id).execute()
                
                if res.data:
                    for t in res.data:
                        isin = t['assets']['isin']
                        qty = t['quantity']
                        if t['type'] == 'SELL':
                            qty = -qty
                        
                        db_holdings[isin] = db_holdings.get(isin, 0.0) + qty
                
                logger.info(f"Fetched holdings for {portfolio_id}: {len(db_holdings)} assets")
                
            except Exception as e:
                logger.error(f"INGEST: Failed to fetch DB holdings: {e}")
                import traceback
                logger.error(traceback.format_exc())
                # Proceed with empty holdings, but log warning
                pass

        # Calculate Delta
        delta = calculate_delta(parse_result['data'], db_holdings)
        
        # Save Price Snapshots (New Strategy)
        from price_manager import save_price_snapshot
        count_saved = 0
        for row in parse_result['data']:
            if row.get('current_price'):
                 # Use row date if available (transaction date), otherwise today
                 # But usually current_price refers to NOW. 
                 # If row['date'] is old (e.g. buy date), we shouldn't map current price to it.
                 # User said "associare alla data dell'input del file". 
                 # Let's use Today as the default for "Current Price snapshot"
                 save_price_snapshot(row['isin'], row['current_price'])
                 count_saved += 1
        
        if count_saved > 0:
            logger.info(f"Saved {count_saved} price snapshots.")

        return jsonify(
            parsed_data=parse_result['data'],
            delta=delta
        )

    except Exception as e:
        logger.error(f"INGEST CRASH: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify(error=f"Server Error: {str(e)}"), 500

@app.route('/api/clear_logs', methods=['POST'])
def clear_logs_route():
    from logger import clear_log_file
    try:
        clear_log_file()
        return jsonify(message="Log cleared"), 200
    except Exception as e:
        return jsonify(error=str(e)), 500
    
# @app.route('/api/resolve_isin', methods=['GET'])
# def resolve_isin_route():
#     return jsonify(error="Not supported"), 404


@app.route('/api/calculate_xirr', methods=['POST'])
def calculate_xirr_route():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        from datetime import datetime
        for t in transactions:
            if isinstance(t['date'], str):
                t['date'] = datetime.fromisoformat(t['date'].replace('Z', ''))

        result = xirr(transactions)
        return jsonify(xirr=result)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/api/portfolios', methods=['POST'])
def create_portfolio():
    try:
        data = request.json
        name = data.get('name')
        user_id = data.get('user_id')
        
        if not name or not user_id:
            return jsonify(error="Missing name or user_id"), 400

        supabase = get_supabase_client()
        res = supabase.table('portfolios').insert({
            "user_id": user_id,
            "name": name
        }).execute()
        
        if res.data:
            new_portfolio = res.data[0]
            logger.info(f"PORTFOLIO CREATED: ID={new_portfolio['id']}, Name='{name}', User={user_id}")
            return jsonify(new_portfolio), 200
        else:
            logger.error(f"PORTFOLIO CREATE FAIL: Supabase returned no data")
            return jsonify(error="Failed to create portfolio"), 500

    except Exception as e:
        logger.error(f"PORTFOLIO CREATE FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/portfolios/<portfolio_id>', methods=['DELETE'])
def delete_portfolio(portfolio_id):
    try:
        supabase = get_supabase_client()
        
        # Verify existence
        res_exists = supabase.table('portfolios').select('name').eq('id', portfolio_id).execute()
        if not res_exists.data:
             return jsonify(error="Portfolio not found"), 404
        
        p_name = res_exists.data[0]['name']

        # Delete (Cascade should handle transactions if config is set, but let's be safe)
        # Actually transactions have FK to portfolios usually. 
        # Supabase client normally doesn't cascade unless DB is set up with ON DELETE CASCADE.
        # Let's trust DB or manual delete transactions first if needed. 
        # For now, let's try direct delete.
        
        res = supabase.table('portfolios').delete().eq('id', portfolio_id).execute()
        
        logger.info(f"PORTFOLIO DELETED: ID={portfolio_id}, Name='{p_name}'")
        return jsonify(message="Portfolio deleted"), 200

    except Exception as e:
        logger.error(f"PORTFOLIO DELETE FAIL: {e}")
        return jsonify(error=str(e)), 500

if __name__ == '__main__':
    from dashboard import register_dashboard_routes
    from assets import register_assets_routes
    register_dashboard_routes(app)
    register_assets_routes(app)
    app.run(port=5328, debug=True)
