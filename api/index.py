from flask import Flask, jsonify, request
# Load env vars before other imports
from dotenv import load_dotenv
import os
load_dotenv('.env.local')

from datetime import datetime

import pandas as pd
import numpy as np
from ingest import parse_portfolio_excel, calculate_delta
# from isin_resolver import resolve_isin (Removed)
from finance import xirr
from logger import logger
import io
import traceback
import openai

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
        
        if not changes and not data.get('prices') and not data.get('snapshot'):
            return jsonify(message="No data to sync"), 200

        supabase = get_supabase_client()
        
        # --- 1. Handle Prices (If present) ---
        prices = data.get('prices', [])
        if prices:
            from price_manager import save_price_snapshot
            count_prices = 0
            for p in prices:
                save_price_snapshot(p['isin'], p['price'], p.get('date'), p.get('source', 'Manual Upload'))
                count_prices += 1
            logger.info(f"SYNC: Saved {count_prices} price snapshots.")

        # --- 2. Handle Snapshot Record (If present) ---
        snapshot = data.get('snapshot')
        if snapshot:
            try:
                # Update upload_date to NOW just to be precise on confirm
                snapshot['upload_date'] = datetime.now().isoformat()
                supabase.table('snapshots').insert(snapshot).execute()
                logger.info(f"SYNC: Snapshot records saved.")
            except Exception as e:
                 logger.error(f"SYNC: Snapshot save failed: {e}")

        # --- 2b. Handle Dividends (If present) ---
        dividends = data.get('dividends', [])
        if dividends:
            try:
                # We need to resolve ISIN -> asset_id for dividends too.
                # Assuming dividends list has ISINs.
                div_isins = {d['isin'] for d in dividends}
                if div_isins:
                     # Reuse or fetch asset map
                     res_assets = supabase.table('assets').select("id, isin").in_('isin', list(div_isins)).execute()
                     asset_map_div = {row['isin']: row['id'] for row in res_assets.data}
                     
                     valid_dividends = []
                     for d in dividends:
                        a_id = asset_map_div.get(d['isin'])
                        if a_id:
                            valid_dividends.append({
                                "portfolio_id": portfolio_id,
                                "asset_id": a_id,
                                "amount_eur": d['amount'],
                                "date": d['date'] # Original date from file
                            })
                     
                     if valid_dividends:
                         # Upsert based on unique constraint (portfolio, asset, date)
                         supabase.table('dividends').upsert(valid_dividends, on_conflict='portfolio_id, asset_id, date').execute()
                         logger.info(f"SYNC: Saved {len(valid_dividends)} dividends.")
            except Exception as e:
                 logger.error(f"SYNC: Dividend save failed: {e}")


        # --- 3. Handle Transactions (If present) ---
        valid_transactions = []
        if changes:
             # 3a. Collect all unique ISINs to process
            target_isins = {item.get('isin') for item in changes if item.get('quantity_change') and item.get('isin')}
            if target_isins:
                # 3b. Batch Fetch existing assets
                res_assets = supabase.table('assets').select("id, isin").in_('isin', list(target_isins)).execute()
                asset_map = {row['isin']: row['id'] for row in res_assets.data}
                
                # 3c. Identify and Create missing assets
                missing_isins = target_isins - set(asset_map.keys())
                
                if missing_isins:
                    new_assets_payload = [{"isin": isin, "name": isin} for isin in missing_isins]
                    res_new = supabase.table('assets').insert(new_assets_payload).execute()
                    if res_new.data:
                        for row in res_new.data:
                            asset_map[row['isin']] = row['id']
                
                
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
            return jsonify(message=f"Successfully synced. Prices: {len(prices)}. Trans: {len(valid_transactions)}"), 200
        else:
            return jsonify(message=f"Synced. Prices: {len(prices)}. No transactions."), 200

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
        
        # Delete snapshots (history) for this portfolio
        supabase.table('snapshots').delete().eq('portfolio_id', portfolio_id).execute()
        
        logger.info(f"DB Reset: Cleared transactions and snapshots for portfolio {portfolio_id}")
        return jsonify(status="ok", message="Portfolio data (transactions & history) cleared"), 200
            
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
        
        # --- NEW: DIVIDEND FLOW ---
        if parse_result.get('type') == 'KPI_DIVIDENDS':
            return jsonify(
                type='DIVIDENDS',
                parsed_data=parse_result['data'],
                message=parse_result.get('message')
            )
        
        # --- STANDARD PORTFOLIO FLOW ---
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
        
        # Prepare Price Snapshots (Don't save yet)
        prices_to_save = []
        
        # Metrics Calculation for Snapshot
        total_value_eur = 0
        total_invested_eur = 0

        for row in parse_result['data']:
            qty = row.get('quantity', 0)
            
            # Market Value calculation
            # Market Value calculation
            curr_price = row.get('current_price')
            
            # [MODIFIED] Always save price if present, regardless of quantity
            if curr_price:
                 # Collect individual price for later saving
                 prices_to_save.append({
                     "isin": row['isin'],
                     "price": curr_price,
                     "date": row.get('date'), # Might be None, handled by backend
                     "source": "Manual Upload" 
                 })

            if curr_price and qty:
                 total_value_eur += (qty * curr_price)
            
            # Invested Capital calculation
            avg_cost = row.get('avg_price_eur')
            if avg_cost and qty:
                 total_invested_eur += (qty * avg_cost)
        
        # Prepare Snapshot Record (Don't save yet)
        snapshot_proposal = None
        if portfolio_id:
             snapshot_proposal = {
                "portfolio_id": portfolio_id,
                "file_name": file.filename,
                "upload_date": datetime.now().isoformat(), # Proposed date
                "status": "PROCESSED",
                "total_eur": total_value_eur,
                "total_invested": total_invested_eur,
                "log_summary": f"Imported {len(parse_result['data'])} rows. Value: {total_value_eur:.2f}€"
            }

        return jsonify(
            type='PORTFOLIO',
            parsed_data=parse_result['data'],
            delta=delta,
            prices=prices_to_save,
            snapshot_proposal=snapshot_proposal
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

@app.route('/api/validate-model', methods=['POST'])
def validate_model_route():
    try:
        data = request.json
        # Only use env var for security, ignore client-provided key if any (or treat as temp override if needed, but user asked for secure)
        # User said "Voglio anche quelli. Non voglio che l'API Key sia presente in chiaro, la voglio mettere nel codice."
        # So we prioritize env var and strictly use it.
        api_key = os.getenv('OPENAI_API_KEY')
        model_type = data.get('modelType')
        
        logger.info(f"VALIDATE AI REQUEST: Checking model '{model_type}'")
        
        if not api_key:
            logger.error("VALIDATE AI FAIL: No OPENAI_API_KEY set in environment")
            return jsonify(error="API Key is missing in server configuration"), 400
            
        if not model_type:
             logger.error("VALIDATE AI FAIL: No modelType provided")
             return jsonify(error="Model Type is required"), 400

        client = openai.OpenAI(api_key=api_key)
        
        # Verify model access
        try:
            model = client.models.retrieve(model_type)
            logger.info(f"VALIDATE AI SUCCESS: Model '{model_type}' is accessible. ID: {model.id}")
            return jsonify(
                success=True,
                id=model.id,
                owned_by=model.owned_by
            ), 200
        except openai.AuthenticationError:
             logger.error("VALIDATE AI FAIL: AuthenticationError (Invalid Key)")
             return jsonify(success=False, error="Invalid API Key"), 200
        except openai.NotFoundError:
             logger.error(f"VALIDATE AI FAIL: Model '{model_type}' not found")
             return jsonify(success=False, error=f"Model '{model_type}' not found or no access"), 200
        except Exception as e:
             logger.error(f"VALIDATE AI FAIL: OpenAI Error: {e}")
             return jsonify(success=False, error=str(e)), 200

    except Exception as e:
        logger.error(f"VALIDATE AI CRITICAL ERROR: {e}")
        return jsonify(error=str(e)), 500

if __name__ == '__main__':
    from dashboard import register_dashboard_routes
    from assets import register_assets_routes
    register_dashboard_routes(app)
    register_assets_routes(app)
    app.run(port=5328, debug=True)
