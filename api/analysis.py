from flask import jsonify, request
import pandas as pd
from datetime import datetime
from supabase_client import get_supabase_client
from finance import xirr
from price_manager import get_latest_price
from asset_classification import get_component_from_asset_type
from logger import logger
import traceback

def register_analysis_routes(app):
    
    @app.route('/api/analysis/allocation', methods=['GET'])
    def get_analysis_allocation():
        t_start = datetime.now()
        logger.info(f"[ANALYSIS_ALLOCATION] Started at {t_start}")
        
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            supabase = get_supabase_client()
            
            # 1. Fetch Transactions
            res_trans = supabase.table('transactions').select("*, assets(id, isin, name, asset_class, last_trend_variation)").eq('portfolio_id', portfolio_id).execute()
            transactions = res_trans.data
            
            if not transactions:
                return jsonify({
                    "components": [],
                    "total_value": 0
                })

            # 2. Group by Component
            # Data structure: component -> metrics
            components_data = {} 
            # Format: { 
            #   "Azionaria": { 
            #       "cash_flows": [], 
            #       "current_value": 0, 
            #       "invested_capital": 0 
            #   }, ... 
            # }

            # Track global price cache to avoid re-fetching same ISIN multiple times
            price_cache = {} 
            
            # Helper to get price
            def fetch_price(isin):
                if isin in price_cache: return price_cache[isin]
                p_data = get_latest_price(isin)
                price = float(p_data['price']) if p_data else 0
                price_cache[isin] = price
                return price

            # Process transactions to build component 'positions' and history
            # We need to calculate:
            # - Current Market Value of Component (Sum of assets value)
            # - Net Invested (Sum of flows)
            # - Cash Flows for XIRR (Date, Amount)

            # Pre-calculate holdings per ISIN first to efficiently get value
            holdings = {} # isin -> {qty, component, current_val, invested}
            
            for t in transactions:
                isin = t['assets']['isin']
                asset_type = t['assets'].get('asset_class')
                component = get_component_from_asset_type(asset_type)
                
                qty = t['quantity']
                price = t['price_eur'] # transaction price
                date_str = t['date']
                t_date = datetime.fromisoformat(date_str).replace(tzinfo=None)
                is_buy = t['type'] == 'BUY'
                
                # Init component bucket
                if component not in components_data:
                    components_data[component] = {
                        "cash_flows": [],
                        "current_value": 0,
                        "invested_capital": 0,
                        "assets_list": []
                    }
                
                # Update holding state (just for calculating final value)
                if isin not in holdings:
                    holdings[isin] = {"qty": 0, "invested": 0.0}

                # Update Cash Flows
                flow_amount = 0
                if is_buy:
                    holdings[isin]["qty"] += qty
                    holdings[isin]["invested"] += (qty * price)
                    flow_amount = -(qty * price) # Outflow
                    components_data[component]["invested_capital"] += (qty * price)
                else:
                    holdings[isin]["qty"] -= qty
                    holdings[isin]["invested"] -= (qty * price)
                    flow_amount = (qty * price) # Inflow
                    components_data[component]["invested_capital"] -= (qty * price)
                
                components_data[component]["cash_flows"].append({
                    "date": t_date,
                    "amount": flow_amount
                })

            # 3. Calculate Current Value per Component
            total_portfolio_value = 0
            
            for isin, data in holdings.items():
                qty = data["qty"]
                if abs(qty) < 0.0001: continue
                
                sample_t = next((x for x in transactions if x['assets']['isin'] == isin), None)
                asset_type = sample_t['assets'].get('asset_class') if sample_t else "Altro"
                component = get_component_from_asset_type(asset_type)
                
                curr_price = fetch_price(isin)
                
                # FALLBACK Replaced by Strict Pricing (0 if unknown)
                if curr_price == 0 and data["invested"] > 0:
                    curr_price = 0
                
                mkt_value = qty * curr_price
                
                if component not in components_data:
                    components_data[component] = {
                        "cash_flows": [],
                        "current_value": 0,
                        "invested_capital": 0,
                        "assets_list": []
                    }
                
                components_data[component]["current_value"] += mkt_value
                total_portfolio_value += mkt_value

                # Add asset info to component list
                components_data[component]["assets_list"].append({
                    "name": sample_t['assets']['name'] if sample_t else isin,
                    "isin": isin,
                    "value": mkt_value,
                    "last_trend_variation": sample_t['assets'].get('last_trend_variation') if sample_t else None
                })

            # 4. Fetch Manual Liquidity from Portfolio Settings
            manual_liquidity = 0
            try:
                res_p = supabase.table('portfolios').select('settings').eq('id', portfolio_id).single().execute()
                if res_p.data and res_p.data.get('settings'):
                    manual_liquidity = float(res_p.data['settings'].get('liquidity', 0))
            except Exception as e:
                logger.warning(f"Failed to fetch manual liquidity: {e}")

            if manual_liquidity > 0:
                if "Liquidità" not in components_data:
                    components_data["Liquidità"] = {
                        "cash_flows": [], 
                        "current_value": 0, 
                        "invested_capital": 0,
                        "assets_list": []
                    }
                components_data["Liquidità"]["current_value"] += manual_liquidity
                components_data["Liquidità"]["invested_capital"] += manual_liquidity
                total_portfolio_value += manual_liquidity
                
                # Add pseudo-asset for manual liquidity
                components_data["Liquidità"]["assets_list"].append({
                    "name": "Liquidità Manuale",
                    "isin": "MANUAL_CASH",
                    "value": manual_liquidity
                })

            # 5. Finalize Metrics (XIRR, P&L)
            result_list = []
            
            # Get MWR params
            mwr_t1 = int(request.args.get('mwr_t1', 30))
            mwr_t2 = int(request.args.get('mwr_t2', 365))
            from finance import get_tiered_mwr
            
            for comp_name, data in components_data.items():
                curr_val = data["current_value"]
                invested = data["invested_capital"]
                cfs = data["cash_flows"]
                assets = data["assets_list"]
                
                if curr_val <= 0 and invested <= 0:
                    continue

                # Calculate Tiered MWR
                mwr_val, mwr_type = get_tiered_mwr(cfs, curr_val, t1=mwr_t1, t2=mwr_t2)
                
                pl_val = curr_val - invested
                pl_pct = (pl_val / invested * 100) if invested > 0 else 0
                
                # Percentage of portfolio (Value)
                alloc_pct = (curr_val / total_portfolio_value * 100) if total_portfolio_value > 0 else 0
                
                # Process assets list: calculate % of component and sort
                final_assets = []
                for a in assets:
                    asset_pct = (a['value'] / curr_val * 100) if curr_val > 0 else 0
                    final_assets.append({
                        "name": a['name'],
                        "isin": a['isin'],
                        "value": round(a['value'], 2),
                        "percent_of_component": round(asset_pct, 2),
                        "last_trend_variation": a.get('last_trend_variation')
                    })
                final_assets.sort(key=lambda x: x['value'], reverse=True)

                result_list.append({
                    "name": comp_name,
                    "value": round(curr_val, 2),
                    "percentage": round(alloc_pct, 2),
                    "invested": round(invested, 2),
                    "pl_value": round(pl_val, 2),
                    "pl_percent": round(pl_pct, 2),
                    "mwr": mwr_val,
                    "mwr_type": mwr_type,
                    "assets": final_assets
                })

            # Sort by Value Descending
            result_list.sort(key=lambda x: x['value'], reverse=True)
            
            return jsonify({
                "total_portfolio_value": round(total_portfolio_value, 2),
                "components": result_list
            })

        except Exception as e:
            logger.error(f"ANALYSIS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
