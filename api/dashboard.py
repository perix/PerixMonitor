from flask import jsonify, request
# import yfinance as yf (Removed)
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from supabase_client import get_supabase_client
from finance import xirr
from price_manager import get_price_history
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

            # 3. Fetch Current Prices (Directly from DB)
            from price_manager import get_latest_price
            
            # Filter holdings with > 0 qty
            active_holdings = {k: v for k, v in holdings.items() if abs(v['qty']) > 0.0001}
            
            current_total_value = 0
            allocation_data = []
            
            for isin, data in active_holdings.items():
                current_price = 0
                sector = "Other"
                
                try:
                    price_data = get_latest_price(isin)
                    if price_data:
                        current_price = float(price_data['price'])
                    
                    # Fallback to cost if price is 0 (fetch failed)
                    if current_price == 0:
                         # logger.warning(f"Price 0 for {isin}, using Cost Basis")
                         current_price = data['cost'] / data['qty'] if data['qty'] else 0
                    
                    # TODO: Fetch Sector from Assets table if needed
                        
                except Exception as e:
                    logger.error(f"Error fetching {isin}: {e}")
                    current_price = data['cost'] / data['qty'] if data['qty'] else 0
                
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

    @app.route('/api/dashboard/history', methods=['GET'])
    def get_mwrr_history():
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            supabase = get_supabase_client()
            
            # 1. Fetch all transactions
            res_trans = supabase.table('transactions').select("*, assets(isin, name)").eq('portfolio_id', portfolio_id).order('date').execute()
            if not res_trans.data:
                return jsonify(history=[], assets=[])
                
            transactions = res_trans.data
            
            # 2. Identify active assets and time range
            all_isins = set(t['assets']['isin'] for t in transactions)
            start_date_str = transactions[0]['date']
            start_date = datetime.fromisoformat(start_date_str).replace(tzinfo=None)
            end_date = datetime.now()
            
            # Generate monthly check-points
            check_points = []
            curr = start_date.replace(day=1) + timedelta(days=32)
            curr = curr.replace(day=1) # Start of next month
            
            while curr < end_date:
                check_points.append(curr)
                curr = (curr.replace(day=1) + timedelta(days=32)).replace(day=1)
            
            # Always include today
            check_points.append(end_date)
            
            # 3. Calculate MWR History per Asset
            assets_history = []
            
            for isin in all_isins:
                asset_name = next((t['assets']['name'] for t in transactions if t['assets']['isin'] == isin), isin)
                
                # Fetch price history for this asset
                price_hist = get_price_history(isin) 
                # price_hist is [{'date': 'YYYY-MM-DD', 'price': 123.4}, ...] sorted asc
                
                # Convert to lookup dict for speed (date -> price)
                # We will need closest price search
                price_map = {p['date']: p['price'] for p in price_hist}
                sorted_price_dates = sorted(price_map.keys())
                
                asset_trans = [t for t in transactions if t['assets']['isin'] == isin]
                
                mwr_series = []
                
                for cp in check_points:
                    cp_str = cp.strftime('%Y-%m-%d')
                    
                    # 1. Cashflows up to cp
                    cash_flows = []
                    current_qty = 0
                    
                    for t in asset_trans:
                        t_date = datetime.fromisoformat(t['date']).replace(tzinfo=None)
                        if t_date > cp:
                            break
                            
                        qty = t['quantity']
                        price = t['price_eur']
                        is_buy = t['type'] == 'BUY'
                        
                        if is_buy:
                            current_qty += qty
                            cash_flows.append({"date": t_date, "amount": -(qty * price)})
                        else:
                            current_qty -= qty
                            cash_flows.append({"date": t_date, "amount": (qty * price)})
                            
                    if current_qty > 0.0001:
                        # Find price at cp
                        # Simple exact match or nearest previous
                        price_at_cp = 0
                        
                        # Find nearest date <= cp_str in sorted_price_dates
                        # (Linear scan is fine for small history, binary search better but ok here)
                        best_date = None
                        for d in sorted_price_dates:
                            if d <= cp_str:
                                best_date = d
                            else:
                                break
                        
                        if best_date:
                            price_at_cp = price_map[best_date]
                        else:
                            # If no price history before CP, use last transaction price??
                            # Or skip
                            continue

                        # Add current value as inflow
                        current_val = current_qty * price_at_cp
                        cash_flows.append({"date": cp, "amount": current_val})
                        
                        try:
                            val = xirr(cash_flows)
                            if val is not None:
                                mwr_series.append({
                                    "date": cp_str,
                                    "value": round(val * 100, 2)
                                })
                        except:
                            pass
                            
                if mwr_series:
                    assets_history.append({
                        "isin": isin,
                        "name": asset_name,
                        "data": mwr_series
                    })

            # 4. Calculate Portfolio MWR History (Weighted)
            # Actually easier to re-run xirr on aggregated cashflows
            portfolio_series = []
            
            for cp in check_points:
                cp_str = cp.strftime('%Y-%m-%d')
                
                # 1. All cashflows up to cp
                # 2. Total Portfolio Value at cp
                
                cash_flows = []
                # Re-calculate holdings at cp
                holdings_at_cp = {} # isin -> qty
                
                for t in transactions:
                    t_date = datetime.fromisoformat(t['date']).replace(tzinfo=None)
                    if t_date > cp:
                        break
                    
                    asset_isin = t['assets']['isin']
                    qty = t['quantity']
                    price = t['price_eur']
                    is_buy = t['type'] == 'BUY'
                    
                    holdings_at_cp[asset_isin] = holdings_at_cp.get(asset_isin, 0) + (qty if is_buy else -qty)
                    
                    # Cashflow is strictly external money in/out?
                    # No, strict portfolio MWR is based on external flows.
                    # Buying an asset with cash from portfolio is internal.
                    # BUT our transactions table usually tracks "Asset Buy/Sell".
                    # We assume "Cash" is not tracked as an asset with value. 
                    # So Buys are Inflows (from wallet), Sells are Outflows (to wallet).
                    if is_buy:
                         cash_flows.append({"date": t_date, "amount": -(qty * price)})
                    else:
                         cash_flows.append({"date": t_date, "amount": (qty * price)})

                # Calculate Current Value of Portfolio at CP
                total_val_at_cp = 0
                for isin, qty in holdings_at_cp.items():
                    if qty < 0.0001: continue
                    
                    # Fetch price
                    # (Optimized: we could have pre-fetched all prices)
                    # Use get_price_history logic or reuse maps
                    # TODO: optimize. For now, we rely on individual asset logic or fetch here.
                    # Re-fetching each time is slow.
                    # Let's use the price_hist derived above if possible.
                    # Constraint: We didn't save price_hist for all assets in a global map properly above.
                    # Optimization: create global price map {isin: {date: price}} earlier
                    pass 
                
                # ... To keep it simple given complexity limits ...
                # We will approximate Portfolio MWR by just aggregating the individual asset values if feasible,
                # OR we implement valid portfolio-level fetching.
                
                # Let's use a simpler approach for visual Graph:
                # Just return the Assets MWR Series.
                # And Compute one "Total" series which is slightly harder.
                # I will Skip Total MWR calculation loop here to avoid timeout/complexity 
                # and assume I can add it later or client aggregates it? 
                # No, XIRR doesn't aggregate linearly.
                
                # Let's try to do it right for Portfolio:
                # We need Total Value at CP.
                # Total Value = Sum(Qty * Price) for all assets
                pass

            # REDOING PORTFOLIO LOOP EFFICIENTLY
            # 1. Build Global Price Map
            global_price_map = {} # isin -> {date_str: price}
            for isin in all_isins:
                 ph = get_price_history(isin)
                 global_price_map[isin] = {p['date']: p['price'] for p in ph}
                 
            sorted_global_dates = {isin: sorted(global_price_map[isin].keys()) for isin in all_isins}

            # 2. Loop checkpoints for portfolio
            for cp in check_points:
                cp_str = cp.strftime('%Y-%m-%d')
                cash_flows = []
                holdings_at_cp = {}
                
                # Cashflows
                for t in transactions:
                    t_date = datetime.fromisoformat(t['date']).replace(tzinfo=None)
                    if t_date > cp:
                        break # sorted by date
                    
                    isin = t['assets']['isin']
                    qty = t['quantity']
                    price = t['price_eur']
                    is_buy = t['type'] == 'BUY'
                    
                    if isin not in holdings_at_cp: holdings_at_cp[isin] = 0
                    holdings_at_cp[isin] += (qty if is_buy else -qty)
                    
                    cash_flows.append({"date": t_date, "amount": -(qty*price) if is_buy else (qty*price)})

                # Current Value
                port_value_at_cp = 0
                for isin, qty in holdings_at_cp.items():
                    if qty <= 0.0001: continue
                    
                    # Find price
                    prices = global_price_map.get(isin, {})
                    dates = sorted_global_dates.get(isin, [])
                    
                    best_date = None
                    # Optimization: bisect or simple walk. Simple walk is fast enough for <1000 dates
                    for d in reversed(dates): # search backwards from latest
                        if d <= cp_str:
                            best_date = d
                            break
                    
                    price = prices.get(best_date, 0) if best_date else 0
                    # Fallback ?? current cost logic? skip for now
                    port_value_at_cp += (qty * price)
                
                if port_value_at_cp > 0:
                     cash_flows.append({"date": cp, "amount": port_value_at_cp})
                     try:
                         val = xirr(cash_flows)
                         if val is not None:
                             portfolio_series.append({
                                 "date": cp_str,
                                 "value": round(val * 100, 2)
                             })
                     except: pass
            
            return jsonify({
                "series": assets_history,
                "portfolio": portfolio_series
            })

        except Exception as e:
            logger.error(f"DASHBOARD HISTORY ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
