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

    @app.route('/api/portfolio/<portfolio_id>/settings', methods=['PATCH'])
    def update_portfolio_settings(portfolio_id):
        """
        Updates the settings JSONB column for a portfolio.
        """
        try:
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
                "quantity, type, price_eur, date, assets(id, isin, name, ticker, asset_class, country, sector, rating, issuer, currency, metadata)"
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
                    if price_data:
                        latest_price = float(price_data['price'])
                        asset_info['latest_price'] = latest_price
                        asset_info['price_date'] = price_data['date']
                        asset_info['price_source'] = price_data['source']
                    else:
                        latest_price = 0
                        asset_info['latest_price'] = None
                        asset_info['price_date'] = None
                        asset_info['price_source'] = None
                    
                    asset_info['current_qty'] = current_qty
                    
                    # Calculate current value
                    current_value = current_qty * latest_price if latest_price else 0
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
                    if current_value > 0 and data['cashflows']:
                        # Add current value as final inflow
                        cashflows = data['cashflows'].copy()
                        cashflows.append({
                            "date": datetime.now(),
                            "amount": current_value
                        })
                        try:
                            xirr_result = xirr(cashflows)
                            if xirr_result is not None:
                                mwr = round(xirr_result * 100, 2)  # As percentage
                        except:
                            pass
                    asset_info['mwr'] = mwr
                    
                    result.append(asset_info)
            
            # Sort by name
            result.sort(key=lambda x: x.get('name', x.get('isin', '')))
            
            return jsonify(assets=result)

        except Exception as e:
            logger.error(f"PORTFOLIO ASSETS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
