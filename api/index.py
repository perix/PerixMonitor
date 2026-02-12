from flask import Flask, jsonify, request
import os
import sys

# Ensure the 'api' directory is in the path for Vercel
api_dir = os.path.dirname(os.path.abspath(__file__))
if api_dir not in sys.path:
    sys.path.append(api_dir)

from dotenv import load_dotenv

# Load env vars safely
# Load env vars safely
env_path = '.env.local'
if not os.path.exists(env_path):
    # Try parent directory (if running from api/)
    parent_env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local')
    if os.path.exists(parent_env):
        env_path = parent_env

if os.path.exists(env_path):
    load_dotenv(env_path)

from datetime import datetime

import pandas as pd
import numpy as np
from ingest import parse_portfolio_excel
# from isin_resolver import resolve_isin (Removed)
from finance import xirr
from color_manager import assign_colors
from logger import logger
import io
import traceback
import openai
from dashboard import register_dashboard_routes
from assets import register_assets_routes
from portfolio import register_portfolio_routes
from analysis import register_analysis_routes
from settings import register_settings_routes
from memory import memory_bp

from config_api import config_bp
app = Flask(__name__)
from flask_cors import CORS
CORS(app, resources={r"/api/*": {"origins": "*"}}) # Enable CORS for all API routes
app.register_blueprint(config_bp)
register_dashboard_routes(app)
register_assets_routes(app)
register_portfolio_routes(app)
register_analysis_routes(app)
register_settings_routes(app)
app.register_blueprint(memory_bp)


import sys
logger.info("Backend API Initialized")
logger.info(f"debug_exec: {sys.executable}")
logger.info(f"debug_path: {sys.path}")

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Eccezione Non Gestita: {str(e)}")
    logger.error(traceback.format_exc())
    # Risposta standard in Italiano per il frontend
    return jsonify({
        "error": "Errore interno del server",
        "details": str(e)
    }), 500

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify(message="Hello from Python!", version="1.1", build="20260127-fix-assets")

# from supabase_client import get_supabase_client, get_or_create_default_portfolio
# REPLACED BY DB HELPER
from db_helper import execute_request, query_table, upsert_table, update_table, delete_table

def check_debug_mode(portfolio_id):
    """Check if file logging is enabled for the portfolio owner."""
    from db_helper import get_config, query_table
    if not portfolio_id: return False
    try:
        # Get User ID from Portfolio using query_table
        results = query_table('portfolios', 'user_id', {'id': portfolio_id})
        if not results: return False
        user_id = results[0].get('user_id')
        if not user_id: return False
        
        # Get Config for User
        config_key = f'log_config_{user_id}'
        config = get_config(config_key, {'enabled': False})
        return config.get('enabled', False)
    except Exception as e:
        logger.error(f"DEBUG CHECK FAIL: {e}")
        return False

