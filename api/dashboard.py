from flask import jsonify, request
# import yfinance as yf (Removed)
import pandas as pd
from datetime import datetime, timedelta
from supabase_client import get_supabase_client
from finance import xirr
from logger import logger
import traceback

def register_dashboard_routes(app):
    
    @app.route('/api/dashboard/summary', methods=['GET'])
    def get_dashboard_summary():
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            supabase = get_supabase_client()
            
            # 1. Fetch Transactions
            res_trans = supabase.table('transactions').select("*, assets(isin, name)").eq('portfolio_id', portfolio_id).execute()
            transactions = res_trans.data
            
            if not transactions:
                return jsonify({
                    "total_value": 0,
                    "total_invested": 0,
                    "pl_value": 0,
                    "pl_percent": 0,
                    "xirr": 0,
                    "allocation": []
                })

            # 2. Calculate Current Holdings
            holdings = {} # isin -> {qty, cost, asset_name}
            cash_flows = [] # For XIRR: [(date, amount)]
            
            total_invested = 0
            
            for t in transactions:
                isin = t['assets']['isin']
                name = t['assets']['name']
                qty = t['quantity']
                price = t['price_eur']
                date_str = t['date']
                is_buy = t['type'] == 'BUY'
                
                # Update Holdings
                if isin not in holdings:
                    holdings[isin] = {"qty": 0, "cost": 0, "name": name}
                
                if is_buy:
                    holdings[isin]["qty"] += qty
                    holdings[isin]["cost"] += (qty * price)
                    
                    # Cash Flow: Outflow (Negative)
                    cash_flows.append({
                        "date": datetime.fromisoformat(date_str).replace(tzinfo=None),
                        "amount": -(qty * price)
                    })
                    total_invested += (qty * price)
                else:
                    holdings[isin]["qty"] -= qty
                    # Cost basis adjustment is complex (FIFO/LIFO), simple average cost approach:
                    # Reducing cost proportional to qty sold isn't quite right for P&L tracking 
                    # but for "Invested Capital" usually we subtract the cost of sold items.
                    # Let's keep it simple: Invested is net cash flow.
                    
                    # Cash Flow: Inflow (Positive)
                    cash_flows.append({
                        "date": datetime.fromisoformat(date_str).replace(tzinfo=None),
                        "amount": (qty * price)
                    })
                    
                    # For total_invested metric specifically (Net Invested Capital):
                    total_invested -= (qty * price)

            # 3. Fetch Current Prices (OpenBB Provider)
            # Filter holdings with > 0 qty
            active_holdings = {k: v for k, v in holdings.items() if v['qty'] > 0.0001}
            
            current_total_value = 0
            allocation_data = []
            
            from asset_provider import AssetProvider
            provider = AssetProvider()

            for isin, data in active_holdings.items():
                current_price = 0
                sector = "Other"
                
                try:
                    # Fetch basic info via provider
                    # Ideally we batch this or cache it, but for now loop is fine for small portfolios
                    # We just need price for summary, full info is for detail view
                    # Optimization: Maybe provider has a light 'get_price' method? 
                    # We will reuse get_asset_info for now or fallback to direct logic if provider is heavy.
                    # Let's assume get_asset_info is cached or fast enough.
                    
                    info = provider.get_asset_info(isin).get('asset_info', {})
                    price_info = info.get('ultimo_prezzo_chiusura', {})
                    current_price = price_info.get('prezzo', 0)
                    
                    # Fallback to cost if price is 0 (fetch failed)
                    if current_price == 0:
                         logger.warning(f"Price 0 for {isin}, using Cost Basis")
                         current_price = data['cost'] / data['qty'] if data['qty'] else 0
                    
                    # Try to get sector from 'sottostanti' or 'anagrafica'
                    # The provider puts sector in 'sottostanti' placeholder currently
                    subs = info.get('anagrafica', {}).get('sottostanti', [])
                    if subs:
                        sector = subs[0] 
                        
                except Exception as e:
                    logger.error(f"Error fetching {isin}: {e}")
                    current_price = data['cost'] / data['qty'] if data['qty'] else 0
                
                market_val = data['qty'] * current_price
                
                market_val = data['qty'] * current_price
                current_total_value += market_val
                
                allocation_data.append({
                    "name": data['name'],
                    "value": market_val,
                    "sector": sector,
                    "isin": isin,
                    "quantity": data['qty'],
                    "price": current_price
                })

            # 4. XIRR Calculation
            # Add current value as a "fake sell" today
            if current_total_value > 0:
                cash_flows.append({
                    "date": datetime.now(),
                    "amount": current_total_value
                })
            
            computed_xirr = xirr(cash_flows)
            if computed_xirr is None:
                computed_xirr = 0

            # 5. Summary Metrics
            pl_value = current_total_value - total_invested
            pl_percent = (pl_value / total_invested * 100) if total_invested > 0 else 0

            return jsonify({
                "total_value": round(current_total_value, 2),
                "total_invested": round(total_invested, 2),
                "pl_value": round(pl_value, 2),
                "pl_percent": round(pl_percent, 2),
                "xirr": round(computed_xirr * 100, 2), # Percentage
                "allocation": sorted(allocation_data, key=lambda x: x['value'], reverse=True)
            })

        except Exception as e:
            logger.error(f"DASHBOARD ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
