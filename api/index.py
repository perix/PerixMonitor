from flask import Flask, jsonify, request
import os
import sys

# Ensure the 'api' directory is in the path for Vercel
api_dir = os.path.dirname(os.path.abspath(__file__))
if api_dir not in sys.path:
    sys.path.append(api_dir)

from dotenv import load_dotenv

# Load env vars safely
if os.path.exists('.env.local'):
    load_dotenv('.env.local')

from datetime import datetime

import pandas as pd
import numpy as np
from ingest import parse_portfolio_excel, calculate_delta
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
    logger.error(f"Unhandled Exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify(error=str(e)), 500

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify(message="Hello from Python!", version="1.1", build="20260127-fix-assets")

from supabase_client import get_supabase_client, get_or_create_default_portfolio

def check_debug_mode(portfolio_id):
    """Check if file logging is enabled for the portfolio owner."""
    if not portfolio_id: return False
    try:
        supabase = get_supabase_client()
        # Get User ID from Portfolio
        res_p = supabase.table('portfolios').select('user_id').eq('id', portfolio_id).single().execute()
        if not res_p.data: return False
        user_id = res_p.data['user_id']
        
        # Get Config for User
        config_key = f'log_config_{user_id}'
        res_c = supabase.table('app_config').select('value').eq('key', config_key).single().execute()
        if res_c.data and res_c.data.get('value'):
             return res_c.data['value'].get('enabled', False)
        return False
    except Exception as e:
        logger.error(f"DEBUG CHECK FAIL: {e}")
        return False

@app.route('/api/sync', methods=['POST'])
def sync_transactions():
    try:
        from logger import configure_file_logging, log_audit
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
        
        if not changes and not data.get('prices') and not data.get('snapshot') and not data.get('trend_updates'):
            return jsonify(message="No data to sync"), 200

        supabase = get_supabase_client()
        
        
        # --- 1. Init Prices (Processing moved to end) ---
        prices = data.get('prices', [])

        # --- 2. Handle Snapshot Record (If present) ---
        snapshot = data.get('snapshot')
        if snapshot:
            try:
                # Update upload_date to NOW just to be precise on confirm
                snapshot['upload_date'] = datetime.now().isoformat()
                supabase.table('snapshots').insert(snapshot).execute()
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
                res_assets = supabase.table('assets').select("id, isin").in_('isin', list(target_isins)).execute()
                asset_map = {row['isin']: row['id'] for row in res_assets.data}
                
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
                    existing_assets_data = supabase.table('assets').select("id, isin, metadata").in_('isin', list(isin_to_type.keys())).execute()
                    if existing_assets_data.data:
                        for row in existing_assets_data.data:
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
                                supabase.table('assets').update({
                                    "metadata": current_meta,
                                    "asset_class": new_type
                                }).eq('id', row['id']).execute()
                        
                        # [NEW] Update Asset Names (Description) for EXISTING assets
                        # If Excel has a better/new description, update the global asset name.
                        isin_to_desc = {}
                        for item in changes:
                            if item.get('isin') and item.get('excel_description'):
                                isin_to_desc[item['isin']] = str(item['excel_description']).strip()
                        
                        if isin_to_desc:
                             # Re-using existing_assets_data if possible or fetch again. 
                             # We can just iterate the same rows since we fetched 'id' and 'isin' (and 'name' if we add it to select)
                             existing_assets_names = supabase.table('assets').select("id, isin, name").in_('isin', list(isin_to_desc.keys())).execute()
                             if existing_assets_names.data:
                                 for row in existing_assets_names.data:
                                     isin = row['isin']
                                     new_name = isin_to_desc.get(isin)
                                     current_name = row.get('name')
                                     
                                     # Update if different and new name is valid
                                     if new_name and new_name != current_name and len(new_name) > 2:
                                         if debug_mode: logger.debug(f"SYNC: Updating Asset Name for {isin}: '{current_name}' -> '{new_name}'")
                                         supabase.table('assets').update({"name": new_name}).eq('id', row['id']).execute()
                
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
                    res_new = supabase.table('assets').insert(new_assets_payload).execute()
                    if res_new.data:
                        for row in res_new.data:
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
                                            
                                            supabase.table('assets').update({
                                                "metadata": new_meta,
                                                "metadata_text": None
                                            }).eq('id', row['id']).execute()
                                            if debug_mode: logger.debug(f"SYNC: Updated asset {row['isin']} with LLM JSON metadata")
                                        elif llm_result.get('response_type') == 'text':
                                            # Save text/markdown to metadata_text column
                                            supabase.table('assets').update({
                                                "metadata": None,
                                                "metadata_text": llm_result['data']
                                            }).eq('id', row['id']).execute()
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
            from price_manager import save_price_snapshot
            count_prices = 0
            for p in prices:
                 try:
                     save_price_snapshot(p['isin'], p['price'], p.get('date'), p.get('source', 'Manual Upload'))
                     count_prices += 1
                 except Exception as p_err:
                     logger.error(f"SYNC PRICE FAIL: {p['isin']} -> {p_err}")
            
            if debug_mode: logger.debug(f"SYNC: Saved {count_prices} price snapshots.")

        # 3. Process Referentials/Trends (if any)
        trend_updates = data.get('trend_updates', [])
        if trend_updates:
            try:
                supabase = get_supabase_client()
                logger.info(f"SYNC: Processing {len(trend_updates)} trend updates...")
                
                # Batch update might be heavy, but let's loop for now (assets table isn't huge)
                # Or better, we just update the ones provided.
                for trend in trend_updates:
                    isin = trend.get('isin')
                    variation = trend.get('variation_pct')
                    days = trend.get('days_delta')
                    
                    if isin:
                         update_payload = {
                             'last_trend_variation': variation,
                             'last_trend_ts': 'now()',
                             'last_trend_days': days
                         }
                         # If days is None, it saves NULL, which is correct for cleared trend.

                         supabase.table('assets').update(update_payload).eq('isin', isin).execute()
                         
            except Exception as e:
                logger.error(f"SYNC: Error updating trends: {e}")
                errors.append(f"Trend Update Error: {str(e)}")

        # 4. Finalize
        if len(errors) > 0:
            return jsonify(error="Sync completed with errors", details=errors), 500
        
        if valid_transactions:
            res = supabase.table('transactions').insert(valid_transactions).execute()
            log_audit("SYNC_SUCCESS", f"Portfolio {portfolio_id}: {len(valid_transactions)} transactions, {len(prices)} prices.")
            return jsonify(message=f"Successfully synced. Prices: {len(prices)}. Trans: {len(valid_transactions)}"), 200
        else:
            log_audit("SYNC_SUCCESS", f"Portfolio {portfolio_id}: {len(prices)} prices only.")
            return jsonify(message=f"Synced. Prices: {len(prices)}. No transactions."), 200

    except Exception as e:
        logger.error(f"SYNC FAIL: {e}")
        logger.error(traceback.format_exc()) # Log strict traceback
        print(f"SYNC FAIL: {e}") # Force stdout
        traceback.print_exc() # Force stdout
        return jsonify(error=str(e)), 500

@app.route('/api/reset', methods=['POST'])
def reset_db_route():
    from logger import log_audit
    logger.warning("RESET DB REQUEST RECEIVED")
    try:
        data = request.json
        portfolio_id = data.get('portfolio_id')
        
        if not portfolio_id:
            return jsonify(error="Missing portfolio_id"), 400

        supabase = get_supabase_client()
        
        # NUCLEAR OPTION: Wipe everything except User/Portfolio structure.
        # 1. Dependent Tables first
        logger.info("RESET: Deleting ALL Transactions...")
        supabase.table('transactions').delete().neq('id', -1).execute() # Delete All
        
        logger.info("RESET: Deleting ALL Dividends...")
        supabase.table('dividends').delete().neq('id', -1).execute() # Delete All
        
        logger.info("RESET: Deleting ALL Snapshots...")
        supabase.table('snapshots').delete().neq('id', -1).execute() # Delete All
        
        # 2. Global Data
        logger.info("RESET: Deleting ALL Asset Prices...")
        # asset_prices PK is composite, but we can filter by non-null ISIN
        supabase.table('asset_prices').delete().neq('isin', 'X_INVALID').execute()
        
        logger.info("RESET: Deleting ALL Assets...")
        # assets PK is id
        supabase.table('assets').delete().neq('id', -1).execute() 
        
        logger.info("RESET: Deleting ALL Portfolios...")
        supabase.table('portfolios').delete().neq('id', -1).execute()

        log_audit("RESET_DB", f"FULL WIPE COMPLETED for Portfolio {portfolio_id}")
        return jsonify(status="ok", message="Database completely wiped (Portfolios, Assets, Prices, History, Transactions)."), 200
            
    except Exception as e:
        logger.error(f"RESET FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/ingest', methods=['POST'])
def ingest_excel():
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
        
        log_ingestion_start(file.filename)

        parse_result = parse_portfolio_excel(file.stream, debug=debug_mode)
        
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
        # portfolio_id handled above for debug check
        
        # Fetch DB Holdings
        db_holdings = {}
        if portfolio_id:
            try:
                supabase = get_supabase_client()
                res = supabase.table('transactions').select("quantity, type, assets(isin, metadata)").eq('portfolio_id', portfolio_id).execute()
                
                if res.data:
                    for t in res.data:
                        isin = t['assets']['isin'] # Adjusting for nested object
                        meta = t['assets'].get('metadata')
                        
                        qty = t['quantity']
                        if t['type'] == 'SELL':
                            qty = -qty
                        
                        # Store tuple: (qty, metadata)
                        if isin not in db_holdings:
                             db_holdings[isin] = {"qty": 0.0, "metadata": meta}
                        
                        db_holdings[isin]["qty"] += qty
                        # Metadata should be same for same ISIN (global)
                        if meta and not db_holdings[isin]["metadata"]:
                             db_holdings[isin]["metadata"] = meta
                
                if debug_mode: logger.debug(f"Fetched holdings for {portfolio_id}: {len(db_holdings)} assets")
                
            except Exception as e:
                logger.error(f"INGEST: Failed to fetch DB holdings: {e}")
                import traceback
                logger.error(traceback.format_exc())
                pass

        # Calculate Delta
        delta = calculate_delta(parse_result['data'], db_holdings, debug=debug_mode)
        
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
        
        # --- [NEW] PRICE VARIATION SUMMARY LOGIC ---
        real_transactions = [d for d in delta if d['type'] not in ['METADATA_UPDATE', 'ERROR_QTY_MISMATCH_NO_OP', 'ERROR_INCOMPLETE_OP']]
        price_variations = []
        threshold = 0.1  # Default value
        is_historical_reconstruction = False
        unique_assets_in_file = set()
        
        if len(real_transactions) == 0 and len(prices_to_save) > 0:
            if debug_mode: logger.debug("INGEST: No transactions detected. Calculating Price Variations...")
            from price_manager import calculate_projected_trend
            
            # [USER REQUEST] Filter out variations smaller than configured threshold
            try:
                supabase = get_supabase_client()
                config_res = supabase.table('app_config').select('value').eq('key', 'asset_settings').execute()
                threshold = 0.1
                if config_res.data:
                    threshold = float(config_res.data[0]['value'].get('priceVariationThreshold', 0.1))
            except Exception as e:
                logger.error(f"Error fetching config, using default threshold 0.1: {e}")
                threshold = 0.1

            # [NEW] Detect if we have multiple prices for the same ISIN (Historical Reconstruction)
            isin_candidates = {} # Map ISIN -> List of {date, price}
            
            for item in parse_result['data']:
                isin = item.get('isin')
                price = item.get('current_price')
                date_str = item.get('date') or datetime.now().strftime("%Y-%m-%d")
                
                if isin and price:
                    if isin not in isin_candidates:
                        isin_candidates[isin] = []
                    isin_candidates[isin].append({'date': date_str, 'price': price})
                    unique_assets_in_file.add(isin)
            
            # [USER REQUEST] If ANY ISIN appears multiple times, the ENTIRE file is historical reconstruction
            # BUT we now use the SAME LOGIC for everything.
            has_duplicate_isins = any(len(cands) > 1 for cands in isin_candidates.values())
            
            is_historical_reconstruction = has_duplicate_isins

            if debug_mode: logger.debug(f"INGEST: Processing {len(unique_assets_in_file)} unique assets. Historical Mode: {is_historical_reconstruction}")

            for isin in unique_assets_in_file:
                candidates = isin_candidates.get(isin, [])
                if not candidates: continue

                # Calculate projected trend
                trend_data = calculate_projected_trend(isin, candidates)
                
                if not trend_data:
                    continue

                # Prepare the variation object
                desc = next((d.get('description') for d in parse_result['data'] if d.get('isin') == isin), isin)
                
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

                # Threshold Logic
                if abs(trend_data['variation_pct']) < threshold:
                     variation_obj['variation_pct'] = 0.0
                     variation_obj['is_hidden'] = True
                     
                # [USER REQUEST] Sold Assets Logic: If final quantity is 0, set trend to null (None)
                # Calculate final quantity: Current Holding + Delta
                current_qty = db_holdings.get(isin, {}).get('qty', 0)
                
                # Calculate delta for this ISIN from actual transactions
                isin_delta = 0
                for d in real_transactions:
                    if d.get('isin') == isin:
                         # Sales are negative in delta? Check logic.
                         # In ingest_file logic (lines 450+), logic is:
                         # If found in file (qty_file) vs existing (qty_db).
                         # delta = qty_file - qty_db.
                         # So final_qty SHOULD be qty_file (if full snapshot mode) ??
                         # But wait, ingest handles "delta" for transactions.
                         # Use the 'quantity' from the file row if available?
                         # Or just check if the parsed data has quantity 0?
                         pass
                
                # Simpler approach: Check the parsed item for this ISIN.
                # If the file says quantity is 0, then it's 0.
                # If the file doesn't have quantity (only price update), we rely on DB.
                # But if we assume the file reflects the portfolio state...
                
                # Let's start with: Is there an item in the file with Quantity = 0?
                # Actually, ingest logic (lines 480+) calculates delta based on difference.
                # If we rely on valid_transactions? No, that's for saving.
                
                # Let's peek at the 'final' quantity perceived by the ingest logic.
                # 'existing_holdings' is the DB state.
                # 'delta' contains the change.
                # final_qty = existing_found + change.
                
                # Find delta for this ISIN
                d_item = next((x for x in delta if x.get('isin') == isin), None)
                final_qty = current_qty
                if d_item:
                    final_qty = current_qty + d_item.get('quantity_change', 0)
                
                # Also check if it's a direct price update with quantity in the file
                # The file row might allow us to be more precise if delta logic is complex.
                # But delta logic IS what generates transactions.
                
                if final_qty <= 0.001: # Float safety
                     variation_obj['variation_pct'] = None
                     variation_obj['days_delta'] = None
                     variation_obj['is_hidden'] = True # Don't show in modal either?
                     # The user said "Non deve essere visualizzato nulla a livello di UI".
                     # If we hide it in modal, the user won't see "Trend Update: NULL".
                     # But we DO want to send it to backend to update DB to NULL.
                     # So is_hidden = True prevents Modal display.
                     # But UploadForm logic sends trendUpdates based on priceModalData.variations.
                     # If is_hidden is True, does it send it?
                     # Let's check UploadForm.tsx logic soon (mental check).
                     # Usually filtering is done for display, but we might filter for sending?
                     # We need to ensure it IS sent.
                     pass

                price_variations.append(variation_obj)
                
                # If Historical, we still want to pass the data, the UI will decide how to show it.
                # But typically historical mode shows a simpler table.
                # However, the USER asked to use this logic "whenever there are price injections".
                # So we pass the full object.
                price_variations.append(variation_obj)

            # Sort by absolute variation for user visibility (or just variation)
            price_variations.sort(key=lambda x: abs(x['variation_pct']), reverse=True)
            
            if debug_mode: logger.debug(f"INGEST: Calculated {len(price_variations)} variations. Historical={is_historical_reconstruction}")
        
        # Prepare Snapshot Record (Don't save yet)
        
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

        # [DEBUG] Log the outgoing details
        if debug_mode:
            logger.debug(f"INGEST DEBUG: Sending Response. Delta Len: {len(delta)}, Prices Len: {len(prices_to_save)}")
            if len(delta) > 0:
                 logger.debug(f"INGEST DEBUG: Delta Sample: {delta[0]}")

        log_ingestion_summary(len(parse_result['data']), len(delta), 0) # Missing count legacy

        return jsonify(
            type='PORTFOLIO',
            parsed_data=parse_result['data'],
            delta=list(delta),
            prices=prices_to_save,
            snapshot_proposal=snapshot_proposal,
            price_variations=price_variations,
            threshold=threshold,
            is_historical_reconstruction=is_historical_reconstruction,
            unique_assets_count=len(unique_assets_in_file)
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

@app.route('/api/portfolios', methods=['GET', 'POST', 'OPTIONS'])
def manage_portfolios():
    from logger import log_audit
    try:
        if request.method == 'GET':
            user_id = request.args.get('user_id')
            if not user_id:
                return jsonify(error="Missing user_id"), 400
            
            supabase = get_supabase_client()
            res = supabase.table('portfolios').select('id, name, description, user_id, created_at').eq('user_id', user_id).order('created_at', desc=True).execute()
            return jsonify(res.data if res.data else []), 200

        # POST (Create)
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
            log_audit("PORTFOLIO_CREATED", f"ID={new_portfolio['id']}, Name='{name}'")
            return jsonify(new_portfolio), 200
        else:
            logger.error(f"PORTFOLIO CREATE FAIL: Supabase returned no data")
            return jsonify(error="Failed to create portfolio"), 500

    except Exception as e:
        logger.error(f"PORTFOLIO MANAGE FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/portfolios/<portfolio_id>', methods=['DELETE'])
def delete_portfolio(portfolio_id):
    from logger import log_audit
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
        
        log_audit("PORTFOLIO_DELETED", f"ID={portfolio_id}, Name='{p_name}'")
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

# --- ADMIN USER MANAGEMENT ---

@app.route('/api/admin/users', methods=['GET', 'OPTIONS'])
def list_users_route():
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200

        supabase = get_supabase_client()
        # list_users() returns UserResponse object which has 'users' property (list of User objects)
        response = supabase.auth.admin.list_users() 
        
        # We need to serialize User objects to dicts
        users_list = []
        for u in response:
            users_list.append({
                "id": u.id,
                "email": u.email,
                "created_at": u.created_at,
                "last_sign_in_at": u.last_sign_in_at
            })
            
        return jsonify(users=users_list), 200
    except Exception as e:
        logger.error(f"ADMIN LIST USERS FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/admin/users/<user_id>', methods=['DELETE', 'OPTIONS'])
def delete_user_route(user_id):
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        supabase = get_supabase_client()
        supabase.auth.admin.delete_user(user_id)
        logger.info(f"ADMIN: Deleted user {user_id}")
        return jsonify(message="User deleted"), 200
    except Exception as e:
        logger.error(f"ADMIN DELETE USER FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/admin/users/<user_id>/reset_password', methods=['POST', 'OPTIONS'])
def reset_password_route(user_id):
    """
    Triggers Supabase's password reset email flow.
    SECURITY: First invalidates the old password, then sends reset link.
    """
    try:
        import secrets
        
        supabase = get_supabase_client()
        
        # 1. Get user email
        user_res = supabase.auth.admin.get_user_by_id(user_id)
        if not user_res.user or not user_res.user.email:
            return jsonify(error="User not found or has no email"), 404
        
        user_email = user_res.user.email
        
        # 2. SECURITY: Immediately invalidate old password by setting a random one
        # This ensures the old password cannot be used while waiting for reset
        random_password = secrets.token_urlsafe(32)
        supabase.auth.admin.update_user_by_id(
            user_id,
            {"password": random_password}
        )
        logger.info(f"ADMIN: Old password invalidated for user {user_id}")
        
        # 3. Send password reset email using Supabase's built-in method
        # This actually sends the email (unlike generate_link which only generates)
        supabase.auth.reset_password_for_email(user_email)
        
        logger.info(f"ADMIN: Password reset email sent to {user_email} for user {user_id}")
        
        return jsonify(
            message=f"Password invalidata. Email di reset inviata a {user_email}",
            email=user_email
        ), 200
        
    except Exception as e:
        logger.error(f"ADMIN PASSWORD RESET FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/user/change_password', methods=['POST'])
def user_change_password_route():
    """Endpoint for authenticated users to change their own password.
    This also clears the needs_password_change flag from app_metadata.
    """
    try:
        data = request.json
        new_password = data.get('password')
        user_id = data.get('user_id')
        
        if not new_password or len(new_password) < 6:
            return jsonify(error="Password must be at least 6 characters"), 400
        
        if not user_id:
            return jsonify(error="Missing user_id"), 400

        supabase = get_supabase_client()
        
        # Update password AND clear the app_metadata flag
        supabase.auth.admin.update_user_by_id(
            user_id, 
            {
                "password": new_password,
                "app_metadata": {"needs_password_change": False}
            }
        )
        logger.info(f"USER: Password changed for user {user_id}, cleared needs_password_change flag")
        
        return jsonify(message="Password updated successfully"), 200
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
    """Get current log configuration for a specific user."""
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify(error="Missing user_id"), 400
            
        supabase = get_supabase_client()
        config_key = f'log_config_{user_id}'
        res = supabase.table('app_config').select('value').eq('key', config_key).single().execute()
        
        if res.data and res.data.get('value'):
            config = res.data['value']
        else:
            # Default: disabled
            config = {'enabled': False}
            
        return jsonify(config), 200
    except Exception as e:
        logger.error(f"GET LOG CONFIG FAIL: {e}")
        return jsonify(enabled=False), 200

@app.route('/api/settings/log-config', methods=['POST'])
def set_log_config():
    """Set log configuration for a specific user."""
    try:
        data = request.json
        enabled = data.get('enabled', False)
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify(error="Missing user_id"), 400
        
        supabase = get_supabase_client()
        config_key = f'log_config_{user_id}'
        supabase.table('app_config').upsert({
            'key': config_key,
            'value': {'enabled': enabled}
        }).execute()
        
        logger.info(f"LOG CONFIG: File logging for user {user_id} set to {enabled}")
        return jsonify(message="Log configuration saved", enabled=enabled), 200
    except Exception as e:
        logger.error(f"SET LOG CONFIG FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/dev/prompt', methods=['GET'])
def get_dev_prompt():
    """Get the current LLM prompt template (from DB or default)."""
    try:
        if request.args.get('default') == 'true':
             return jsonify(prompt=DEFAULT_LLM_PROMPT, is_default=True), 200

        supabase = get_supabase_client()
        res = supabase.table('app_config').select('value').eq('key', 'llm_asset_prompt').single().execute()
        
        if res.data and res.data.get('value'):
            prompt = res.data['value'].get('prompt', DEFAULT_LLM_PROMPT)
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
    try:
        data = request.json
        prompt = data.get('prompt')
        
        if not prompt:
            return jsonify(error="Missing prompt"), 400
        
        supabase = get_supabase_client()
        supabase.table('app_config').upsert({
            'key': 'llm_asset_prompt',
            'value': {'prompt': prompt}
        }).execute()
        
        logger.info("DEV: LLM prompt template saved")
        return jsonify(message="Prompt saved successfully"), 200
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
            
        supabase = get_supabase_client()
        
        # Use custom prompt or fetch from DB or use default
        if custom_prompt:
            prompt_template = custom_prompt
        else:
            res = supabase.table('app_config').select('value').eq('key', 'llm_asset_prompt').single().execute()
            if res.data and res.data.get('value'):
                prompt_template = res.data['value'].get('prompt', DEFAULT_LLM_PROMPT)
            else:
                prompt_template = DEFAULT_LLM_PROMPT
        
        # Fetch asset name from DB if {nome_asset} placeholder is present
        asset_name = isin  # Default to ISIN if not found
        if '{nome_asset}' in prompt_template:
            try:
                # Re-using supabase client
                asset_res = supabase.table('assets').select('name').eq('isin', isin).single().execute()
                if asset_res.data and asset_res.data.get('name'):
                    asset_name = asset_res.data['name']
                    logger.info(f"DEV TEST LLM: Resolved asset name for {isin}: {asset_name}")
            except Exception as e:
                logger.warning(f"DEV TEST LLM: Could not fetch asset name for {isin}: {e}")
        
        # Build final prompt with all placeholders
        final_prompt = prompt_template.replace('{isin}', isin).replace('{template}', template).replace('{nome_asset}', asset_name)
        
        # [NEW] Fetch Global AI Configuration
        res_config = supabase.table('app_config').select('value').eq('key', 'openai_config').single().execute()
        
        # Default Config if missing
        model_to_use = 'gpt-4o-mini'
        temperature = 0.3
        max_tokens = 4000
        reasoning_effort = None
        web_search_enabled = False
        
        if res_config.data and res_config.data.get('value'):
            cfg = res_config.data['value']
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


if __name__ == '__main__':
    app.run(port=5328, debug=True)

