from flask import jsonify, request
from db_helper import execute_request, update_table
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
            # supabase = get_supabase_client()
            # res = supabase.table('portfolios').select('id, name, settings').eq('id', portfolio_id).single().execute()
            res = execute_request('portfolios', 'GET', params={
                'select': 'id,name,settings',
                'id': f'eq.{portfolio_id}'
            }, headers={"Accept": "application/vnd.pgrst.object+json"}) # Ensure single object return if possible, or just parse list
            
            # PostgREST returns object with Accept header or list without it unless &limit=1 and some headers.
            # Easiest: get list and take first.
            
            data = None
            if res and res.status_code == 200:
                json_resp = res.json()
                # If we used Accept header for single object:
                if isinstance(json_resp, dict):
                     data = json_resp
                elif isinstance(json_resp, list) and json_resp:
                     data = json_resp[0]

            if not data:
                return jsonify(error="Portfolio not found"), 404
            
            return jsonify(data)
        except Exception as e:
            logger.error(f"GET PORTFOLIO DETAILS ERROR: {str(e)}")
            return jsonify(error=str(e)), 500

    # NOTE: The /api/portfolios route is now defined in index.py (manage_portfolios)
    # This was removed to prevent duplicate route registration errors in Flask.

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

            # supabase = get_supabase_client()
            
            # 1. Fetch existing settings
            # res_curr = supabase.table('portfolios').select("settings").eq('id', portfolio_id).single().execute()
            res_curr = execute_request('portfolios', 'GET', params={
                'select': 'settings',
                'id': f'eq.{portfolio_id}'
            })
            
            current_settings = {}
            if res_curr and res_curr.status_code == 200:
                rows = res_curr.json()
                if rows:
                    current_settings = rows[0].get('settings') or {}
            
            # Merge
            current_settings.update(settings_update)
            
            # 2. Update
            # res = supabase.table('portfolios').update({"settings": current_settings}).eq('id', portfolio_id).execute()
            update_table('portfolios', {"settings": current_settings}, {'id': portfolio_id})
            
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

            # supabase = get_supabase_client()
            
            # Fetch all transactions with asset data for this portfolio
            # res_trans = supabase.table('transactions').select(...).eq(...).order(...).execute()
            res_trans = execute_request('transactions', 'GET', params={
                'select': 'quantity,type,price_eur,date,assets(id,isin,name,ticker,asset_class,country,sector,rating,issuer,currency,metadata,last_trend_variation,last_trend_days)',
                'portfolio_id': f'eq.{portfolio_id}',
                'order': 'date.asc'
            })
            
            trans_data = res_trans.json() if (res_trans and res_trans.status_code == 200) else []
            
            if not trans_data:
                return jsonify(assets=[])
            
            # Calculate current holdings per asset with cost basis and cashflows
            holdings = {}  # isin -> {asset_data, qty, total_cost, cashflows}
            
            for t in trans_data:
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
                    try:
                        clean_date = trans_date.replace('Z', '+00:00')
                        cf_date = datetime.fromisoformat(clean_date).replace(tzinfo=None)
                    except:
                        cf_date = datetime.now()

                    holdings[isin]['cashflows'].append({
                        "date": cf_date,
                        "amount": (qty * price)
                    })

            # Fetch all dividends for this portfolio
            res_div = execute_request('dividends', 'GET', params={
                'portfolio_id': f'eq.{portfolio_id}'
            })
            div_data = res_div.json() if (res_div and res_div.status_code == 200) else []
            
            # Map dividends to holdings
            # We need asset_id -> isin map from previous transactions or fetch it
            # Since we have asset object in trans_data, we can build a map
            aid_to_isin = {}
            for t in trans_data:
                aid_to_isin[t['assets']['id']] = t['assets']['isin']
            
            for d in div_data:
                isin = aid_to_isin.get(d['asset_id'])
                if isin and isin in holdings:
                    amount = float(d['amount_eur'])
                    try:
                        clean_div_date = d['date'].replace('Z', '+00:00')
                        div_date = datetime.fromisoformat(clean_div_date).replace(tzinfo=None)
                    except:
                        div_date = datetime.now()
                    
                    # Add to cashflows for MWR
                    holdings[isin]['cashflows'].append({
                        "date": div_date,
                        "amount": amount
                    })
                    
                    # Track total dividends for P&L
                    holdings[isin]['total_dividends'] = holdings[isin].get('total_dividends', 0) + amount
            
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
                    total_div = data.get('total_dividends', 0)
                    asset_info['invested'] = round(invested, 2)
                    asset_info['total_dividends'] = round(total_div, 2)
                    
                    # P&L including dividends: (Current Value - Net Invested) + Dividends
                    pnl_value = (current_value - invested) + total_div
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
                                 # res_s = supabase.table('portfolios').select('settings').eq('id', portfolio_id).single().execute()
                                 # settings_cache = res_s.data.get('settings') or {}
                                 res_s = execute_request('portfolios', 'GET', params={'select': 'name,settings', 'id': f'eq.{portfolio_id}'})
                                 rows = res_s.json() if (res_s and res_s.status_code == 200) else []
                                 portfolio_name = rows[0].get('name') or "Portafoglio" if rows else "Portafoglio"
                                 settings_cache = rows[0].get('settings') or {} if rows else {}
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
                        
                        # Option A: Determine end_date for this asset to avoid dilution
                        asset_end_date = datetime.now()
                        if asset_info.get('price_date'):
                            asset_end_date = datetime.strptime(asset_info['price_date'], '%Y-%m-%d')
                        
                        # Check last cashflow date too
                        last_cf_date = max(f['date'] for f in data['cashflows']) if data['cashflows'] else asset_end_date
                        asset_end_date = max(asset_end_date, last_cf_date)
                        
                        # cashflows is just the history list so far
                        mwr_val, mwr_t = get_tiered_mwr(data['cashflows'], current_value, t1=mwr_t1, t2=mwr_t2, end_date=asset_end_date)
                        mwr = mwr_val
                        mwr_type = mwr_t

                    asset_info['mwr'] = mwr
                    asset_info['mwr_type'] = mwr_type
                    
                    result.append(asset_info)
            
            # Sort by name
            result.sort(key=lambda x: x.get('name', x.get('isin', '')))
            
            p_name = portfolio_name if 'portfolio_name' in locals() else "Portafoglio"
            return jsonify(assets=result, name=p_name)

        except Exception as e:
            logger.error(f"PORTFOLIO ASSETS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
