from flask import jsonify, request
# import yfinance as yf (Removed)
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from db_helper import execute_request
from finance import xirr
from price_manager import get_price_history, get_interpolated_price_history, get_latest_prices_batch, get_interpolated_price_history_batch
from logger import logger
import traceback

def register_dashboard_routes(app):
    
    @app.route('/api/dashboard/summary', methods=['GET'])
    def get_dashboard_summary():
        t_start = datetime.now()
        logger.info(f"[DASHBOARD_SUMMARY] Iniziato alle {t_start}")
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            # supabase = get_supabase_client() -> Removed
            
            # 1. Recupera Transazioni
            # res_trans = supabase.table('transactions').select("*, assets(id, isin, name, asset_class, last_trend_variation)").eq('portfolio_id', portfolio_id).execute()
            res_trans = execute_request('transactions', 'GET', params={
                'select': '*,assets(id,isin,name,asset_class,last_trend_variation)',
                'portfolio_id': f'eq.{portfolio_id}'
            })
            transactions = res_trans.json() if (res_trans and res_trans.status_code == 200) else []
            
            # Filtra per asset specifici se richiesto
            assets_param = request.args.get('assets')
            if assets_param is not None:
                if assets_param == "":
                     selected_isins = set()
                else: 
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

            # 2. Calcola Posizioni (Holdings) Correnti
            holdings = {} # isin -> {qty, cost, asset_name}
            cash_flows = [] # Per XIRR: [(date, amount)]
            
            total_invested = 0
            
            for t in transactions:
                isin = t['assets']['isin']
                name = t['assets']['name']
                qty = t['quantity']
                price = t['price_eur']
                date_str = t['date']
                is_buy = t['type'] == 'BUY'
                
                # Aggiorna Holdings
                if isin not in holdings:
                    holdings[isin] = {
                        "qty": 0, 
                        "cost": 0, 
                        "name": name, 
                        "asset_class": t['assets'].get('asset_class'),
                        "last_trend_variation": t['assets'].get('last_trend_variation'),
                        "isin": isin,
                        "id": t['assets']['id'] # ID asset per colori
                    }
                
                if is_buy:
                    holdings[isin]["qty"] += qty
                    holdings[isin]["cost"] += (qty * price)
                    
                    # Cash Flow: Uscita (Negativo)
                    try:
                        clean_date = date_str.replace('Z', '+00:00')
                        cf_date = datetime.fromisoformat(clean_date).replace(tzinfo=None)
                    except:
                        cf_date = datetime.now()

                    cash_flows.append({
                        "date": cf_date,
                        "amount": -(qty * price)
                    })
                    total_invested += (qty * price)
                else:
                    holdings[isin]["qty"] -= qty
                    # Il costo viene ridotto proporzionalmente o FIFO?
                    # Semplificazione: Invested è net cash flow qui.
                    
                    # Cash Flow: Entrata (Positivo)
                    try:
                        clean_date = date_str.replace('Z', '+00:00')
                        cf_date = datetime.fromisoformat(clean_date).replace(tzinfo=None)
                    except:
                        cf_date = datetime.now()

                    cash_flows.append({
                        "date": cf_date,
                        "amount": (qty * price)
                    })
                    
                    # Per total_invested (Capitale Netto Investito):
                    total_invested -= (qty * price)

            # --- 2b. Recupera Dividendi/Spese ---
            res_div = execute_request('dividends', 'GET', params={
                'portfolio_id': f'eq.{portfolio_id}'
            })
            dividends = res_div.json() if (res_div and res_div.status_code == 200) else []
            
            total_dividends = 0
            for d in dividends:
                amount = float(d['amount_eur'])
                date_str = d['date']
                total_dividends += amount
                
                # Includi nei flussi di cassa per XIRR
                try:
                    clean_div_date = date_str.replace('Z', '+00:00')
                    div_date = datetime.fromisoformat(clean_div_date).replace(tzinfo=None)
                except:
                    div_date = datetime.now()

                cash_flows.append({
                    "date": div_date,
                    "amount": amount
                })

            # 3. Recupera Prezzi Correnti (OTTIMIZZATO: BATCH)
            # Filtra holdings con quantità > 0 (o negative se short)
            active_holdings = {k: v for k, v in holdings.items() if abs(v['qty']) > 0.0001}
            
            active_isins = list(active_holdings.keys())
            
            # Batch Fetch
            latest_prices_map = get_latest_prices_batch(active_isins)
            
            current_total_value = 0
            allocation_data = []
            
            for isin, data in active_holdings.items():
                current_price = 0
                sector = "Other"
                
                try:
                    price_data = latest_prices_map.get(isin)
                    if price_data:
                        current_price = float(price_data['price'])
                    
                    if current_price == 0:
                        # Fallback su costo medio se prezzo zero
                        # logger.warning(f"Prezzo 0 per {isin}, Valutato a 0 o costo")
                        current_price = 0
                    
                except Exception as e:
                    logger.error(f"Errore prezzo per {isin}: {e}")
                    current_price = data['cost'] / data['qty'] if data['qty'] else 0
                
                market_val = data['qty'] * current_price
                current_total_value += market_val
                
                allocation_data.append({
                    "name": data['name'],
                    "value": market_val,
                    "sector": data.get('asset_class') or "Other",
                    "type": data.get('asset_class') or "Other",
                    "isin": isin,
                    "quantity": data['qty'],
                    "price": current_price,
                    "last_trend_variation": data.get('last_trend_variation'),
                    "asset_id": data.get('id')
                })

            # 4. Calcolo XIRR (Tiered)
            mwr_t1 = int(request.args.get('mwr_t1', 30))
            mwr_t2 = int(request.args.get('mwr_t2', 365))

            from finance import get_tiered_mwr
            
            # Calculate max date from available data to avoid dilution
            max_date = datetime.now()
            mwr_dates = []
            if cash_flows:
                mwr_dates.extend([f['date'] for f in cash_flows])
            if latest_prices_map:
                for p in latest_prices_map.values():
                    if p.get('date'):
                        mwr_dates.append(datetime.strptime(p['date'], '%Y-%m-%d'))
            
            if mwr_dates:
                max_date = max(mwr_dates)
                logger.info(f"[DASHBOARD_SUMMARY] Using max_date={max_date.strftime('%Y-%m-%d')} for MWR calculation (dilution prevention)")

            xirr_mode = request.args.get('xirr_mode', 'standard')
            mwr_value, mwr_type = get_tiered_mwr(cash_flows, current_total_value, t1=mwr_t1, t2=mwr_t2, end_date=max_date, xirr_mode=xirr_mode)

            # 5. Recupera Colori (Batch)
            # Recuperiamo settings colori per gli asset attivi
            asset_ids = [item['asset_id'] for item in allocation_data if item.get('asset_id')]
            
            color_map = {}
            if asset_ids:
                 # res_colors = supabase.table('portfolio_asset_settings').select('asset_id, color').eq('portfolio_id', portfolio_id).in_('asset_id', asset_ids).execute()
                 in_filter = f"in.({','.join(asset_ids)})"
                 res_colors = execute_request('portfolio_asset_settings', 'GET', params={
                     'select': 'asset_id,color',
                     'portfolio_id': f'eq.{portfolio_id}',
                     'asset_id': in_filter
                 })
                 
                 rows = res_colors.json() if (res_colors and res_colors.status_code == 200) else []
                 color_map = {row['asset_id']: row['color'] for row in rows}

            # Assegna colori
            for item in allocation_data:
                aid = item.get('asset_id')
                if aid and aid in color_map:
                    item['color'] = color_map[aid]
                else:
                    item['color'] = '#888888' # Fallback

                # Clean up interno
                if 'asset_id' in item: del item['asset_id']

            # 6. Metriche Sommario
            # P&L Totale = (Valore Corrente - Netto Investito) + Totale Dividendi
            pl_value = (current_total_value - total_invested) + total_dividends
            pl_percent = (pl_value / total_invested * 100) if total_invested > 0 else 0

            t_end = datetime.now()
            logger.info(f"[DASHBOARD_SUMMARY] Completato in {(t_end - t_start).total_seconds():.2f}s")
            return jsonify({
                "total_value": round(current_total_value, 2),
                "total_invested": round(total_invested, 2),
                "pl_value": round(pl_value, 2),
                "pl_percent": round(pl_percent, 2),
                "xirr": mwr_value,
                "mwr_type": mwr_type, 
                "allocation": sorted(allocation_data, key=lambda x: x['value'], reverse=True)
            })

        except Exception as e:
            logger.error(f"DASHBOARD ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            # Log su file debug
            with open("debug_error.log", "a") as f:
                f.write(f"SUMMARY ERROR: {datetime.now()}\n")
                f.write(traceback.format_exc())
                f.write("\n")
            return jsonify(error=str(e)), 500

    @app.route('/api/dashboard/history', methods=['GET'])
    def get_mwrr_history():
        # logger.info(">>> LOADING MWR HISTORY <<<") # Manteniamo pulito
        t0 = datetime.now()
        logger.info(f"[DASHBOARD_HISTORY] Richiesta ricevuta alle {t0}")
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            # supabase = get_supabase_client() -> Removed
            
            # 1. Recupera Transazioni con metadati
            # res_trans = supabase.table('transactions').select("*, assets(id, isin, name, asset_class, metadata)").eq('portfolio_id', portfolio_id).order('date').execute()
            res_trans = execute_request('transactions', 'GET', params={
                'select': '*,assets(id,isin,name,asset_class,metadata)',
                'portfolio_id': f'eq.{portfolio_id}',
                'order': 'date.asc'
            })
            
            transactions = res_trans.json() if (res_trans and res_trans.status_code == 200) else []
            
            if not transactions:
                return jsonify(history=[], assets=[])

            # 1b. Recupera Dividendi per lo storico
            res_div = execute_request('dividends', 'GET', params={
                'portfolio_id': f'eq.{portfolio_id}',
                'order': 'date.asc'
            })
            portfolio_dividends = res_div.json() if (res_div and res_div.status_code == 200) else []

            # Filtro asset opzionale
            assets_param = request.args.get('assets')
            selected_asset_ids = None
            if assets_param is not None:
                if assets_param == "":
                    selected_isins = set()
                else:
                    selected_isins = set(assets_param.split(','))
                transactions = [t for t in transactions if t['assets']['isin'] in selected_isins]
                # Collect asset IDs for dividend filtering
                selected_asset_ids = set(t['assets']['id'] for t in transactions)
            
            if not transactions:
                return jsonify(history=[], assets=[], portfolio=[])

            t1 = datetime.now()
            logger.info(f"[DASHBOARD_HISTORY] Transazioni recuperate: {len(transactions)} (Time: {(t1 - t0).total_seconds():.2f}s)")
            
            # 2. Identifica Asset e Range Temporale
            all_isins_set = set(t['assets']['isin'] for t in transactions)
            all_isins = list(all_isins_set)
            
            start_date_str = transactions[0]['date']
            start_date = datetime.fromisoformat(start_date_str).replace(tzinfo=None)
            logger.info(f"[DASHBOARD_HISTORY] DEBUG: First transaction date_str='{start_date_str}' parsed as start_date={start_date.strftime('%Y-%m-%d')} (month={start_date.month}, day={start_date.day})")
            
            # --- Option A: Use Last Available Data Date ---
            last_trans_date = max(datetime.fromisoformat(t['date']).replace(tzinfo=None) for t in transactions)
            
            # Fetch last price date for these ISINs
            res_max_p = execute_request('asset_prices', 'GET', params={
                'select': 'date',
                'isin': f'in.({",".join(all_isins)})',
                'order': 'date.desc',
                'limit': 1
            })
            
            last_price_date = last_trans_date
            if res_max_p and res_max_p.status_code == 200:
                rows = res_max_p.json()
                if rows:
                    last_price_date = datetime.strptime(rows[0]['date'], '%Y-%m-%d')
            
            end_date = max(last_trans_date, last_price_date)
            logger.info(f"[DASHBOARD_HISTORY] Using end_date={end_date.strftime('%Y-%m-%d')} (Max of Trans: {last_trans_date.strftime('%Y-%m-%d')}, Price: {last_price_date.strftime('%Y-%m-%d')})")
            
            # Helper per nomi asset
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

            # Generazione Check-points (Granularità Dinamica)
            days_diff = (end_date - start_date).days
            
            check_points = []
            current_cp = start_date
            
            if days_diff < 90:
                step = timedelta(days=1)
            elif days_diff < 365:
                 step = timedelta(weeks=1)
            else:
                 step = timedelta(days=30) 

            # Include start_date as first checkpoint (purchase date should be shown)
            check_points.append(start_date)
            current_cp += step
            
            while current_cp < end_date:
                check_points.append(current_cp)
                current_cp += step

            # Always include today
            check_points.append(end_date)

            # --- OTTIMIZZAZIONE BATCH PER PREZZI ---
            # Recuperiamo la storia interpolata per TUTTI gli asset in una volta
            t2_pre_batch = datetime.now()
            
            global_price_map = get_interpolated_price_history_batch(all_isins, min_date=start_date, max_date=end_date)
            
            logger.info(f"[DASHBOARD_HISTORY] Batch Price Fetch completed in {(datetime.now() - t2_pre_batch).total_seconds():.2f}s")
            
            # 3. Calcolo MWR History per Asset
            assets_history = []
            
            t2 = datetime.now()
            logger.info(f"[DASHBOARD_HISTORY] Processing {len(all_isins)} assets...")
            
            for isin in all_isins:
                sample_t = next((t for t in transactions if t['assets']['isin'] == isin), None)
                asset_name = get_asset_name(sample_t) if sample_t else isin
                
                # Usa la mappa globale batch
                price_map = global_price_map.get(isin, {})
                
                # Filtra transazioni per questo asset
                asset_trans = [t for t in transactions if t['assets']['isin'] == isin]
                
                mwr_series = []
                current_cash_flows = []
                transaction_idx = 0
                current_qty = 0.0
                net_invested_for_pnl = 0.0
                current_avg_cost = 0.0
                
                last_xirr_guess = 0.1 
                
                # Dividendi per questo asset
                asset_dividends = [d for d in portfolio_dividends if d['asset_id'] == sample_t['assets']['id']]
                dividend_idx = 0
                total_asset_dividends_acc = 0.0
                
                for cp in check_points:
                    cp_str = cp.strftime('%Y-%m-%d')
                    
                    # 1. Aggiungi cashflows fino a cp
                    while transaction_idx < len(asset_trans):
                        t = asset_trans[transaction_idx]
                        try:
                            clean_date = t['date'].replace('Z', '+00:00')
                            t_date = datetime.fromisoformat(clean_date).replace(tzinfo=None)
                        except:
                            t_date = datetime.now()

                        if t_date > cp:
                            break
                        
                        qty = float(t['quantity'])
                        price = float(t['price_eur'])
                        val = qty * price
                        is_buy = t['type'] == 'BUY'
                        
                        if is_buy:
                            total_cost = (current_qty * current_avg_cost) + val
                            new_total_qty = current_qty + qty
                            if new_total_qty > 0:
                                current_avg_cost = total_cost / new_total_qty
                            
                            current_qty += qty
                            current_cash_flows.append({"date": t_date, "amount": -val})
                            net_invested_for_pnl += val
                        else:
                            current_qty -= qty
                            current_cash_flows.append({"date": t_date, "amount": val})
                            net_invested_for_pnl -= val
                        
                        transaction_idx += 1

                    # 1b. Aggiungi dividendi fino a cp
                    while dividend_idx < len(asset_dividends):
                        d = asset_dividends[dividend_idx]
                        try:
                            clean_date = d['date'].replace('Z', '+00:00')
                            d_date = datetime.fromisoformat(clean_date).replace(tzinfo=None)
                        except:
                            d_date = datetime.now()

                        if d_date > cp:
                            break
                        
                        amount = float(d['amount_eur'])
                        total_asset_dividends_acc += amount
                        current_cash_flows.append({"date": d_date, "amount": amount})
                        dividend_idx += 1
                            
                    # 2. Valutazione al CP
                    if current_qty > 0.0001:
                        # O(1) Lookup
                        price_at_cp = price_map.get(cp_str, 0)
                        
                        if price_at_cp == 0 and current_avg_cost > 0:
                             price_at_cp = 0
                        
                        if price_at_cp == 0: continue

                        current_val = current_qty * price_at_cp
                        pnl_at_cp = (current_val - net_invested_for_pnl) + total_asset_dividends_acc
                        
                        calc_flows = current_cash_flows + [{"date": cp, "amount": current_val}]
                        
                        first_d = current_cash_flows[0]['date'] if current_cash_flows else cp
                        dur_days = (cp - first_d).days
                        
                        mwr_t1 = int(request.args.get('mwr_t1', 30))
                        mwr_t2 = int(request.args.get('mwr_t2', 365))

                        try:
                            # 1. Tentativo XIRR Standard
                            val = xirr(calc_flows, guess=last_xirr_guess)
                            
                            final_val = 0.0
                            is_valid_xirr = False
                            
                            # 2. Validazione Convergenza
                            if val is not None and abs(val) <= 10.0: # Max 1000%
                                last_xirr_guess = max(-0.99, min(val, 10.0))
                                final_val = val
                                is_valid_xirr = True
                                
                                # Tier Logic con XIRR valido
                                if dur_days < mwr_t1:
                                     # Tier 1 Override (Simple Return)
                                     pass # Gestito sotto uniformemente
                                elif dur_days < mwr_t2:
                                    from finance import deannualize_xirr
                                    final_val = deannualize_xirr(val, dur_days)
                                # else: Keep annualized val
                            
                            # 3. Determinazione Valore Finale (XIRR Tiered o Fallback)
                            # Se XIRR non valido O siamo in Tier 1 -> Usa Simple Return
                            use_simple_return = (not is_valid_xirr) or (dur_days < mwr_t1)
                            
                            if use_simple_return:
                                # Calcolo Simple Return robusto (Net Invested: Buys + Sells + Divs)
                                net_in = sum(-f['amount'] for f in current_cash_flows)
                                if net_in > 0:
                                     simple_ret = (current_val - net_in) / net_in
                                     
                                     # Annualizza se Tier 3
                                     if dur_days >= mwr_t2:
                                         from finance import annualize_simple_return
                                         final_val = annualize_simple_return(simple_ret, dur_days)
                                     else:
                                         final_val = simple_ret
                                else:
                                     final_val = 0.0

                            # 4. Clamp Rigoroso (±500%) per evitare distruzione grafico
                            final_val = max(-5.0, min(final_val, 5.0))
                            
                            # DIAGNOSTICA ASSET - Se valore tocca il clamp o esce (impossibile con max/min ma utile per tracciare)
                            if abs(final_val) >= 4.9:
                                logger.warning(f"[ASSET_DIAG] CLAMP HIT/FAIL {isin} date={cp_str} val={val} final={final_val}")

                            mwr_series.append({
                                "date": cp_str,
                                "value": round(final_val * 100, 2),
                                "pnl": round(pnl_at_cp, 2),
                                "market_value": round(current_val, 2)
                            })
                        except Exception as e:
                            # In caso di errore catastrofico, salta il punto ma non crashare
                            pass

                if mwr_series:
                    # Recupera ID per colore (ottimizzabile con batch colors se volessimo)
                    # Qui facciamo singola chiamata o ignoriamo se lento? 
                    # Meglio batch colors. Facciamolo dopo loop o qui?
                    # Per ora mantengo logica vecchia ma con try/catch stretti.
                    # TODO: Ottimizzare anche i colori qui se necessario. 
                    
                    assets_history.append({
                        "isin": isin,
                        "name": asset_name,
                        "color": "#888888", # Placeholder, popolato dopo batch fetch
                        "type": sample_t['assets'].get('asset_class') or "Altro",
                        "data": mwr_series,
                        "asset_id_for_color": sample_t['assets']['id']
                    })

            # --- BATCH COLORS PER HISTORY ---
            # Raccogli ID
            hist_asset_ids = [item['asset_id_for_color'] for item in assets_history]
            color_map_hist = {}
            if hist_asset_ids:
                 try:
                     # res_c = supabase.table('portfolio_asset_settings').select('asset_id, color').eq('portfolio_id', portfolio_id).in_('asset_id', hist_asset_ids).execute()
                     in_filter = f"in.({','.join(hist_asset_ids)})"
                     res_c = execute_request('portfolio_asset_settings', 'GET', params={
                         'select': 'asset_id,color',
                         'portfolio_id': f'eq.{portfolio_id}',
                         'asset_id': in_filter
                     })
                     rows = res_c.json() if (res_c and res_c.status_code == 200) else []
                     color_map_hist = {row['asset_id']: row['color'] for row in rows}
                 except: pass
            
            # Applica colori
            for item in assets_history:
                aid = item.get('asset_id_for_color')
                if aid and aid in color_map_hist:
                    item['color'] = color_map_hist[aid]
                if 'asset_id_for_color' in item: del item['asset_id_for_color']


            # 4. Calcolo Storia Ptf (Ponderata)
            portfolio_series = []
            
            # global_price_map è già popolato per tutti gli assets! -> OTTIMO.
            
            # Filter dividends by selected assets if subset is active
            if selected_asset_ids:
                portfolio_dividends = [d for d in portfolio_dividends if d['asset_id'] in selected_asset_ids]
            
            current_port_cash_flows = []
            transaction_idx_p = 0
            
            current_port_holdings_map = {} 
            last_port_xirr = 0.1

            # Contatori diagnostici per riepilogo finale
            diag_counts = {"T1_SIMPLE": 0, "T2_DEANN": 0, "T3_ANNUAL": 0, "EXTREME": 0, "XIRR_NONE": 0, "XIRR_EXC": 0, "SKIPPED": 0}

            for cp in check_points:
                cp_str = cp.strftime('%Y-%m-%d')
                
                # 0. Global Portfolio Dividends Tracker
                if 'port_dividend_idx' not in locals():
                    port_dividend_idx = 0
                    total_port_dividends_acc = 0.0

                # 1. Update Cashflows & Holdings
                while transaction_idx_p < len(transactions): 
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

                # 1b. Update Portfolio Dividends
                while port_dividend_idx < len(portfolio_dividends):
                    d = portfolio_dividends[port_dividend_idx]
                    d_date = datetime.fromisoformat(d['date']).replace(tzinfo=None)
                    if d_date > cp:
                        break
                    
                    amount = float(d['amount_eur'])
                    total_port_dividends_acc += amount
                    current_port_cash_flows.append({"date": d_date, "amount": amount})
                    port_dividend_idx += 1

                # 2. Calcolo Valore Portafoglio al CP
                port_value_at_cp = 0
                for isin, data in current_port_holdings_map.items():
                    qty = data['qty']
                    if qty <= 0.0001: continue
                    
                    # O(1) Lookup
                    price = global_price_map.get(isin, {}).get(cp_str, 0)
                    
                    if price == 0 and data['avg_cost'] > 0:
                         price = 0

                    port_value_at_cp += (qty * price)
                
                if port_value_at_cp > 0:
                    calc_flows = current_port_cash_flows + [{"date": cp, "amount": port_value_at_cp}]
                    
                    start_d = current_port_cash_flows[0]['date'] if current_port_cash_flows else cp
                    dur_days = (cp - start_d).days
                    
                    mwr_t1 = int(request.args.get('mwr_t1', 30))
                    mwr_t2 = int(request.args.get('mwr_t2', 365))

                    final_mwr = 0.0
                    calculated = False
                    
                    # Parametro xirr_mode: 'standard' (default con fallback) o 'multi_guess' (prova multipli guess)
                    xirr_mode = request.args.get('xirr_mode', 'standard')

                    try:
                        if xirr_mode == 'multi_guess':
                            from finance import xirr_multi_guess
                            val = xirr_multi_guess(calc_flows)
                        else:
                            val = xirr(calc_flows, guess=last_port_xirr)
                        
                        xirr_converged = val is not None and abs(val) <= 10.0  # < 1000%
                        
                        if xirr_converged:
                            # XIRR convergita ragionevolmente → usa tiering normale
                            last_port_xirr = max(-0.99, min(val, 10.0))
                            final_mwr = val
                            
                            # Tier 1: Simple Return Override
                            if dur_days < mwr_t1:
                                net_in = sum(-f['amount'] for f in current_port_cash_flows)
                                if net_in > 0:
                                    final_mwr = (port_value_at_cp - net_in) / net_in
                                else:
                                    final_mwr = 0.0
                                tier_name = "T1_SIMPLE"
                                diag_counts["T1_SIMPLE"] += 1
                            
                            # Tier 2: Deannualize
                            elif dur_days < mwr_t2:
                                from finance import deannualize_xirr
                                final_mwr = deannualize_xirr(val, dur_days)
                                tier_name = "T2_DEANN"
                                diag_counts["T2_DEANN"] += 1
                            
                            # Tier 3: Annualized XIRR (val unchanged)
                            else:
                                tier_name = "T3_ANNUAL"
                                diag_counts["T3_ANNUAL"] += 1
                            
                            calculated = True
                        else:
                            # XIRR non convergita → Fallback a Simple Return
                            # Usa il capitale netto investito (Buys + Sells + Dividendi)
                            net_in = sum(-f['amount'] for f in current_port_cash_flows)
                            if net_in > 0:
                                simple_ret = (port_value_at_cp - net_in) / net_in
                                
                                # Se siamo in Tier 3, annualizziamo il Simple Return per coerenza con la card
                                if dur_days >= mwr_t2:
                                    from finance import annualize_simple_return
                                    final_mwr = annualize_simple_return(simple_ret, dur_days)
                                    tier_name = "FALLBACK_ANNUAL"
                                else:
                                    final_mwr = simple_ret
                                    tier_name = "FALLBACK_SIMPLE"
                            else:
                                final_mwr = 0.0
                                tier_name = "FALLBACK_SIMPLE"
                            
                            diag_counts["FALLBACK"] = diag_counts.get("FALLBACK", 0) + 1
                            calculated = True
                        
                        # --- LOGGING DIAGNOSTICO ---
                        if calculated:
                            is_extreme = abs(final_mwr) > 1.0
                            if is_extreme:
                                diag_counts["EXTREME"] += 1
                            
                            diag_net_in_buy = sum(-f['amount'] for f in current_port_cash_flows if f['amount'] < 0)
                            diag_net_in_all = sum(-f['amount'] for f in current_port_cash_flows)
                            diag_divs = total_port_dividends_acc
                            
                            xirr_raw_str = f"{val:.6f} ({val*100:.2f}%)" if val is not None else "None"
                            log_level = logger.warning if (is_extreme or not xirr_converged) else logger.info
                            log_level(
                                f"[MWR_DIAG] {'⚠️EXTREME' if is_extreme else 'OK'} "
                                f"date={cp_str} | tier={tier_name} | mode={xirr_mode} | dur={dur_days}d | "
                                f"xirr_raw={xirr_raw_str} | converged={xirr_converged} | "
                                f"final_mwr={final_mwr:.6f} ({final_mwr*100:.2f}%) | "
                                f"flows={len(calc_flows)} | "
                                f"port_val={port_value_at_cp:.2f} | "
                                f"net_in_buy={diag_net_in_buy:.2f} | "
                                f"net_in_all={diag_net_in_all:.2f} | "
                                f"divs_acc={diag_divs:.2f}"
                            )
                        
                    except Exception as e:
                        diag_counts["XIRR_EXC"] += 1
                        logger.warning(f"[MWR_DIAG] XIRR_EXCEPTION at {cp_str} | dur={dur_days}d | mode={xirr_mode} | error={e}")
                        pass
                    
                    if calculated:
                        # Clamp ragionevole: ±500%
                        final_mwr = max(-5.0, min(final_mwr, 5.0))
                        portfolio_series.append({
                            "date": cp_str,
                            "value": round(final_mwr * 100, 2),
                            "market_value": round(port_value_at_cp, 2)
                        })
                else:
                    diag_counts["SKIPPED"] += 1
            
            # --- RIEPILOGO DIAGNOSTICO ---
            fallback_count = diag_counts.get("FALLBACK", 0)
            total_calculated = diag_counts["T1_SIMPLE"] + diag_counts["T2_DEANN"] + diag_counts["T3_ANNUAL"] + fallback_count
            mwr_mode = "xirr"  # Default: calcolo XIRR puro
            if fallback_count > 0 and total_calculated > 0:
                fallback_ratio = fallback_count / total_calculated
                if fallback_ratio > 0.5:
                    mwr_mode = "simple_return"  # Maggioranza fallback
                else:
                    mwr_mode = "mixed"  # Mix di XIRR e fallback
            
            logger.info(f"[MWR_DIAG] === RIEPILOGO PORTAFOGLIO === checkpoints={len(check_points)} | serie_output={len(portfolio_series)} | mwr_mode={mwr_mode}")
            logger.info(f"[MWR_DIAG] Tiers: T1={diag_counts['T1_SIMPLE']} | T2={diag_counts['T2_DEANN']} | T3={diag_counts['T3_ANNUAL']} | FALLBACK={fallback_count}")
            logger.info(f"[MWR_DIAG] Problemi: EXTREME={diag_counts['EXTREME']} | XIRR_NONE={diag_counts.get('XIRR_NONE',0)} | XIRR_EXC={diag_counts['XIRR_EXC']} | SKIPPED={diag_counts['SKIPPED']}")
            if portfolio_series:
                all_mwr_values = [p['value'] for p in portfolio_series]
                logger.info(f"[MWR_DIAG] Range output: min={min(all_mwr_values):.2f}% | max={max(all_mwr_values):.2f}% | last={all_mwr_values[-1]:.2f}%")
            
            t_final = datetime.now()
            logger.info(f"[DASHBOARD_HISTORY] Completato in {(t_final - t0).total_seconds():.2f}s")
            
            return jsonify({
                "series": assets_history,
                "portfolio": portfolio_series,
                "mwr_mode": mwr_mode
            })

        except Exception as e:
            logger.error(f"DASHBOARD HISTORY ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            with open("debug_error.log", "a") as f:
                f.write(f"HISTORY ERROR: {datetime.now()}\n")
                f.write(traceback.format_exc())
                f.write("\n")
            return jsonify(error=str(e)), 500