@app.route('/api/sync', methods=['POST', 'OPTIONS'])
def sync_transactions():
    if request.method == 'OPTIONS':
         return jsonify(status="ok"), 200
    try:
        from logger import configure_file_logging, log_audit
        from db_helper import upsert_table, execute_request, update_table
        data = request.json
        changes = data.get('changes', [])
        portfolio_id = data.get('portfolio_id')
        enable_ai_lookup = data.get('enable_ai_lookup', True)  # Default to True for backward compatibility
        
        # Initialize errors list for trend updates
        errors = []

        # Check debug mode
        debug_mode = check_debug_mode(portfolio_id)
        configure_file_logging(debug_mode)

        if not portfolio_id:
            return jsonify(error="Missing portfolio_id"), 400
        
        if not changes and not data.get('prices') and not data.get('snapshot') and not data.get('trend_updates') and not data.get('dividends'):
            return jsonify(message="No data to sync"), 200

        # supabase = get_supabase_client() -> Removed
        
        # --- 1. Init Prices (Processing moved to end) ---
        prices = data.get('prices', [])

        # --- 2. Handle Snapshot Record (If present) ---
        snapshot = data.get('snapshot')
        snapshot = data.get('snapshot')
        if snapshot:
            try:
                # Update upload_date to NOW just to be precise on confirm
                snapshot['upload_date'] = datetime.now().isoformat()
                # supabase.table('snapshots').insert(snapshot).execute()
                upsert_table('snapshots', snapshot)
                if debug_mode: logger.debug(f"SYNC: Snapshot records saved.")
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
                     # res_assets = supabase.table('assets').select("id, isin").in_('isin', list(div_isins)).execute()
                     in_filter = f"in.({','.join(div_isins)})"
                     res_assets = execute_request('assets', 'GET', params={'select': 'id,isin', 'isin': in_filter})
                     
                     asset_map_div = {}
                     if res_assets and res_assets.status_code == 200:
                        asset_map_div = {row['isin']: row['id'] for row in res_assets.json()}
                     
                     valid_dividends = []
                     for d in dividends:
                        a_id = asset_map_div.get(d['isin'])
                        if a_id:
                            d_type = d.get('type', 'EXPENSE' if d['amount'] < 0 else 'DIVIDEND')
                            valid_dividends.append({
                                "portfolio_id": portfolio_id,
                                "asset_id": a_id,
                                "amount_eur": d['amount'],
                                "date": d['date'],
                                "type": d_type
                            })
                     
                     if valid_dividends:
                         # Upsert based on unique constraint (portfolio, asset, date, type)
                         upsert_table('dividends', valid_dividends, on_conflict='portfolio_id, asset_id, date, type')
                         if debug_mode: logger.debug(f"SYNC: Saved {len(valid_dividends)} dividends.")
            except Exception as e:
                 logger.error(f"SYNC: Dividend save failed: {e}")


        # --- 3. Handle Transactions (If present) ---
        valid_transactions = []
        if changes:
             # 3a. Collect all unique ISINs to process
            target_isins = {item.get('isin') for item in changes if item.get('quantity_change') and item.get('isin')}
            if target_isins:
                # 3b. Batch Fetch existing assets
                # res_assets = supabase.table('assets').select("id, isin").in_('isin', list(target_isins)).execute()
                in_filter = f"in.({','.join(target_isins)})"
                res_assets = execute_request('assets', 'GET', params={'select': 'id,isin', 'isin': in_filter})
                
                asset_map = {}
                if res_assets and res_assets.status_code == 200:
                    asset_map = {row['isin']: row['id'] for row in res_assets.json()}
                
                # Ensure existing assets have colors too (backfill)
                exist_ids = list(asset_map.values())
                if exist_ids:
                     assign_colors(portfolio_id, exist_ids)

                # [NEW] Backfill Asset Type for EXISTING assets
                # If the file provides asset_type, we should update the metadata even if asset exists.
                isin_to_type = {}
                for item in changes:
                    if item.get('isin') and item.get('asset_type_proposal'):
                        isin_to_type[item['isin']] = str(item['asset_type_proposal']).strip()
                
                if debug_mode:
                    logger.debug(f"SYNC DEBUG: Found {len(isin_to_type)} asset type proposals in payload.")
                
                if isin_to_type:
                    # We need to fetch current metadata for these assets to merge
                    # existing_assets_data = supabase.table('assets').select("id, isin, metadata").in_('isin', list(isin_to_type.keys())).execute()
                    in_filter_type = f"in.({','.join(isin_to_type.keys())})"
                    existing_assets_data = execute_request('assets', 'GET', params={'select': 'id,isin,metadata', 'isin': in_filter_type})
                    
                    if existing_assets_data and existing_assets_data.status_code == 200:
                        rows = existing_assets_data.json()
                        for row in rows:
                            isin = row['isin']
                            new_type = isin_to_type.get(isin)
                            if new_type:
                                current_meta = row.get('metadata') or {}
                                if not isinstance(current_meta, dict):
                                    current_meta = {}
                                
                                # Check if update is needed
                                current_meta['assetType'] = new_type
                                if debug_mode: logger.debug(f"SYNC: Backfilling Asset Type for {isin} -> {new_type}")
                                # Update both metadata and asset_class column for consistency
                                # supabase.table('assets').update({...}).eq('id', row['id']).execute()
                                update_table('assets', {
                                    "metadata": current_meta,
                                    "asset_class": new_type
                                }, filters={'id': row['id']})
                        
                        # [NEW] Update Asset Names (Description) for EXISTING assets
                        # If Excel has a better/new description, update the global asset name.
                        isin_to_desc = {}
                        for item in changes:
                            if item.get('isin') and item.get('excel_description'):
                                isin_to_desc[item['isin']] = str(item['excel_description']).strip()
                        
                        if isin_to_desc:
                             # Re-using existing_assets_data if possible or fetch again. 
                             # We can just iterate the same rows since we fetched 'id' and 'isin' (and 'name' if we add it to select)
                             in_filter_desc = f"in.({','.join(isin_to_desc.keys())})"
                             existing_assets_names = execute_request('assets', 'GET', params={'select': 'id,isin,name', 'isin': in_filter_desc})
                             
                             if existing_assets_names and existing_assets_names.status_code == 200:
                                 rows = existing_assets_names.json()
                                 for row in rows:
                                     isin = row['isin']
                                     new_name = isin_to_desc.get(isin)
                                     current_name = row.get('name')
                                     
                                     # Update if different and new name is valid
                                     if new_name and new_name != current_name and len(new_name) > 2:
                                         if debug_mode: logger.debug(f"SYNC: Updating Asset Name for {isin}: '{current_name}' -> '{new_name}'")
                                         update_table('assets', {"name": new_name}, {'id': row['id']})
                
                # 3c. Identify and Create missing assets
                missing_isins = target_isins - set(asset_map.keys())
                
                if missing_isins:
                    # Build a map of ISIN -> description and Type from changes
                    isin_to_description = {}
                    isin_to_type = {}
                    for item in changes:
                        if item.get('isin'):
                             if item.get('excel_description'):
                                is_description = str(item['excel_description']).strip()
                                isin_to_description[item['isin']] = is_description
                             if item.get('asset_type_proposal'):
                                isin_to_type[item['isin']] = str(item['asset_type_proposal']).strip()
                    
                    # Create assets with proper names from Excel and initial metadata
                    new_assets_payload = []
                    for isin in missing_isins:
                        asset_payload = {
                            "isin": isin, 
                            "name": isin_to_description.get(isin, isin),  # Use Excel description or fallback to ISIN
                            "asset_class": isin_to_type.get(isin) # Directly set asset_class
                        }
                        if isin in isin_to_type:
                            asset_payload["metadata"] = {"assetType": isin_to_type[isin]}
                        
                        new_assets_payload.append(asset_payload)
                    res_new = execute_request('assets', 'POST', body=new_assets_payload, headers={"Prefer": "return=representation"})
                    
                    new_assets_data = res_new.json() if (res_new and res_new.status_code in [200, 201]) else []
                    
                    if new_assets_data:
                        for row in new_assets_data:
                            asset_map[row['isin']] = row['id']
                            if debug_mode: logger.debug(f"SYNC: Created asset {row['isin']} with name '{row['name']}'")
                            
                            # Assign color to new asset
                            try:
                                assign_colors(portfolio_id, [row['id']])
                            except Exception as e:
                                logger.error(f"SYNC: Color assignment failed for {row['isin']}: {e}")
                            
                            # Fetch LLM info for new asset and update metadata (if enabled)
                            if enable_ai_lookup:
                                from llm_asset_info import fetch_asset_info_from_llm
                                llm_result = fetch_asset_info_from_llm(row['isin'])
                                if llm_result:
                                    try:
                                        if llm_result.get('response_type') == 'json':
                                            # Save structured JSON to metadata column
                                            # [FIX] Merge with existing metadata if present (like assetType)
                                            current_meta = row.get('metadata') or {}
                                            if not isinstance(current_meta, dict):
                                                current_meta = {}
                                            
                                            # Merge LLM data into current metadata
                                            new_meta = {**current_meta, **llm_result['data']}
                                            
                                            # Merge LLM data into current metadata
                                            new_meta = {**current_meta, **llm_result['data']}
                                            
                                            update_table('assets', {
                                                "metadata": new_meta,
                                                "metadata_text": None
                                            }, {'id': row['id']})
                                            if debug_mode: logger.debug(f"SYNC: Updated asset {row['isin']} with LLM JSON metadata")
                                        elif llm_result.get('response_type') == 'text':
                                            # Save text/markdown to metadata_text column
                                            update_table('assets', {
                                                "metadata": None,
                                                "metadata_text": llm_result['data']
                                            }, {'id': row['id']})
                                            if debug_mode: logger.debug(f"SYNC: Updated asset {row['isin']} with LLM text/markdown metadata")
                                    except Exception as llm_err:
                                        logger.error(f"SYNC: Failed to save LLM metadata for {row['isin']}: {llm_err}")
                            else:
                                if debug_mode: logger.debug(f"SYNC: AI lookup disabled, skipping LLM metadata for {row['isin']}")
                
                
                for item in changes:
                    isin = item.get('isin')
                    qty_change = float(item.get('quantity_change', 0))
                    
                    if qty_change == 0 or not isin:
                        continue
                        
                    # Determine Transaction Type
                    trans_type = 'BUY' if qty_change > 0 else 'SELL'
                    abs_qty = abs(qty_change)

                    # [FIX] Respect explicit type from Ingestion (Vendita/MISSING_FROM_UPLOAD)
                    # Ingestion sends positive quantity for display, but we must treat it as SELL.
                    explicit_type = item.get('type', '').upper()
                    if explicit_type in ['VENDITA', 'SELL', 'MISSING_FROM_UPLOAD']:
                        trans_type = 'SELL'

                    
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
                        # DEBUG: Log the date being saved
                        logger.info(f"SYNC DEBUG: Saving transaction for {isin}: date_val='{date_val}' (type: {type(date_val).__name__})")
                        
                        valid_transactions.append({
                            "portfolio_id": portfolio_id,
                            "asset_id": asset_id,
                            "type": trans_type,
                            "quantity": abs_qty,
                            "price_eur": float(price),
                            "date": date_val
                        })
                        
                        # [NEW] Save Transaction Price as Market Data
                        # This ensures we have at least one data point for history/P&L even if no external price source exists yet.
                        try:
                            # We use the transaction date. If multiple prices for same day, latest wins (upsert).
                            # Source = 'Transaction' to distinguish from 'Manual Upload' or 'Yahoo Finance'
                            from price_manager import save_price_snapshot
                            save_price_snapshot(isin, float(price), date=date_val, source="Transaction")
                        except Exception as e_price:
                            logger.error(f"SYNC: Failed to save transaction price for {isin}: {e_price}")
        
        # --- 4. Process Prices (Now that Assets are ensured to exist) ---
        if prices:
            # [PERF] Batch upsert instead of loop (Step 2.1)
            valid_prices = []
            for p in prices:
                 try:
                     price_val = float(p.get('price', 0))
                     if price_val > 0 and p.get('isin'):
                         d_val = p.get('date')
                         if not d_val:
                             d_val = datetime.now().strftime("%Y-%m-%d")
                             
                         valid_prices.append({
                             "isin": p['isin'],
                             "price": price_val,
                             "date": d_val,
                             "source": p.get('source', 'Manual Upload')
                         })
                 except ValueError:
                     logger.warning(f"SYNC: Invalid price for {p.get('isin')}: {p.get('price')}")
            
            count_prices = 0
            if valid_prices:
                # Batch upsert
                if upsert_table('asset_prices', valid_prices, on_conflict='isin, date, source'):
                     count_prices = len(valid_prices)
                else:
                     logger.error(f"SYNC: Failed to batch save {len(valid_prices)} prices")

            if debug_mode: logger.debug(f"SYNC: Saved {count_prices} price snapshots (Batch).")

        # 3. Process Referentials/Trends (if any)
        trend_updates = data.get('trend_updates', [])
        if trend_updates:
            try:
                # supabase = get_supabase_client()
                logger.info(f"SYNC: Processing {len(trend_updates)} trend updates...")
                
                # Batch update might be heavy, but let's loop for now (assets table isn't huge)
                # Or better, we just update the ones provided.
                from datetime import datetime
                for trend in trend_updates:
                    isin = trend.get('isin')
                    variation = trend.get('variation_pct')
                    days = trend.get('days_delta')
                    
                    if isin:
                         update_payload = {
                             'last_trend_variation': variation,
                             'last_trend_ts': datetime.now().isoformat(),
                             'last_trend_days': days
                         }
                         # If days is None, it saves NULL, which is correct for cleared trend.

                         # supabase.table('assets').update(update_payload).eq('isin', isin).execute()
                         update_table('assets', update_payload, {'isin': isin})
                         
            except Exception as e:
                logger.error(f"SYNC: Error updating trends: {e}")
                errors.append(f"Trend Update Error: {str(e)}")

        # 4. Finalize
        if len(errors) > 0:
            return jsonify(error="Sync completed with errors", details=errors), 500
        
        if valid_transactions:
            # res = supabase.table('transactions').insert(valid_transactions).execute()
            upsert_table('transactions', valid_transactions) # Insert is effectively upsert without conflict key usually, or just POST
            
            log_audit("SYNC_SUCCESS", f"Portfolio {portfolio_id}: {len(valid_transactions)} transactions, {len(prices)} prices.")
            
            # [NEW] Refresh Materialized Views
            try:
                execute_request('rpc/refresh_materialized_views', 'POST')
                if debug_mode: logger.debug("SYNC: Materialized views refreshed.")
            except Exception as e_mv:
                logger.error(f"SYNC: MV Refresh failed: {e_mv}")

            return jsonify(message=f"Successfully synced. Prices: {len(prices)}. Trans: {len(valid_transactions)}"), 200
        else:
            log_audit("SYNC_SUCCESS", f"Portfolio {portfolio_id}: {len(prices)} prices only.")
            
            # [NEW] Refresh Materialized Views (Prices might affect some logic, but mainly transactions do. 
            # However, dividends or other changes might have happened too.)
            try:
                execute_request('rpc/refresh_materialized_views', 'POST')
                if debug_mode: logger.debug("SYNC: Materialized views refreshed.")
            except Exception as e_mv:
                logger.error(f"SYNC: MV Refresh failed: {e_mv}")
                
            return jsonify(message=f"Synced. Prices: {len(prices)}. No transactions."), 200

    except Exception as e:
        logger.error(f"SYNC FAIL: {e}")
        logger.error(traceback.format_exc()) # Log strict traceback
        print(f"SYNC FAIL: {e}") # Force stdout
        traceback.print_exc() # Force stdout
        return jsonify(error=str(e)), 500

