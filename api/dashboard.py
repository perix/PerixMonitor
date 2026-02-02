from flask import jsonify, request
# import yfinance as yf (Removed)
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from supabase_client import get_supabase_client
from finance import xirr
from price_manager import get_price_history, get_interpolated_price_history
from logger import logger
import traceback

def register_dashboard_routes(app):
    
    @app.route('/api/dashboard/summary', methods=['GET'])
    def get_dashboard_summary():
        t_start = datetime.now()
        logger.info(f"[DASHBOARD_SUMMARY] Started at {t_start}")
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            supabase = get_supabase_client()
            
            # 1. Fetch Transactions
            res_trans = supabase.table('transactions').select("*, assets(id, isin, name, asset_class, last_trend_variation)").eq('portfolio_id', portfolio_id).execute()
            transactions = res_trans.data
            
            # Filter by specific assets if requested
            assets_param = request.args.get('assets')
            if assets_param:
                selected_isins = set(assets_param.split(','))
                transactions = [t for t in transactions if t['assets']['isin'] in selected_isins]
            
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
                    holdings[isin] = {
                        "qty": 0, 
                        "cost": 0, 
                        "name": name, 
                        "asset_class": t['assets'].get('asset_class'),
                        "last_trend_variation": t['assets'].get('last_trend_variation')
                    }
                
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
                    
                    if current_price == 0:
                        # logger.warning(f"Price 0 for {isin}, Valued at 0")
                        current_price = 0
                    
                    # TODO: Fetch Sector from Assets table if needed
                        
                except Exception as e:
                    logger.error(f"Error fetching {isin}: {e}")
                    current_price = data['cost'] / data['qty'] if data['qty'] else 0
                
                market_val = data['qty'] * current_price
                current_total_value += market_val
                
                allocation_data.append({
                    "name": data['name'],
                    "value": market_val,
                    "sector": data.get('asset_class') or "Other",
                    "isin": isin,
                    "quantity": data['qty'],
                    "price": current_price,
                    "last_trend_variation": data.get('last_trend_variation')
                })

            # 4. XIRR Calculation (Tiered)
            mwr_t1 = int(request.args.get('mwr_t1', 30))
            mwr_t2 = int(request.args.get('mwr_t2', 365))

            # Need to pass current_total_value separately as the "final" value
            # cash_flows here contains only historical flows, not the final "fake sell"
            from finance import get_tiered_mwr
            
            mwr_value, mwr_type = get_tiered_mwr(cash_flows, current_total_value, t1=mwr_t1, t2=mwr_t2)

            # 5. Fetch Colors
            # Optimization: Fetch all colors for this portfolio in one go
            res_colors = supabase.table('portfolio_asset_settings').select('asset_id, color').eq('portfolio_id', portfolio_id).execute()
            color_map = {row['asset_id']: row['color'] for row in res_colors.data}

            # Attach colors to allocation data
            for item in allocation_data:
                # Find asset id from isin (we only have ISIN in active_holdings keys, but we can look up if needed)
                # But wait, allocation_data has ISIN. portfolio_asset_settings uses asset_id.
                # We need to map ISIN -> Asset ID.
                # We have 'holdings' but we didn't store asset_id there efficiently.
                # Let's rebuild a small map from transactions first or just fetch asset IDs.
                pass 
                
            # Better approach: We specifically need Asset IDs.
            # Let's get them from transactions (optimization: we requested assets(isin, ..) in step 1)
            # We can build a map isin -> asset_id from transactions
            isin_to_id = {}
            for t in transactions:
                 isin_to_id[t['assets']['isin']] = t['assets']['id']

            for item in allocation_data:
                aid = isin_to_id.get(item['isin'])
                if aid and aid in color_map:
                    item['color'] = color_map[aid]
                else:
                    item['color'] = '#888888' # Fallback for unassigned

            # 6. Summary Metrics (Restored)
            pl_value = current_total_value - total_invested
            pl_percent = (pl_value / total_invested * 100) if total_invested > 0 else 0

            t_end = datetime.now()
            logger.info(f"[DASHBOARD_SUMMARY] Completed in {(t_end - t_start).total_seconds():.2f}s")
            return jsonify({
                "total_value": round(current_total_value, 2),
                "total_invested": round(total_invested, 2),
                "pl_value": round(pl_value, 2),
                "pl_percent": round(pl_percent, 2),
                "xirr": mwr_value,
                "mwr_type": mwr_type, # Provide context to frontend
                "allocation": sorted(allocation_data, key=lambda x: x['value'], reverse=True)
            })

        except Exception as e:
            logger.error(f"DASHBOARD ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            with open("debug_error.log", "a") as f:
                f.write(f"SUMMARY ERROR: {datetime.now()}\n")
                f.write(traceback.format_exc())
                f.write("\n")
            return jsonify(error=str(e)), 500

    @app.route('/api/dashboard/history', methods=['GET'])
    def get_mwrr_history():
        t0 = datetime.now()
        logger.info(f"[DASHBOARD_HISTORY] Request received at {t0}")
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            supabase = get_supabase_client()
            
            # 1. Fetch all transactions with metadata
            res_trans = supabase.table('transactions').select("*, assets(id, isin, name, asset_class, metadata)").eq('portfolio_id', portfolio_id).order('date').execute()
            if not res_trans.data:
                return jsonify(history=[], assets=[])
                
            transactions = res_trans.data

            # Filter by specific assets if requested
            assets_param = request.args.get('assets')
            if assets_param:
                selected_isins = set(assets_param.split(','))
                transactions = [t for t in transactions if t['assets']['isin'] in selected_isins]
            
            if not transactions:
                return jsonify(history=[], assets=[], portfolio=[])

            t1 = datetime.now()
            logger.info(f"[DASHBOARD_HISTORY] Transactions fetched: {len(transactions)} (Time: {(t1 - t0).total_seconds():.2f}s)")
            
            # 2. Identify active assets and time range
            all_isins = set(t['assets']['isin'] for t in transactions)
            start_date_str = transactions[0]['date']
            start_date = datetime.fromisoformat(start_date_str).replace(tzinfo=None)
            end_date = datetime.now()
            
            # Helper to extract name - prioritize DB name (from Excel), then LLM metadata
            def get_asset_name(t_item):
                # Priority 1: DB name column (from Excel "Descrizione Titolo")
                db_name = t_item['assets'].get('name')
                isin = t_item['assets'].get('isin')
                if db_name and db_name != isin:
                    return db_name
                
                # Priority 2: LLM metadata
                meta = t_item['assets'].get('metadata')
                if meta and isinstance(meta, dict):
                    # Check profile.name
                    if 'profile' in meta and isinstance(meta['profile'], dict):
                        candidate = meta['profile'].get('name')
                        if candidate: return candidate

                    # Check general.name
                    if 'general' in meta and isinstance(meta['general'], dict):
                        candidate = meta['general'].get('name')
                        if candidate: return candidate
                        
                    # Check Yahoo/Other schemas (top level)
                    candidate = meta.get('longName') or meta.get('shortName') or meta.get('symbol') or meta.get('name')
                    if candidate: return candidate
                    
                return isin  # Fallback to ISIN

            # Generate check-points (Dynamic Granularity)
            days_diff = (end_date - start_date).days
            
            check_points = []
            current_cp = start_date
            
            if days_diff < 90:
                # Daily for short periods
                step = timedelta(days=1)
            elif days_diff < 365:
                 # Weekly for medium periods
                 step = timedelta(weeks=1)
            else:
                 # Monthly for long periods
                 # Approximate month step
                 step = timedelta(days=30) 

            # Start from the next interval to avoid double counting start date if we want
            # But ensuring we cover the range. 
            current_cp += step
            
            while current_cp < end_date:
                check_points.append(current_cp)
                current_cp += step

            # Always include today
            check_points.append(end_date)

            # 3. Calculate MWR History per Asset
            assets_history = []
            
            t2 = datetime.now()
            logger.info(f"[DASHBOARD_HISTORY] Checkpoints generated: {len(check_points)} (Start: {check_points[0]}, End: {check_points[-1]})")
            logger.info(f"[DASHBOARD_HISTORY] Processing {len(all_isins)} assets...")
            
            for isin in all_isins:
                # Find a transaction for this ISIN to get asset details
                sample_t = next((t for t in transactions if t['assets']['isin'] == isin), None)
                asset_name = get_asset_name(sample_t) if sample_t else isin
                
                # OPTIMIZATION: Use LOCF Interpolated history
                # This returns a dense dict { '2023-01-01': 100 }
                price_map = get_interpolated_price_history(isin, min_date=start_date, max_date=end_date)
                
                # Filter transactions for this asset
                asset_trans = [t for t in transactions if t['assets']['isin'] == isin]
                
                mwr_series = []
                current_cash_flows = []
                transaction_idx = 0
                current_qty = 0.0
                net_invested_for_pnl = 0.0
                
                # Track Average Cost for Price Fallback
                current_avg_cost = 0.0
                
                last_xirr_guess = 0.1 # Initial Guess
                
                for cp in check_points:
                    cp_str = cp.strftime('%Y-%m-%d')
                    
                    # 1. Add new cashflows up to cp (Cumulative)
                    while transaction_idx < len(asset_trans):
                        t = asset_trans[transaction_idx]
                        t_date = datetime.fromisoformat(t['date']).replace(tzinfo=None)
                        if t_date > cp:
                            break
                        
                        qty = float(t['quantity'])
                        price = float(t['price_eur'])
                        val = qty * price
                        is_buy = t['type'] == 'BUY'
                        
                        if is_buy:
                            # Update Average Cost (Weighted Average)
                            total_cost = (current_qty * current_avg_cost) + val
                            new_total_qty = current_qty + qty
                            if new_total_qty > 0:
                                current_avg_cost = total_cost / new_total_qty
                            
                            current_qty += qty
                            current_cash_flows.append({"date": t_date, "amount": -val})
                            net_invested_for_pnl += val
                        else:
                            # Sell doesn't change Average Cost per share, just reduces total cost basis
                            current_qty -= qty
                            current_cash_flows.append({"date": t_date, "amount": val})
                            net_invested_for_pnl -= val
                        
                        transaction_idx += 1
                            
                    # 2. Valuation at CP
                    if current_qty > 0.0001:
                        # Find price efficiently using map (O(1))
                        # The map is dense thanks to LOCF
                        price_at_cp = price_map.get(cp_str, 0)
                        
                        if price_at_cp == 0 and current_avg_cost > 0:
                             price_at_cp = 0
                        
                        if price_at_cp == 0: continue

                        # Add current value as inflow
                        current_val = current_qty * price_at_cp
                        
                        # Calculate Metrics
                        pnl_at_cp = current_val - net_invested_for_pnl
                        
                        # Prepare flow for XIRR
                        calc_flows = current_cash_flows + [{"date": cp, "amount": current_val}]
                        
                        # Duration
                        first_d = current_cash_flows[0]['date'] if current_cash_flows else cp
                        dur_days = (cp - first_d).days
                        
                        mwr_t1 = int(request.args.get('mwr_t1', 30))
                        mwr_t2 = int(request.args.get('mwr_t2', 365))

                        try:
                            val = xirr(calc_flows, guess=last_xirr_guess)
                            if val is not None:
                                last_xirr_guess = val # Update guess for next step
                                
                                # Apply Tiered
                                final_val = val
                                if dur_days < mwr_t1:
                                     net_in = sum(-f['amount'] for f in current_cash_flows)
                                     if net_in > 0:
                                         final_val = (current_val - net_in) / net_in
                                     else:
                                         final_val = 0
                                elif dur_days < mwr_t2:
                                    from finance import deannualize_xirr
                                    final_val = deannualize_xirr(val, dur_days)

                                mwr_series.append({
                                    "date": cp_str,
                                    "value": round(final_val * 100, 2),
                                    "pnl": round(pnl_at_cp, 2),
                                    "market_value": round(current_val, 2)
                                })
                        except:
                            pass

                if mwr_series:
                    # Get Asset ID for color looking
                    sample_t = next((t for t in transactions if t['assets']['isin'] == isin), None)
                    asset_id = sample_t['assets']['id'] if sample_t else None
                    
                    # Fetch color (simple single lookup per asset is fine)
                    color = "#888888"
                    if asset_id:
                         try:
                             res_c = supabase.table('portfolio_asset_settings').select('color').eq('portfolio_id', portfolio_id).eq('asset_id', asset_id).execute()
                             if res_c.data:
                                 color = res_c.data[0]['color']
                         except: pass

                    # Extract Asset Type
                    asset_type = sample_t['assets'].get('asset_class') or "Altro"
                    if (not asset_type or asset_type == "Altro") and sample_t['assets'].get('metadata'):
                        meta = sample_t['assets']['metadata']
                        if isinstance(meta, dict):
                            asset_type = meta.get('assetType', "Altro")

                    assets_history.append({
                        "isin": isin,
                        "name": asset_name,
                        "color": color,
                        "type": asset_type,
                        "data": mwr_series
                    })

            # 4. Calculate Portfolio MWR History (Weighted)
            portfolio_series = []
            
            # Pre-build Global Price Map
            global_price_map = {} 
            for isin in all_isins:
                 # Interpolated map for all assets
                 global_price_map[isin] = get_interpolated_price_history(isin, min_date=start_date, max_date=end_date)
            
            # No need for sorted dates anymore, we have map lookup

            # Portfolio Loops
            current_port_cash_flows = []
            transaction_idx_p = 0
            
            # Map ISIN -> {qty, avg_cost}
            current_port_holdings_map = {} 
            
            last_port_xirr = 0.1

            for cp in check_points:
                cp_str = cp.strftime('%Y-%m-%d')
                
                # 1. Update Cashflows & Holdings
                while transaction_idx_p < len(transactions): # transactions is already sorted by date
                    t = transactions[transaction_idx_p]
                    t_date = datetime.fromisoformat(t['date']).replace(tzinfo=None)
                    if t_date > cp:
                        break
                    
                    isin = t['assets']['isin']
                    qty = float(t['quantity'])
                    price = float(t['price_eur'])
                    val = qty * price
                    is_buy = t['type'] == 'BUY'
                    
                    if isin not in current_port_holdings_map: 
                        current_port_holdings_map[isin] = {"qty": 0.0, "avg_cost": 0.0}
                    
                    curr_h = current_port_holdings_map[isin]
                    
                    if is_buy:
                        # Update Avg Cost
                        total_cost_h = (curr_h['qty'] * curr_h['avg_cost']) + val
                        new_qty_h = curr_h['qty'] + qty
                        if new_qty_h > 0:
                            curr_h['avg_cost'] = total_cost_h / new_qty_h
                        
                        curr_h['qty'] += qty
                        current_port_cash_flows.append({"date": t_date, "amount": -val})
                    else:
                        curr_h['qty'] -= qty
                        current_port_cash_flows.append({"date": t_date, "amount": val})
                    
                    transaction_idx_p += 1

                # 2. Calculate Portfolio Current Value
                port_value_at_cp = 0
                for isin, data in current_port_holdings_map.items():
                    qty = data['qty']
                    if qty <= 0.0001: continue
                    
                    # Efficient O(1) Lookup
                    price = global_price_map.get(isin, {}).get(cp_str, 0)
                    
                    # FALLBACK Replaced: Use 0 if price is missing
                    if price == 0 and data['avg_cost'] > 0:
                         price = 0

                    port_value_at_cp += (qty * price)
                
                if port_value_at_cp > 0:
                     calc_flows = current_port_cash_flows + [{"date": cp, "amount": port_value_at_cp}]
                     
                     # Calculate duration at this checkpoint
                     start_d = current_port_cash_flows[0]['date'] if current_port_cash_flows else cp
                     dur_days = (cp - start_d).days
                     
                     mwr_t1 = int(request.args.get('mwr_t1', 30))
                     mwr_t2 = int(request.args.get('mwr_t2', 365))

                     try:
                         # Calculate Annualized XIRR first
                         val = xirr(calc_flows, guess=last_port_xirr)
                         
                         if val is not None:
                             last_port_xirr = val
                             
                             # Apply Tiered logic
                             final_mwr = val
                             
                             if dur_days < mwr_t1:
                                 # Simple Return approximation for chart consistency
                                 # (Value - NetIn) / NetIn
                                 net_in = sum(-f['amount'] for f in current_port_cash_flows)
                                 if net_in > 0:
                                     final_mwr = (port_value_at_cp - net_in) / net_in
                                 else:
                                     final_mwr = 0
                             elif dur_days < mwr_t2:
                                 # Period Return
                                 from finance import deannualize_xirr
                                 final_mwr = deannualize_xirr(val, dur_days)
                             
                             portfolio_series.append({
                                 "date": cp_str,
                                 "value": round(final_mwr * 100, 2),
                                 "market_value": round(port_value_at_cp, 2)
                             })
                     except: pass
            
            t_final = datetime.now()
            logger.info(f"[DASHBOARD_HISTORY] Completed in {(t_final - t0).total_seconds():.2f}s")
            
            return jsonify({
                "series": assets_history,
                "portfolio": portfolio_series
            })

        except Exception as e:
            logger.error(f"DASHBOARD HISTORY ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            with open("debug_error.log", "a") as f:
                f.write(f"HISTORY ERROR: {datetime.now()}\n")
                f.write(traceback.format_exc())
                f.write("\n")
            return jsonify(error=str(e)), 500
