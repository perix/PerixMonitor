from flask import Flask, jsonify, request
import os
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

app = Flask(__name__)
register_dashboard_routes(app)
register_assets_routes(app)
register_portfolio_routes(app)

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
        enable_ai_lookup = data.get('enable_ai_lookup', True)  # Default to True for backward compatibility

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
                
                # Ensure existing assets have colors too (backfill)
                exist_ids = list(asset_map.values())
                if exist_ids:
                     assign_colors(portfolio_id, exist_ids)
                
                # 3c. Identify and Create missing assets
                missing_isins = target_isins - set(asset_map.keys())
                
                if missing_isins:
                    # Build a map of ISIN -> description from changes
                    isin_to_description = {}
                    for item in changes:
                        if item.get('isin') and item.get('excel_description'):
                            isin_to_description[item['isin']] = str(item['excel_description']).strip()
                    
                    # Create assets with proper names from Excel
                    new_assets_payload = [
                        {
                            "isin": isin, 
                            "name": isin_to_description.get(isin, isin)  # Use Excel description or fallback to ISIN
                        } 
                        for isin in missing_isins
                    ]
                    res_new = supabase.table('assets').insert(new_assets_payload).execute()
                    if res_new.data:
                        for row in res_new.data:
                            asset_map[row['isin']] = row['id']
                            logger.info(f"SYNC: Created asset {row['isin']} with name '{row['name']}'")
                            
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
                                            supabase.table('assets').update({
                                                "metadata": llm_result['data'],
                                                "metadata_text": None
                                            }).eq('id', row['id']).execute()
                                            logger.info(f"SYNC: Updated asset {row['isin']} with LLM JSON metadata")
                                        elif llm_result.get('response_type') == 'text':
                                            # Save text/markdown to metadata_text column
                                            supabase.table('assets').update({
                                                "metadata": None,
                                                "metadata_text": llm_result['data']
                                            }).eq('id', row['id']).execute()
                                            logger.info(f"SYNC: Updated asset {row['isin']} with LLM text/markdown metadata")
                                    except Exception as llm_err:
                                        logger.error(f"SYNC: Failed to save LLM metadata for {row['isin']}: {llm_err}")
                            else:
                                logger.info(f"SYNC: AI lookup disabled, skipping LLM metadata for {row['isin']}")
                
                
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
        ignore_missing = request.form.get('ignore_missing') == 'true'
        delta = calculate_delta(parse_result['data'], db_holdings, ignore_missing=ignore_missing)
        
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

@app.route('/api/portfolios', methods=['POST', 'OPTIONS'])
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

        return jsonify(error=str(e)), 500

# --- ADMIN USER MANAGEMENT ---

@app.route('/api/admin/users', methods=['GET'])
def list_users_route():
    try:
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

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
def delete_user_route(user_id):
    try:
        supabase = get_supabase_client()
        supabase.auth.admin.delete_user(user_id)
        logger.info(f"ADMIN: Deleted user {user_id}")
        return jsonify(message="User deleted"), 200
    except Exception as e:
        logger.error(f"ADMIN DELETE USER FAIL: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/admin/users/<user_id>/reset_password', methods=['POST'])
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
        
        # Use custom prompt or fetch from DB or use default
        if custom_prompt:
            prompt_template = custom_prompt
        else:
            supabase = get_supabase_client()
            res = supabase.table('app_config').select('value').eq('key', 'llm_asset_prompt').single().execute()
            if res.data and res.data.get('value'):
                prompt_template = res.data['value'].get('prompt', DEFAULT_LLM_PROMPT)
            else:
                prompt_template = DEFAULT_LLM_PROMPT
        
        # Fetch asset name from DB if {nome_asset} placeholder is present
        asset_name = isin  # Default to ISIN if not found
        if '{nome_asset}' in prompt_template:
            try:
                supabase = get_supabase_client()
                asset_res = supabase.table('assets').select('name').eq('isin', isin).single().execute()
                if asset_res.data and asset_res.data.get('name'):
                    asset_name = asset_res.data['name']
                    logger.info(f"DEV TEST LLM: Resolved asset name for {isin}: {asset_name}")
            except Exception as e:
                logger.warning(f"DEV TEST LLM: Could not fetch asset name for {isin}: {e}")
        
        # Build final prompt with all placeholders
        final_prompt = prompt_template.replace('{isin}', isin).replace('{template}', template).replace('{nome_asset}', asset_name)
        
        # Get API key
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return jsonify(error="No OPENAI_API_KEY configured"), 500
        
        # Make LLM call
        client = openai.OpenAI(api_key=api_key)
        
        logger.info(f"DEV TEST LLM: Request for ISIN: {isin}")
        logger.info(f"DEV TEST LLM: === FULL PROMPT START ===")
        logger.info(final_prompt)
        logger.info(f"DEV TEST LLM: === FULL PROMPT END ===")
        
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{"role": "user", "content": final_prompt}],
            temperature=0.3,
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Try to parse as JSON for validation
        try:
            if response_text.startswith('```'):
                lines = response_text.split('\n')
                start_idx = 1 if lines[0].startswith('```') else 0
                end_idx = len(lines) - 1 if lines[-1].strip() == '```' else len(lines)
                response_text = '\n'.join(lines[start_idx:end_idx])
            
            parsed = json_module.loads(response_text)
            is_valid_json = True
        except:
            parsed = None
            is_valid_json = False
        
        logger.info(f"DEV TEST LLM: Response received, valid JSON: {is_valid_json}")
        
        return jsonify(
            response=response_text,
            is_valid_json=is_valid_json,
            prompt_used=final_prompt
        ), 200
        
    except Exception as e:
        logger.error(f"DEV TEST LLM FAIL: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify(error=str(e)), 500


if __name__ == '__main__':
    app.run(port=5328, debug=True)