@app.route('/api/reset', methods=['POST', 'OPTIONS'])
def reset_db_route():
    """
    USER RESET: Deletes currently logged-in user's portfolios and related data.
    PRESERVES: Assets, Asset Prices (Master Data).
    """
    from logger import log_audit
    from db_helper import query_table # Assuming query_table is from db_helper
    import traceback
    if request.method == 'OPTIONS':
        return jsonify(status="ok"), 200

    logger.warning("USER RESET DB REQUEST RECEIVED")
    try:
        data = request.json
        # In a real multi-tenant app, we'd get user_id from auth token.
        # Here we rely on payload or 'all' logic scoped to user.
        # But for now, we assume this request intends to wipe ONE specific portfolio or ALL user portfolios.
        # If '0000...' is sent, we interpret it as "ALL MY PORTFOLIOS".
        
        portfolio_id = data.get('portfolio_id')
        user_id = data.get('user_id') # New optional param if we want to be explicit

        # If we have a user_id, we should fetch all their portfolios.
        # For this refactor, let's keep it simple:
        # If portfolio_id is '0000...', it means "Reset ALL for User".
        # But we need to know WHICH user.
        # If user_id is NOT provided, we might be in trouble for strict multi-tenancy unless we require it.
        # However, looking at current frontend usage, we might only have portfolio_id.
        
        # STRATEGY: 
        # 1. If portfolio_id is specific -> Delete just that portfolio.
        # 2. If portfolio_id is NIL (Delete All) -> We need user_id to scope it.
        #    If no user_id, we fallback to deleting ALL portfolios (Legacy behavior, but safer for assets).
        
        nil_uuid = '00000000-0000-0000-0000-000000000000'
        
        target_portfolios = []
        
        if portfolio_id and portfolio_id != nil_uuid:
            target_portfolios.append(portfolio_id)
        else:
             # Fetch all portfolios (optionally filter by user_id if we had it)
             # For now, let's just get ALL IDs because the previous behavior was "Delete All".
             # But we will NOT delete assets/prices.
             # Ideally, frontend should pass user_id.
             
             # Fetch all portfolio IDs
             all_ports = query_table('portfolios', 'id')
             target_portfolios = [p['id'] for p in all_ports]

        if not target_portfolios:
            logger.info("RESET: No portfolios found to delete.")
            return jsonify(message="No portfolios to delete"), 200

        # Delete dependent data for EACH target portfolio
        # We could optimize with 'in' queries but loop is safer for errors
        
        for pid in target_portfolios:
            logger.info(f"RESET: Cleaning Portfolio {pid}...")
            
            # Transactions
            delete_table('transactions', {'portfolio_id': pid})
            # Dividends
            delete_table('dividends', {'portfolio_id': pid})
            # Snapshots
            delete_table('snapshots', {'portfolio_id': pid})
            # Notes
            delete_table('asset_notes', {'portfolio_id': pid})
            # Settings
            delete_table('portfolio_asset_settings', {'portfolio_id': pid})
            
            # Finally Delete Portfolio
            if not delete_table('portfolios', {'id': pid}):
                logger.error(f"RESET: Failed to delete portfolio {pid}")
                # Don't raise, continue? Or abort?
                # Abort to be safe
                raise Exception(f"Failed to delete portfolio {pid}")
                
        log_audit("RESET_DB", f"USER WIPE COMPLETED. Deleted {len(target_portfolios)} portfolios.")
        return jsonify(status="ok", message="User portfolios deleted. Assets preserved."), 200

    except Exception as e:
        logger.error(f"RESET FAIL: {e}")
        import traceback
        traceback.print_exc()
        return jsonify(error=str(e)), 500

