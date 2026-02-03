from flask import jsonify, request
from supabase_client import get_supabase_client
from logger import logger
from price_manager import get_latest_price
from finance import xirr
from datetime import datetime
import traceback

def register_portfolio_routes(app):
    
    @app.route('/api/portfolio/<portfolio_id>', methods=['GET'])
    def get_portfolio_details(portfolio_id):
        """
        Returns details for a specific portfolio (e.g. name).
        """
        try:
            supabase = get_supabase_client()
            res = supabase.table('portfolios').select('id, name, settings').eq('id', portfolio_id).single().execute()
            
            if not res.data:
                return jsonify(error="Portfolio not found"), 404
            
            return jsonify(res.data)
        except Exception as e:
            logger.error(f"GET PORTFOLIO DETAILS ERROR: {str(e)}")
            return jsonify(error=str(e)), 500

    @app.route('/api/portfolios', methods=['GET'])
    def list_portfolios():
        try:
            user_id = request.args.get('user_id')
            if not user_id:
                # If no user_id, return all? Or error?
                # For safety, let's require user_id or handle authentication token.
                return jsonify(error="Missing user_id"), 400

            supabase = get_supabase_client()
            res = supabase.table('portfolios').select('*').eq('user_id', user_id).execute()
            
            return jsonify(portfolios=res.data)
        except Exception as e:
            logger.error(f"LIST PORTFOLIOS ERROR: {str(e)}")
            return jsonify(error=str(e)), 500

    @app.route('/api/portfolio/<portfolio_id>/settings', methods=['PATCH', 'OPTIONS'])
    def update_portfolio_settings(portfolio_id):
        """
        Updates the settings JSONB column for a portfolio.
        """
        try:
            if request.method == 'OPTIONS':
                 return jsonify(status="ok"), 200
            settings_update = request.json
            if settings_update is None:
                return jsonify(error="Missing settings in body"), 400

            supabase = get_supabase_client()
            
            # Fetch existing settings first to merge (optional, but safer if partial updates supported)
            # For simplicity, we'll do a shallow merge or overwrite. 
            # Let's assume the frontend sends the specific keys to update/merge.
            # Supabase/Postgrest doesn't have a simple deep merge patch out of the box without functions.
            # We'll fetch, update in python, and write back.
            
            res_curr = supabase.table('portfolios').select("settings").eq('id', portfolio_id).single().execute()
            current_settings = res_curr.data.get('settings') or {}
            
            # Merge
            current_settings.update(settings_update)
            
            res = supabase.table('portfolios').update({"settings": current_settings}).eq('id', portfolio_id).execute()
            
            return jsonify(success=True, settings=current_settings)
            
        except Exception as e:
            logger.error(f"UPDATE SETTINGS ERROR: {str(e)}")
            return jsonify(error=str(e)), 500

    @app.route('/api/portfolio/assets', methods=['GET'])
    def get_portfolio_assets():
        """
        Returns all unique assets for a given portfolio with their full details,
        including P&L and MWR calculations.
        """
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            supabase = get_supabase_client()
            
            # Fetch all transactions with asset data for this portfolio
            res_trans = supabase.table('transactions').select(
                "quantity, type, price_eur, date, assets(id, isin, name, ticker, asset_class, country, sector, rating, issuer, currency, metadata, last_trend_variation, last_trend_days)"
            ).eq('portfolio_id', portfolio_id).order('date').execute()
            
            if not res_trans.data:
                return jsonify(assets=[])
            
            # Calculate current holdings per asset with cost basis and cashflows
            holdings = {}  # isin -> {asset_data, qty, total_cost, cashflows}
            
            for t in res_trans.data:
                asset = t['assets']
                isin = asset['isin']
                qty = float(t['quantity'])
                price = float(t['price_eur'])
                trans_date = t['date']
                is_buy = t['type'] == 'BUY'
                
                if isin not in holdings:
                    holdings[isin] = {
                        "asset": asset,
                        "qty": 0,
                        "total_cost": 0,  # Total invested
                        "cashflows": []   # For XIRR calculation
                    }
                
                if is_buy:
                    holdings[isin]['qty'] += qty
                    holdings[isin]['total_cost'] += (qty * price)
                    # Cashflow: outflow (negative) for buys
                    holdings[isin]['cashflows'].append({
                        "date": datetime.fromisoformat(trans_date).replace(tzinfo=None),
                        "amount": -(qty * price)
                    })
                else:
                    holdings[isin]['qty'] -= qty
                    holdings[isin]['total_cost'] -= (qty * price)  # Reduce invested
                    # Cashflow: inflow (positive) for sells
                    holdings[isin]['cashflows'].append({
                        "date": datetime.fromisoformat(trans_date).replace(tzinfo=None),
                        "amount": (qty * price)
                    })
            
            # Filter to only active holdings (qty > 0) and calculate metrics
            result = []
            for isin, data in holdings.items():
                if data['qty'] > 0.0001:  # Small threshold for floating point
                    asset_info = data['asset'].copy()
                    current_qty = data['qty']
                    
                    # Get latest price
                    price_data = get_latest_price(isin)
                    
                    latest_price = 0.0
                    if price_data:
                        latest_price = float(price_data['price'])
                        asset_info['latest_price'] = latest_price
                        asset_info['price_date'] = price_data['date']
                        asset_info['price_source'] = price_data['source']
                    else:
                        asset_info['latest_price'] = None
                        asset_info['price_date'] = None
                        asset_info['price_source'] = None
                    
                    # FALLBACK: If price is 0 (missing), we use 0.
                    # Do NOT fallback to Cost Basis, as it masks P&L.
                    if latest_price == 0 and current_qty > 0:
                         latest_price = 0
                             # Indicate it's a fallback? Maybe not needed for calculation, just for display value.
                             # We don't change source to keep it clear it's not a real price update.

                    asset_info['latest_price'] = latest_price if latest_price > 0 else None
                    asset_info['current_qty'] = current_qty
                    
                    # Calculate current value
                    current_value = current_qty * latest_price
                    asset_info['current_value'] = round(current_value, 2)
                    
                    # Calculate P&L
                    invested = data['total_cost']
                    asset_info['invested'] = round(invested, 2)
                    pnl_value = current_value - invested
                    pnl_percent = (pnl_value / invested * 100) if invested > 0 else 0
                    asset_info['pnl_value'] = round(pnl_value, 2)
                    asset_info['pnl_percent'] = round(pnl_percent, 2)
                    
                    # Calculate MWR (XIRR) for this asset
                    mwr = None
                    mwr_type = "NONE"
                    
                    if current_value > 0 and data['cashflows']:
                        # Get tier params
                        # Get tier params from DB settings if not in args
                        # Note: This API is usually called without args from the Portfolio page.
                        # We should check the portfolio settings fetched via get_portfolio_details or just fetch them here optimization.
                        # Since we are inside a loop, we should fetch settings ONCE outside.
                        
                        # (Correction: we are inside the function, let's fetch settings once efficiently)
                        if 'settings_cache' not in locals():
                             try:
                                 res_s = supabase.table('portfolios').select('settings').eq('id', portfolio_id).single().execute()
                                 settings_cache = res_s.data.get('settings') or {}
                             except:
                                 settings_cache = {}
                        
                        # Use args first, then DB settings, then default
                        t1_val = request.args.get('mwr_t1')
                        if t1_val is None:
                             t1_val = settings_cache.get('mwr_t1', 30)
                        
                        t2_val = request.args.get('mwr_t2')
                        if t2_val is None:
                             t2_val = settings_cache.get('mwr_t2', 365)

                        mwr_t1 = int(t1_val)
                        mwr_t2 = int(t2_val)
                        
                        from finance import get_tiered_mwr
                        # cashflows is just the history list so far
                        mwr_val, mwr_t = get_tiered_mwr(data['cashflows'], current_value, t1=mwr_t1, t2=mwr_t2)
                        mwr = mwr_val
                        mwr_type = mwr_t

                    asset_info['mwr'] = mwr
                    asset_info['mwr_type'] = mwr_type
                    
                    result.append(asset_info)
            
            # Sort by name
            result.sort(key=lambda x: x.get('name', x.get('isin', '')))
            
            return jsonify(assets=result)

        except Exception as e:
            logger.error(f"PORTFOLIO ASSETS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