@app.route('/api/admin/reset-system', methods=['POST', 'OPTIONS'])
def system_reset_route():
    """
    SYSTEM RESET: The 'Nuclear Option'. Deletes EVERYTHING.
    Includes Assets, Prices, Configs (optional?).
    """
    from logger import log_audit
    if request.method == 'OPTIONS':
        return jsonify(status="ok"), 200
        
    logger.critical("SYSTEM RESET REQUEST RECEIVED")
    try:
        nil_uuid = '00000000-0000-0000-0000-000000000000'

        # 1. Dependent Tables
        logger.info("sys_reset: Transactions...")
        if not delete_table('transactions', {'id.gt': nil_uuid}): raise Exception("Failed transactions")
        
        logger.info("sys_reset: Dividends...")
        if not delete_table('dividends', {'id.gt': nil_uuid}): raise Exception("Failed dividends")
        
        logger.info("sys_reset: Snapshots...")
        if not delete_table('snapshots', {'id.gt': nil_uuid}): raise Exception("Failed snapshots")
        
        logger.info("sys_reset: Asset Notes...")
        delete_table('asset_notes', {'portfolio_id.neq': nil_uuid})

        logger.info("sys_reset: Portfolio Settings...")
        delete_table('portfolio_asset_settings', {'portfolio_id.neq': nil_uuid})
        
        # 2. Global Data
        logger.info("sys_reset: Asset Prices...")
        if not delete_table('asset_prices', {'isin.neq': 'X_INVALID'}): raise Exception("Failed asset_prices")
        
        logger.info("sys_reset: Assets...")
        if not delete_table('assets', {'id.gt': nil_uuid}): raise Exception("Failed assets")
        
        logger.info("sys_reset: Portfolios...")
        if not delete_table('portfolios', {'id.gt': nil_uuid}): raise Exception("Failed portfolios")

        log_audit("SYSTEM_RESET", "FULL SYSTEM WIPE COMPLETED")
        return jsonify(status="ok", message="System completely wiped."), 200
        
    except Exception as e:
        logger.error(f"SYSTEM RESET FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/ingest', methods=['POST', 'OPTIONS'])
def ingest_excel():
    if request.method == 'OPTIONS':
        return jsonify(status="ok"), 200

    from logger import clear_log_file, configure_file_logging, log_ingestion_start, log_ingestion_summary, log_audit
    
    # [NEW] Configure logging based on user preference ASAP
    # We peek at portfolio_id to check settings (even if we validate it later)
    portfolio_id_param = request.form.get('portfolio_id')
    debug_mode = check_debug_mode(portfolio_id_param)
    configure_file_logging(debug_mode)

    # We clear the log at the very beginning if enabled
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

        # Check debug mode
        portfolio_id = request.form.get('portfolio_id')
        debug_mode = check_debug_mode(portfolio_id)
        
        # [NEW] Fetch current holdings for validation (Sales Check)
        holdings_map = {}
        if portfolio_id:
             try:
                 from db_helper import execute_request
                 # Fetch all transactions to calculate current holdings manually (RPC does not exist)
                 # We need: quantity, type, asset(isin)
                 res = execute_request('transactions', 'GET', params={
                     'select': 'quantity,type,assets(isin)',
                     'portfolio_id': f'eq.{portfolio_id}'
                 })
                 
                 if res and res.status_code == 200:
                     tx_data = res.json()
                     # Aggregate
                     for t in tx_data:
                         asset = t.get('assets')
                         if not asset or not asset.get('isin'): continue
                         
                         isin = asset['isin']
                         qty = float(t.get('quantity', 0))
                         typ = t.get('type') # BUY / SELL
                         
                         if typ == 'BUY':
                             holdings_map[isin] = holdings_map.get(isin, 0.0) + qty
                         elif typ == 'SELL':
                             holdings_map[isin] = holdings_map.get(isin, 0.0) - qty
                     
                     logger.info(f"INGEST DEBUG: Calculated holdings for {len(holdings_map)} assets from {len(tx_data)} transactions.")
                     if holdings_map:
                        logger.info(f"INGEST DEBUG: Sample Holdings: {list(holdings_map.items())[:3]}")
                 else:
                    logger.error(f"INGEST DEBUG: Transactions fetch failed. Status: {res.status_code}")
             except Exception as e:
                 logger.error(f"INGEST: Failed to fetch holdings/transactions: {e}")

        logger.info(f"INGEST: Validating against {len(holdings_map)} existing assets.")
        
        log_ingestion_start(file.filename)

        parse_result = parse_portfolio_excel(file.stream, holdings_map)
        
        if parse_result.get("error"):
            logger.error(f"INGEST FAIL: Parse Error - {parse_result['error']}")
            return jsonify(error=parse_result["error"]), 400
        
        # --- NEW: DIVIDEND FLOW ---
        if parse_result.get('type') == 'DIVIDENDS':
            parsed_divs = parse_result['data']
            
            # [NEW] Comparison with DB for Aggregation Logic
            div_delta = []
            if portfolio_id and parsed_divs:
                try:
                    # 1. Collect needed ISINs to resolve Asset IDs
                    div_isins = list({d['isin'] for d in parsed_divs})
                    
                    # 2. Get Asset IDs from ISINs
                    from db_helper import execute_request
                    in_filter = f"in.({','.join(div_isins)})"
                    res_assets = execute_request('assets', 'GET', params={'select': 'id,isin,name', 'isin': in_filter})
                    
                    asset_map = {}   # isin -> asset_id
                    asset_names = {} # isin -> name
                    if res_assets and res_assets.status_code == 200:
                        for row in res_assets.json():
                            asset_map[row['isin']] = row['id']
                            asset_names[row['isin']] = row.get('name', row['isin'])
                    
                    # 3. Fetch ALL Existing Dividends for these Assets in this Portfolio
                    #    We fetch everything (all dates, all types) to show the full picture
                    asset_ids = list(asset_map.values())
                    db_divs_map = {}  # (asset_id, date, type) -> amount
                    db_totals_by_asset = {}  # asset_id -> {dividends_total, expenses_total, div_count, exp_count}
                    if asset_ids:
                        in_assets = f"in.({','.join(asset_ids)})"
                        res_db_divs = execute_request('dividends', 'GET', params={
                            'select': 'asset_id,date,amount_eur,type', 
                            'portfolio_id': f'eq.{portfolio_id}',
                            'asset_id': in_assets
                        })
                        
                        if res_db_divs and res_db_divs.status_code == 200:
                            for r in res_db_divs.json():
                                db_date = r['date']
                                if isinstance(db_date, str) and 'T' in db_date:
                                    db_date = db_date.split('T')[0]
                                d_type = r.get('type', 'DIVIDEND')
                                db_divs_map[(r['asset_id'], db_date, d_type)] = r['amount_eur']
                                
                                # Accumulate totals per asset for the "full picture"
                                if r['asset_id'] not in db_totals_by_asset:
                                    db_totals_by_asset[r['asset_id']] = {
                                        'dividends_total': 0.0, 'expenses_total': 0.0,
                                        'div_count': 0, 'exp_count': 0
                                    }
                                totals = db_totals_by_asset[r['asset_id']]
                                if d_type == 'EXPENSE':
                                    totals['expenses_total'] += r['amount_eur']
                                    totals['exp_count'] += 1
                                else:
                                    totals['dividends_total'] += r['amount_eur']
                                    totals['div_count'] += 1
                    
                    logger.info(f"INGEST DIVIDENDS: Found {len(db_divs_map)} existing entries in DB for {len(asset_ids)} assets.")
                    
                    # 4. Build Delta (Current vs New vs Total) per entry
                    for d in parsed_divs:
                        isin = d['isin']
                        date_val = d['date']
                        new_amount = d['amount']
                        d_type = d.get('type', 'EXPENSE' if new_amount < 0 else 'DIVIDEND')
                        
                        a_id = asset_map.get(isin)
                        current_amount = 0.0
                        
                        if a_id:
                            current_amount = db_divs_map.get((a_id, date_val, d_type), 0.0)
                        
                        total_amount = current_amount + new_amount
                        
                        # Get overall DB totals for this asset
                        asset_db_totals = db_totals_by_asset.get(a_id, {})
                        
                        div_delta.append({
                            "isin": isin,
                            "name": asset_names.get(isin, isin),
                            "date": date_val,
                            "type": d_type,
                            "current_amount": current_amount,
                            "new_amount": new_amount,
                            "total_amount": total_amount,
                            "operation": "INTEGRAZIONE" if current_amount != 0 else "NUOVO",
                            # Full DB totals for this asset (all dates)
                            "db_dividends_total": asset_db_totals.get('dividends_total', 0.0),
                            "db_expenses_total": asset_db_totals.get('expenses_total', 0.0),
                            "db_div_count": asset_db_totals.get('div_count', 0),
                            "db_exp_count": asset_db_totals.get('exp_count', 0)
                        })
                        
                except Exception as e:
                    logger.error(f"INGEST DIVIDEND LOOKUP ERROR: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    # Fallback: build delta without DB info
                    div_delta = [{
                        "isin": d['isin'], "name": d['isin'], "date": d['date'],
                        "type": d.get('type', 'EXPENSE' if d['amount'] < 0 else 'DIVIDEND'),
                        "current_amount": 0, "new_amount": d['amount'], "total_amount": d['amount'],
                        "operation": "NUOVO",
                        "db_dividends_total": 0, "db_expenses_total": 0,
                        "db_div_count": 0, "db_exp_count": 0
                    } for d in parsed_divs]
            
            return jsonify(
                type='DIVIDENDS',
                parsed_data=parsed_divs,
                delta=div_delta,
                message=f"Analizzati {len(parsed_divs)} flussi per {len({d['isin'] for d in parsed_divs})} asset."
            )

            
        # --- NEW: PRICES FLOW ---
        # --- NEW: PRICES FLOW ---
        if parse_result.get('type') == 'PRICES':
             # Calculate Price Variations for Preview
             from price_manager import calculate_projected_trend
             from db_helper import get_config
             
             prices_data = parse_result['data']
             price_variations = []
             prices_to_save = [] # To mirror structure expected by frontend if needed?
             # Frontend uses 'parsed_data' for "Assets Found" count probably.
             # And 'price_variations' for the list of changes.

             # 1. Config Threshold
             # 1. Config Threshold (Portfolio Specific)
             threshold = 0.1
             try:
                 # Priority: Portfolio Settings > Global Settings > Default
                 found_setting = False
                 if portfolio_id:
                     from db_helper import query_table
                     p_res = query_table('portfolios', 'settings', {'id': portfolio_id})
                     if p_res and len(p_res) > 0:
                         p_settings = p_res[0].get('settings') or {}
                         if 'priceVariationThreshold' in p_settings:
                             threshold = float(p_settings['priceVariationThreshold'])
                             found_setting = True
                             logger.info(f"INGEST: Using Portfolio Threshold: {threshold}")
                 
                 if not found_setting:
                     asset_settings = get_config('asset_settings')
                     if asset_settings:
                        threshold = float(asset_settings.get('priceVariationThreshold', 0.1))
                        logger.info(f"INGEST: Using Global Threshold: {threshold}")
             except Exception as e:
                 logger.warning(f"Error fetching threshold: {e}")
                 threshold = 0.1

             # 2. Group by ISIN (handle historical/multiple prices)
             isin_candidates = {} 
             unique_assets_in_file = set()
             
             for item in prices_data:
                 isin = item.get('isin')
                 price = item.get('price') # Key fixed from ingest.py
                 date_str = item.get('date')
                 desc = item.get('description')
                 
                 if isin and price:
                     if isin not in isin_candidates:
                         isin_candidates[isin] = []
                     isin_candidates[isin].append({'date': date_str, 'price': price})
                     unique_assets_in_file.add(isin)
                     
                     prices_to_save.append({
                        "isin": isin,
                        "price": price,
                        "date": date_str,
                        "description": desc,
                        "source": "Manual Upload"
                     })
            
             # 3. Detect Historical Mode
             is_historical_reconstruction = any(len(cands) > 1 for cands in isin_candidates.values())

             # 4. Calculate Trends
             if debug_mode: logger.info(f"PRICES FLOW: Calculating trends for {len(unique_assets_in_file)} assets...")
             
             for isin in unique_assets_in_file:
                candidates = isin_candidates.get(isin, [])
                if not candidates: continue

                trend_data = calculate_projected_trend(isin, candidates)
                if not trend_data:
                    continue
                
                # Get description (optional) from first item matching ISIN
                desc = next((d.get('description') for d in prices_data if d.get('isin') == isin and d.get('description')), isin)

                variation_obj = {
                    "name": desc,
                    "isin": isin,
                    "variation_pct": trend_data['variation_pct'],
                    "days_delta": trend_data['days_delta'],
                    "old_price": trend_data.get('previous_price'),
                    "new_price": trend_data.get('latest_price'),
                    "is_hidden": False,
                    "price_count": len(candidates)
                }
                
                if abs(trend_data['variation_pct']) < threshold:
                     variation_obj['is_hidden'] = True
                
                price_variations.append(variation_obj)

             price_variations.sort(key=lambda x: abs(x['variation_pct'] or 0), reverse=True)

             return jsonify(
                type='PRICES',
                parsed_data=prices_data,
                price_variations=price_variations,
                prices=prices_to_save, # Frontend might look at this too?
                is_historical_reconstruction=is_historical_reconstruction,
                threshold=threshold,
                message=f"Rilevati {len(prices_data)} aggiornamenti prezzo. Analizzate {len(price_variations)} variazioni."
             )
        
        # --- STANDARD PORTFOLIO FLOW (TRANSACTIONS) ---
        # With the new ingest.py refactoring, parse_result['data'] ALREADY contains the validated transactions
        # or prices depending on the type. We handled DIVIDENDS and PRICES above (partially).
        # But wait, the PRICES flow above just returns JSON to UI. Same for DIVIDENDS.
        # For TRANSACTIONS, we also want to return JSON to UI for confirmation usually?
        # The original code proceeded to save or calculate delta.
        
        # New Logic:
        # If type is TRANSACTIONS, we return them to the frontend for preview/confirmation.
        # The frontend will then call /api/sync (or similar) to actually save them.
        # OR, if the user expects "one-shot" upload, we save them now.
        # Given the previous flow calculated delta and returned it, it implies the Frontend
        # shows a preview ("Azione Suggerita").
        
        # Since we now have explicit transactions from the file:
        if parse_result.get('type') == 'TRANSACTIONS':
            # Calculate Delta with correct pre/post quantities using holdings_map
            delta = []
            # Use holdings_map or empty dict (safety)
            temp_holdings = holdings_map.copy() if holdings_map else {}
            
            for t in parse_result['data']:
                isin = t['isin']
                try:
                    qty_change = float(t['quantity'])
                except:
                    qty_change = 0.0
                
                op = t['operation'] # Acquisto / Vendita
                
                # [NEW] Handle specific error flagging from ingest
                if op == 'ERROR_NEGATIVE_QTY':
                     start_qty = temp_holdings.get(isin, 0.0)
                     delta.append({
                        "isin": isin,
                        "type": 'ERROR_NEGATIVE_QTY',
                        "quantity_change": qty_change,
                        "current_db_qty": start_qty,
                        "new_total_qty": start_qty, # No change executed
                        "excel_price": t.get('price'),
                        "excel_description": t.get('description'),
                        "asset_type_proposal": t.get('asset_type'),
                        "details": f"ERRORE: Saldo insufficiente. Disp: {start_qty:.4f}",
                        "excel_date": t.get('date')
                    })
                    # Skip balance update
                     continue

                start_qty = temp_holdings.get(isin, 0.0)
                
                if op == 'Acquisto':
                    end_qty = start_qty + qty_change
                else: # Vendita
                    # Avoid negative for display (validation logic handled this already)
                    end_qty = max(0.0, start_qty - qty_change)
                
                # Update temp for next op (in case of multiple ops for same isin)
                temp_holdings[isin] = end_qty

                # Add to delta
                delta.append({
                    "isin": isin,
                    "type": op,
                    "quantity_change": qty_change,
                    "current_db_qty": start_qty,
                    "new_total_qty": end_qty,
                    "excel_price": t['price'],
                    "excel_description": t['description'],
                    "asset_type_proposal": t['asset_type'],
                    "details": f"{op} {qty_change} (Saldo: {start_qty} -> {end_qty})", # fallback details
                    "excel_date": t['date']
                })

            return jsonify(
                type='PORTFOLIO', 
                parsed_data=parse_result['data'],
                delta=delta,
                prices=[],
                snapshot_proposal=None,
                price_variations=[],
                threshold=0.1,
                is_historical_reconstruction=False,
                unique_assets_count=len(set(t['isin'] for t in parse_result['data']))
            )

        # Fallback / Error
        return jsonify(error="Tipo file non riconosciuto o non gestito"), 400
        
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

@app.route('/api/portfolios', methods=['GET', 'POST', 'OPTIONS'])
def manage_portfolios():
    from logger import log_audit
    import requests
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        if request.method == 'GET':
            user_id = request.args.get('user_id')
            if not user_id:
                return jsonify(error="Missing user_id"), 400
            
            supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

            if not supabase_url or not service_key:
                return jsonify(error="Missing credentials"), 500
            
            # Use direct HTTP to bypass Supabase client issues
            from db_helper import query_table
            # query_table supports simple equality filters, but we need ordering.
            # Let's use custom request here for ordering, or update query_table?
            # Custom request is safer for specific ordering needs.
            
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            }
            
            resp = requests.get(
                f"{supabase_url}/rest/v1/portfolios?user_id=eq.{user_id}&select=id,name,description,user_id,created_at&order=created_at.desc",
                headers=headers,
                timeout=10
            ) 
            
            if resp.status_code != 200:
                 return jsonify(error=f"DB Error: {resp.status_code}"), 500
                 
            return jsonify(portfolios=resp.json()), 200

        # POST (Create)
        data = request.json
        name = data.get('name')
        user_id = data.get('user_id')
        
        if not name or not user_id:
            return jsonify(error="Missing name or user_id"), 400

        # Use db_helper.upsert_table (which handles both insert and upsert)
        # However, for pure insert and getting the ID back, we need 'return=representation'
        # db_helper.upsert_table does that.
        # But upsert_table might try to merge duplicates. Here we want a new entry.
        # If we don't provide ID, it should be fine.
        
        from db_helper import upsert_table
        
        # We can't easily get the returned data from upsert_table as it returns bool.
        # Let's use direct requests here to get the new OBJECT back.
        
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        post_resp = requests.post(
             f"{supabase_url}/rest/v1/portfolios",
             headers=headers,
             json={
                "user_id": user_id,
                "name": name
             },
             timeout=10
        )
        
        if post_resp.status_code in [200, 201]:
            data = post_resp.json()
            if data and len(data) > 0:
                new_portfolio = data[0]
                log_audit("PORTFOLIO_CREATED", f"ID={new_portfolio['id']}, Name='{name}'")
                return jsonify(new_portfolio), 200
            else:
                 return jsonify(error="Created but no data returned"), 500
        else:
            logger.error(f"PORTFOLIO CREATE FAIL: {post_resp.text}")
            return jsonify(error=f"Failed to create portfolio: {post_resp.status_code}"), 500

    except Exception as e:
        logger.error(f"PORTFOLIO MANAGE FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/portfolios/<portfolio_id>', methods=['DELETE'])
def delete_portfolio(portfolio_id):
    from logger import log_audit
    try:
        import requests
        
        # Verify existence
        from db_helper import query_table
        res_exists = query_table('portfolios', select='name', filters={'id': portfolio_id})
        
        if not res_exists:
             return jsonify(error="Portfolio not found"), 404
        
        p_name = res_exists[0]['name']

        # Delete (Cascade should handle transactions if config is set, but let's be safe)
        # Actually transactions have FK to portfolios usually. 
        # Supabase client normally doesn't cascade unless DB is set up with ON DELETE CASCADE.
        # Let's trust DB or manual delete transactions first if needed. 
        # For now, let's try direct delete.
        
        # Custom DELETE request
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        del_resp = requests.delete(
            f"{supabase_url}/rest/v1/portfolios?id=eq.{portfolio_id}",
            headers=headers,
            timeout=10
        )
        
        if del_resp.status_code not in [200, 204]:
             logger.error(f"PORTFOLIO DELETE FAIL: {del_resp.text}")
             return jsonify(error=f"Delete failed: {del_resp.status_code}"), 500
        
        log_audit("PORTFOLIO_DELETED", f"ID={portfolio_id}, Name='{p_name}'")
        return jsonify(message="Portfolio deleted"), 200

    except Exception as e:
        logger.error(f"PORTFOLIO DELETE FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/validate-model', methods=['POST', 'OPTIONS'])
def validate_model_route():
    try:
        if request.method == 'OPTIONS':
            return jsonify(status="ok"), 200
            
        data = request.json
        api_key = os.getenv('OPENAI_API_KEY')
        model_type = data.get('modelType')
        
        logger.info(f"VALIDATE AI REQUEST: Checking model '{model_type}'")
        logger.info(f"VALIDATE AI: API Key present: {bool(api_key)}, length: {len(api_key) if api_key else 0}")
        
        if not api_key:
            logger.error("VALIDATE AI FAIL: No OPENAI_API_KEY set in environment")
            return jsonify(error="API Key is missing in server configuration"), 400
            
        if not model_type:
             logger.error("VALIDATE AI FAIL: No modelType provided")
             return jsonify(error="Model Type is required"), 400

        logger.info(f"VALIDATE AI: Creating OpenAI client...")
        
        # Create client with timeout settings for Vercel
        client = openai.OpenAI(
            api_key=api_key,
            timeout=8.0  # 8 second timeout to stay within Vercel limits
        )
        
        logger.info(f"VALIDATE AI: Client created, calling models.retrieve('{model_type}')...")
        
        # Verify model access
        try:
            model = client.models.retrieve(model_type)
            logger.info(f"VALIDATE AI SUCCESS: Model '{model_type}' is accessible. ID: {model.id}")
            return jsonify(
                success=True,
                id=model.id,
                owned_by=model.owned_by
            ), 200
        except openai.AuthenticationError as e:
             logger.error(f"VALIDATE AI FAIL: AuthenticationError (Invalid Key): {e}")
             return jsonify(success=False, error="Invalid API Key"), 200
        except openai.NotFoundError as e:
             logger.error(f"VALIDATE AI FAIL: Model '{model_type}' not found: {e}")
             return jsonify(success=False, error=f"Model '{model_type}' not found or no access"), 200
        except openai.APITimeoutError as e:
             logger.error(f"VALIDATE AI FAIL: Timeout connecting to OpenAI: {e}")
             return jsonify(success=False, error="Connection timeout - please try again"), 200
        except openai.APIConnectionError as e:
             logger.error(f"VALIDATE AI FAIL: Connection error to OpenAI: {e}")
             return jsonify(success=False, error="Connection error - check network"), 200
        except Exception as e:
             logger.error(f"VALIDATE AI FAIL: OpenAI Error: {type(e).__name__}: {e}")
             return jsonify(success=False, error=str(e)), 200

    except Exception as e:
        logger.error(f"VALIDATE AI CRITICAL ERROR: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify(error=str(e)), 500

# --- ADMIN USER MANAGEMENT ---

@app.route('/api/admin/users', methods=['GET', 'OPTIONS'])
def list_users_route():
    """
    Lists all users via Supabase Auth Admin API.
    Uses direct HTTP calls to bypass supabase-py limitations with opaque tokens.
    Works for both local (sb_...) and production (eyJ...) keys.
    """
    import requests
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200

        # Get credentials directly from env
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            return jsonify(error="Missing Supabase credentials"), 500
        
        # Direct HTTP call to GoTrue admin endpoint
        auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(auth_url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            logger.error(f"ADMIN LIST USERS FAIL: HTTP {response.status_code} - {response.text}")
            return jsonify(error=f"Auth API error: {response.status_code}"), 500
        
        data = response.json()
        
        # GoTrue returns { users: [...] } or just [...] depending on version
        users_raw = data.get('users', data) if isinstance(data, dict) else data
        
        users_list = []
        for u in users_raw:
            users_list.append({
                "id": u.get("id"),
                "email": u.get("email"),
                "created_at": u.get("created_at"),
                "last_sign_in_at": u.get("last_sign_in_at")
            })
            
        return jsonify(users=users_list), 200
    except requests.exceptions.RequestException as e:
        logger.error(f"ADMIN LIST USERS FAIL (Network): {e}")
        return jsonify(error=str(e)), 500
    except Exception as e:
        logger.error(f"ADMIN LIST USERS FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/admin/users/<user_id>', methods=['DELETE', 'OPTIONS'])
def delete_user_route(user_id):
    """
    Deletes a user via direct HTTP call to Supabase Auth Admin API.
    Works for both local (sb_...) and production (eyJ...) keys.
    """
    import requests
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            return jsonify(error="Missing Supabase credentials"), 500
        
        auth_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.delete(auth_url, headers=headers, timeout=10)
        
        if response.status_code not in [200, 204]:
            logger.error(f"ADMIN DELETE USER FAIL: HTTP {response.status_code} - {response.text}")
            return jsonify(error=f"Auth API error: {response.status_code}"), 500
        
        logger.info(f"ADMIN: Deleted user {user_id}")
        return jsonify(message="User deleted"), 200
    except requests.exceptions.RequestException as e:
        logger.error(f"ADMIN DELETE USER FAIL (Network): {e}")
        return jsonify(error=str(e)), 500
    except Exception as e:
        logger.error(f"ADMIN DELETE USER FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/admin/users/<user_id>/reset_password', methods=['POST', 'OPTIONS'])
def reset_password_route(user_id):
    """
    Triggers Supabase's password reset email flow via direct HTTP.
    SECURITY: First invalidates the old password, then sends reset link.
    Works for both local and production environments.
    """
    import requests
    import secrets
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            return jsonify(error="Missing Supabase credentials"), 500
        
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        # 1. Get user email
        user_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
        user_res = requests.get(user_url, headers=headers, timeout=10)
        
        if user_res.status_code != 200:
            return jsonify(error="User not found"), 404
        
        user_data = user_res.json()
        user_email = user_data.get('email')
        
        if not user_email:
            return jsonify(error="User has no email"), 404
        
        # 2. SECURITY: Immediately invalidate old password by setting a random one
        random_password = secrets.token_urlsafe(32)
        update_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
        update_res = requests.put(
            update_url,
            headers=headers,
            json={"password": random_password},
            timeout=10
        )
        
        if update_res.status_code not in [200, 204]:
            logger.error(f"ADMIN: Failed to invalidate password for {user_id}")
        else:
            logger.info(f"ADMIN: Old password invalidated for user {user_id}")
        
        # 3. Send password reset email
        # Note: This uses the public endpoint, not admin (for email sending)
        reset_url = f"{supabase_url}/auth/v1/recover"
        reset_res = requests.post(
            reset_url,
            headers={"apikey": service_key, "Content-Type": "application/json"},
            json={"email": user_email},
            timeout=10
        )
        
        if reset_res.status_code not in [200, 204]:
            logger.warning(f"ADMIN: Reset email may not have been sent: {reset_res.text}")
        
        logger.info(f"ADMIN: Password reset initiated for {user_email} (user {user_id})")
        
        return jsonify(
            message=f"Password invalidata. Email di reset inviata a {user_email}",
            email=user_email
        ), 200
        
    except requests.exceptions.RequestException as e:
        logger.error(f"ADMIN PASSWORD RESET FAIL (Network): {e}")
        return jsonify(error=str(e)), 500
    except Exception as e:
        logger.error(f"ADMIN PASSWORD RESET FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/user/change_password', methods=['POST'])
def user_change_password_route():
    """
    Endpoint for authenticated users to change their own password via direct HTTP.
    This also clears the needs_password_change flag from app_metadata.
    Works for both local and production environments.
    """
    import requests
    try:
        data = request.json
        new_password = data.get('password')
        user_id = data.get('user_id')
        
        if not new_password or len(new_password) < 6:
            return jsonify(error="Password must be at least 6 characters"), 400
        
        if not user_id:
            return jsonify(error="Missing user_id"), 400

        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            return jsonify(error="Missing Supabase credentials"), 500
        
        # Update password AND clear the app_metadata flag
        update_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.put(
            update_url,
            headers=headers,
            json={
                "password": new_password,
                "app_metadata": {"needs_password_change": False}
            },
            timeout=10
        )
        
        if response.status_code not in [200, 204]:
            logger.error(f"USER PASSWORD CHANGE FAIL: HTTP {response.status_code} - {response.text}")
            return jsonify(error=f"Auth API error: {response.status_code}"), 500
        
        logger.info(f"USER: Password changed for user {user_id}, cleared needs_password_change flag")
        
        return jsonify(message="Password updated successfully"), 200
    except requests.exceptions.RequestException as e:
        logger.error(f"USER PASSWORD CHANGE FAIL (Network): {e}")
        return jsonify(error=str(e)), 500
    except Exception as e:
        logger.error(f"USER PASSWORD CHANGE FAIL: {e}")
        return jsonify(error=str(e)), 500


# --- DEV TEST ENDPOINTS ---

# Default prompt template (same as in llm_asset_info.py)
DEFAULT_LLM_PROMPT = """Recupera informazioni per l'asset:
{isin}
da siti di settore affidabili ed inseriscile nel formato JSON seguente senza cambiare la struttura:
{template}
[REGOLE]
1) se l'informazione non è presente inserisci un valore null, se invece il campo non è applicabile (es. assenza di cedole/dividendi, data di fine non definita) indicare "ND"
2) non inserire valori di quotazione corrente
3) confronta siti di settore diversi per validare le informazioni
4) restituisci il JSON pronto per il parsing senza fornire null'altro"""


# --- LOG CONFIGURATION ---

@app.route('/api/settings/log-config', methods=['GET'])
def get_log_config():
    """
    Get current log configuration for a specific user.
    Uses direct HTTP to bypass RLS with opaque tokens.
    """
    import requests
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify(error="Missing user_id"), 400
        
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            return jsonify(enabled=False), 200
        
        config_key = f'log_config_{user_id}'
        rest_url = f"{supabase_url}/rest/v1/app_config"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        # Query for specific key
        response = requests.get(
            f"{rest_url}?key=eq.{config_key}&select=value",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0 and data[0].get('value'):
                config = data[0]['value']
                return jsonify(config), 200
        
        # Default: disabled
        return jsonify(enabled=False), 200
        
    except Exception as e:
        logger.error(f"GET LOG CONFIG FAIL: {e}")
        return jsonify(enabled=False), 200

@app.route('/api/settings/log-config', methods=['POST'])
def set_log_config():
    """
    Set log configuration for a specific user.
    Uses direct HTTP to bypass RLS with opaque tokens.
    """
    import requests
    try:
        data = request.json
        enabled = data.get('enabled', False)
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify(error="Missing user_id"), 400
        
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_key:
            return jsonify(error="Missing Supabase credentials"), 500
        
        config_key = f'log_config_{user_id}'
        rest_url = f"{supabase_url}/rest/v1/app_config"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation"
        }
        
        # Upsert the config
        response = requests.post(
            rest_url,
            headers=headers,
            json={
                'key': config_key,
                'value': {'enabled': enabled}
            },
            timeout=10
        )
        
        if response.status_code not in [200, 201]:
            logger.error(f"SET LOG CONFIG FAIL: HTTP {response.status_code} - {response.text}")
            return jsonify(error=f"Database error: {response.status_code}"), 500
        
        logger.info(f"LOG CONFIG: File logging for user {user_id} set to {enabled}")
        return jsonify(message="Log configuration saved", enabled=enabled), 200
        
    except requests.exceptions.RequestException as e:
        logger.error(f"SET LOG CONFIG FAIL (Network): {e}")
        return jsonify(error=str(e)), 500
    except Exception as e:
        logger.error(f"SET LOG CONFIG FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/dev/prompt', methods=['GET'])
def get_dev_prompt():
    """Get the current LLM prompt template (from DB or default)."""
    from db_helper import get_config
    try:
        if request.args.get('default') == 'true':
             return jsonify(prompt=DEFAULT_LLM_PROMPT, is_default=True), 200

        config = get_config('llm_asset_prompt', None)
        
        if config and config.get('prompt'):
            prompt = config.get('prompt')
        else:
            prompt = DEFAULT_LLM_PROMPT
            
        return jsonify(prompt=prompt, is_default=(prompt == DEFAULT_LLM_PROMPT)), 200
    except Exception as e:
        logger.error(f"DEV GET PROMPT FAIL: {e}")
        # Return default on error
        return jsonify(prompt=DEFAULT_LLM_PROMPT, is_default=True), 200

@app.route('/api/dev/prompt', methods=['POST'])
def save_dev_prompt():
    """Save custom LLM prompt template to DB."""
    from db_helper import set_config
    try:
        data = request.json
        prompt = data.get('prompt')
        
        if not prompt:
            return jsonify(error="Missing prompt"), 400
        
        success = set_config('llm_asset_prompt', {'prompt': prompt})
        
        if success:
            logger.info("DEV: LLM prompt template saved")
            return jsonify(message="Prompt saved successfully"), 200
        else:
            return jsonify(error="Failed to save prompt"), 500
    except Exception as e:
        logger.error(f"DEV SAVE PROMPT FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/dev/test-llm', methods=['POST'])
def test_llm_endpoint():
    """Test LLM call with specific ISIN and optional custom prompt."""
    try:
        from llm_asset_info import load_descr_asset_template
        import json as json_module
        
        data = request.json
        isin = data.get('isin')
        custom_prompt = data.get('prompt')  # Optional custom prompt
        
        if not isin:
            return jsonify(error="Missing ISIN"), 400
        
        # Load template
        template = load_descr_asset_template()
        if not template:
            return jsonify(error="Failed to load asset template"), 500
            
        # Use custom prompt or fetch from DB or use default
        if custom_prompt:
            prompt_template = custom_prompt
        else:
            from db_helper import get_config
            prompt_config = get_config('llm_asset_prompt')
            
            if prompt_config and prompt_config.get('prompt'):
                prompt_template = prompt_config['prompt']
            else:
                prompt_template = DEFAULT_LLM_PROMPT
        
        # Fetch asset name from DB if {nome_asset} placeholder is present
        asset_name = isin  # Default to ISIN if not found
        if '{nome_asset}' in prompt_template:
            try:
                from db_helper import query_table
                asset_res = query_table('assets', select='name', filters={'isin': isin})
                if asset_res and len(asset_res) > 0 and asset_res[0].get('name'):
                    asset_name = asset_res[0]['name']
                    logger.info(f"DEV TEST LLM: Resolved asset name for {isin}: {asset_name}")
            except Exception as e:
                logger.warning(f"DEV TEST LLM: Could not fetch asset name for {isin}: {e}")
        
        # Build final prompt with all placeholders
        final_prompt = prompt_template.replace('{isin}', isin).replace('{template}', template).replace('{nome_asset}', asset_name)
        
        # [NEW] Fetch Global AI Configuration
        from db_helper import get_config
        cfg = get_config('openai_config')
        
        # Default Config if missing
        model_to_use = 'gpt-4o-mini'
        temperature = 0.3
        max_tokens = 4000
        reasoning_effort = None
        web_search_enabled = False
        
        if cfg:
            model_to_use = cfg.get('model', 'gpt-4o-mini')
            temperature = float(cfg.get('temperature', 0.3))
            max_tokens = int(cfg.get('max_tokens', 4000))
            reasoning_effort = cfg.get('reasoning_effort')
            web_search_enabled = cfg.get('web_search_enabled', False)
        
        # Get API key
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return jsonify(error="No OPENAI_API_KEY configured"), 500
        
        # Make LLM call
        client = openai.OpenAI(api_key=api_key)
        
        # Prepare Parameters
        api_params = {
            "model": model_to_use,
            "messages": [{"role": "user", "content": final_prompt}],
        }
        
        # Check for Reasoning Models (o1, o3, gpt-5)
        # Note: gpt-5 might support temperature, but reasoning models usually don't or have restrictions.
        # Adhering to same logic as llm_asset_info.py
        is_reasoning_model = model_to_use.startswith('gpt-5') or model_to_use.startswith('o1') or model_to_use.startswith('o3')

        if is_reasoning_model and reasoning_effort and reasoning_effort.lower() != 'none':
             api_params["reasoning_effort"] = reasoning_effort
             api_params["max_completion_tokens"] = int(max_tokens)
             # Temperature is typically NOT supported with reasoning_effort or o-series models strictly
             # We skip temperature here.
        else:
             # Standard models
             api_params["temperature"] = temperature
             api_params["max_tokens"] = int(max_tokens)

        logger.info(f"DEV TEST LLM: Request for ISIN: {isin}")
        logger.info(f"  > Model: {model_to_use}")
        logger.info(f"  > Params: Reasoning={reasoning_effort if is_reasoning_model else 'N/A'}, WebSearch={web_search_enabled}")
        
        if web_search_enabled:
            # [NEW] Native Native Web Search via Responses API
            logger.info("DEV TEST LLM: Using Native Responses API for Web Search")
            try:
                # Responses API uses 'input' instead of 'messages' and supports 'web_search_preview'
                response = client.responses.create(
                    model=model_to_use,
                    tools=[{"type": "web_search_preview"}],
                    input=[{"role": "user", "content": final_prompt}]
                )
                
                # Handling response from new API
                logger.info(f"DEV TEST LLM: Responses Object Keys: {dir(response)}")
                
                if hasattr(response, 'output_text'):
                    response_text = response.output_text
                    logger.info("DEV TEST LLM: Found 'output_text' attribute.")
                elif hasattr(response, 'message'):
                     response_text = response.message.content
                     logger.info("DEV TEST LLM: Found 'message.content' attribute.")
                else:
                    response_text = str(response)
                    logger.warning("DEV TEST LLM: Fallback to str(response).")
                
                # Log extraction result
                preview = (response_text[:200] + '...') if response_text and len(response_text) > 200 else response_text
                logger.info(f"DEV TEST LLM: Extracted Text Preview: {preview}")

            except Exception as e:
                logger.error(f"DEV TEST LLM: Responses API Failed: {e}")
                return jsonify(error=f"Responses API Error: {str(e)}"), 500

        else:
            # Standard Chat Completion (No Search)
            response = client.chat.completions.create(**api_params)
            msg = response.choices[0].message
            response_text = msg.content
            
            if response_text is None:
                 if msg.tool_calls:
                     tool_call = msg.tool_calls[0]
                     response_text = f"[SYSTEM] Model invoked tool '{tool_call.function.name}'. (Execution skipped in Dev Test single-shot)"
                 else:
                     response_text = "[SYSTEM] No content returned."
            
            response_text = response_text.strip()
        
        # Try to parse as JSON for validation
        try:
            # Helper to strip markdown code blocks if present
            clean_text = response_text
            if clean_text.startswith('```'):
                lines = clean_text.split('\n')
                # Check if first line is ```json or just ```
                start_idx = 1 
                end_idx = len(lines) - 1 if lines[-1].strip() == '```' else len(lines)
                clean_text = '\n'.join(lines[start_idx:end_idx])
            
            parsed = json_module.loads(clean_text)
            is_valid_json = True
        except:
            parsed = None
            is_valid_json = False
        
        logger.info(f"DEV TEST LLM: Response received, valid JSON: {is_valid_json}")
        
        return jsonify(
            response=response_text,
            is_valid_json=is_valid_json,
            prompt_used=final_prompt,
            config_used={
                "model": model_to_use,
                "reasoning_effort": reasoning_effort if is_reasoning_model else None,
                "web_search": web_search_enabled
            }
        ), 200
        
    except Exception as e:
        logger.error(f"DEV TEST LLM FAIL: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify(error=str(e)), 500



# --- ADMIN / MAINTENANCE ROUTES ---

@app.route('/api/admin/compact-prices', methods=['POST'])
def run_price_compaction():
    """
    Triggers the data compaction process for asset_prices.
    Body: { "isin": "Optional ISIN", "dry_run": true/false }
    """
    try:
        from data_compaction import compact_prices
        
        data = request.json or {}
        dry_run = data.get('dry_run', True)
        isin = data.get('isin')
        
        stats = compact_prices(isin=isin, dry_run=dry_run)
        return jsonify(stats)
    except Exception as e:
        logger.error(f"ADMIN COMPACTION ERROR: {e}")
        return jsonify(error=str(e)), 500


if __name__ == '__main__':
    app.run(port=5328, debug=True)

