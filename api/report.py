from flask import Blueprint, jsonify, request
from db_helper import execute_request
from price_manager import get_interpolated_price_history_batch
from finance import get_tiered_mwr
from logger import logger
from datetime import datetime
import traceback

report_bp = Blueprint('report', __name__)

@report_bp.route('/api/report/generate', methods=['GET'])
def generate_report():
    try:
        portfolio_id = request.args.get('portfolio_id')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        advisory_cost_annual = float(request.args.get('advisory_cost', 0))
        wealth_tax_rate = float(request.args.get('wealth_tax_rate', 0.002))
        stamp_duty = request.args.get('stamp_duty', 'true').lower() == 'true'

        if not portfolio_id or not start_date_str or not end_date_str:
            return jsonify(error="Mancano parametri: portfolio_id, start_date, o end_date"), 400

        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        except ValueError:
            return jsonify(error="Formato data non valido. Usa YYYY-MM-DD"), 400

        logger.info(f"[REPORT] Generazione report per {portfolio_id} dal {start_date_str} al {end_date_str}")

        # 1. Recupera Transazioni
        res_trans = execute_request('transactions', 'GET', params={
            'select': '*,assets(id,isin,name,asset_class)',
            'portfolio_id': f'eq.{portfolio_id}',
            'order': 'date.asc'
        })
        transactions = res_trans.json() if (res_trans and res_trans.status_code == 200) else []

        # 2. Recupera Dividendi
        res_div = execute_request('dividends', 'GET', params={
            'portfolio_id': f'eq.{portfolio_id}',
            'order': 'date.asc'
        })
        dividends = res_div.json() if (res_div and res_div.status_code == 200) else []

        if not transactions and not dividends:
            return jsonify(error="Nessun dato trovato per questo portafoglio."), 404

        # Identifica tutti gli ISIN
        all_isins_set = set()
        for t in transactions:
            if t.get('assets') and t['assets'].get('isin'):
                all_isins_set.add(t['assets']['isin'])
        all_isins = list(all_isins_set)

        # Recupera prezzi dal min data inizio al max data fine
        # Assumiamo che la prima transazione ci dia l'inizio assoluto se necessario per il PMC storicizzato
        first_t_date = min([datetime.fromisoformat(t['date'].replace('Z', '+00:00')).replace(tzinfo=None) for t in transactions]) if transactions else start_date
        
        # O recuperiamo i prezzi batch
        t2_pre_batch = datetime.now()
        global_price_map = get_interpolated_price_history_batch(all_isins, min_date=first_t_date, max_date=end_date, portfolio_id=portfolio_id)
        logger.info(f"[REPORT] Batch Price Fetch completato in {(datetime.now() - t2_pre_batch).total_seconds():.2f}s")

        # Variabili di stato globale
        holdings = {} # isin -> {'qty': float, 'avg_cost': float, 'name': str}
        capital_gains = []
        period_transactions = []
        period_dividends = []

        total_dividends_in_period = 0.0

        for isin in all_isins:
            holdings[isin] = {'qty': 0.0, 'avg_cost': 0.0, 'name': isin, 'asset_class': 'Other'}
            
            # Map asset details
            for t in transactions:
                if t['assets']['isin'] == isin:
                    holdings[isin]['name'] = t['assets'].get('name', isin)
                    holdings[isin]['asset_class'] = t['assets'].get('asset_class', 'Other')
                    break

        # Processa Transazioni in ordine cronologico
        for t in transactions:
            try:
                t_date = datetime.fromisoformat(t['date'].replace('Z', '+00:00')).replace(tzinfo=None)
            except:
                continue

            # Se la transazione è futura rispetto alla fine del report, la ignoriamo completamente
            if t_date > end_date:
                continue

            isin = t['assets']['isin']
            qty = float(t['quantity'])
            price = float(t['price_eur'])
            val = qty * price
            is_buy = t['type'] == 'BUY'
            
            curr_h = holdings[isin]

            in_period = start_date <= t_date <= end_date

            if is_buy:
                # Calcola nuovo prezzo medio ponderato (PMC)
                if curr_h['qty'] >= -0.0001:  # Ignora posizioni short per il calcolo classico
                    total_cost = (curr_h['qty'] * curr_h['avg_cost']) + val
                    new_qty = curr_h['qty'] + qty
                    if new_qty > 0:
                        curr_h['avg_cost'] = total_cost / new_qty
                
                curr_h['qty'] += qty
                
                if in_period:
                    period_transactions.append({
                        'date': t_date.strftime('%Y-%m-%d'),
                        'type': 'BUY',
                        'isin': isin,
                        'name': curr_h['name'],
                        'quantity': qty,
                        'price': price,
                        'value': val
                    })
            else: # SELL
                # Realizzazione capital gain
                pmc = curr_h['avg_cost']
                gain_per_unit = price - pmc
                total_gain = gain_per_unit * qty
                
                if in_period:
                    period_transactions.append({
                        'date': t_date.strftime('%Y-%m-%d'),
                        'type': 'SELL',
                        'isin': isin,
                        'name': curr_h['name'],
                        'quantity': qty,
                        'price': price,
                        'value': val,
                        'pmc': pmc,
                        'realized_gain': total_gain
                    })
                    
                    capital_gains.append({
                        'date': t_date.strftime('%Y-%m-%d'),
                        'isin': isin,
                        'name': curr_h['name'],
                        'quantity': qty,
                        'sell_price': price,
                        'pmc': pmc,
                        'realized_gain': total_gain
                    })
                    
                curr_h['qty'] -= qty

        # Processa Dividendi
        for d in dividends:
            try:
                d_date = datetime.fromisoformat(d['date'].replace('Z', '+00:00')).replace(tzinfo=None)
            except:
                continue
                
            if start_date <= d_date <= end_date:
                amount = float(d['amount_eur'])
                total_dividends_in_period += amount
                
                # Trova nome asset
                a_name = "Unknown"
                for isin, hdata in holdings.items():
                    # d['asset_id'] might need mapping, let's fetch it from transactions if possible
                    pass
                
                # Ricerca nome in transazioni
                for t in transactions:
                    if t['assets']['id'] == d['asset_id']:
                        a_name = t['assets'].get('name', t['assets']['isin'])
                        break

                period_dividends.append({
                    'date': d_date.strftime('%Y-%m-%d'),
                    'name': a_name,
                    'amount': amount,
                    'type': d.get('type', 'DIVIDEND')
                })

        # --- Calcolo Valore Inizio e Fine Periodo (Simulazione "Copia" Dashboard) ---
        
        # ricalcoliamo le holding a start_date - 1 day
        start_date_eval = start_date
        
        # Helper: Valore Portafoglio a una certa data (basato sui flussi passati fino a quella data)
        def calc_portfolio_at_date(target_date):
            temp_holdings = {isin: 0.0 for isin in all_isins}
            for t in transactions:
                t_date = datetime.fromisoformat(t['date'].replace('Z', '+00:00')).replace(tzinfo=None)
                if t_date <= target_date:
                    qty = float(t['quantity'])
                    is_buy = t['type'] == 'BUY'
                    if is_buy: temp_holdings[t['assets']['isin']] += qty
                    else: temp_holdings[t['assets']['isin']] -= qty
            
            target_str = target_date.strftime('%Y-%m-%d')
            port_val = 0.0
            
            asset_performances = {} # Per worst/best nel periodo
            
            for isin, qty in temp_holdings.items():
                if qty > 0.0001:
                    price = global_price_map.get(isin, {}).get(target_str, 0)
                    val = qty * price
                    port_val += val
                    asset_performances[isin] = {'value': val, 'qty': qty, 'price': price}
            
            return port_val, temp_holdings, asset_performances

        # Valore Iniziale
        start_value, start_holdings, start_asset_perf = calc_portfolio_at_date(start_date)
        
        # Valore Finale
        end_value, end_holdings, end_asset_perf = calc_portfolio_at_date(end_date)

        # Cashflows nel periodo per MWR
        period_cashflows = []
        for pt in period_transactions:
            t_date = datetime.strptime(pt['date'], '%Y-%m-%d')
            if pt['type'] == 'BUY':
                period_cashflows.append({'date': t_date, 'amount': -pt['value']})
            else:
                period_cashflows.append({'date': t_date, 'amount': pt['value']})
        
        for pd in period_dividends:
            if pd['type'] != 'EXPENSE':
                d_date = datetime.strptime(pd['date'], '%Y-%m-%d')
                period_cashflows.append({'date': d_date, 'amount': pd['amount']})

        # P&L del Periodo = (Valore Finale - Valore Iniziale) + Somma(Cashflows Uscita) - Somma(Cashflows Entrata) + Dividendi
        # Più semplice: Valore Finale = Valore Iniziale + Apporti (NETTI) + P&L
        # P&L = Valore Finale - Valore Iniziale - Net_Inflows
        
        net_inflows = 0.0
        for pt in period_transactions:
            if pt['type'] == 'BUY':
                net_inflows += pt['value']
            else:
                net_inflows -= pt['value']
                
        # Dividendi sono considerati rendimento (già netti 26%), quindi P&L li include
        period_pl = (end_value - start_value) - net_inflows + total_dividends_in_period

        # Calcolo MWR (Time-Weighted / XIRR) Base
        mwr_flows = [{'date': start_date, 'amount': -start_value}] + period_cashflows
        mwr_val, mwr_type = get_tiered_mwr(mwr_flows, end_value, t1=30, t2=365, end_date=end_date)

        # Tassazione Plusvalenze
        total_realized_gain = sum(cg['realized_gain'] for cg in capital_gains)
        capital_gains_tax = total_realized_gain * 0.26 if total_realized_gain > 0 else 0.0
        
        # Calcolo dei Costi Simulati nel periodo
        # [FIX] Rendiamo il conteggio dei giorni inclusivo (+1) per un calcolo corretto del rateo
        days_in_period = max(1, (end_date - start_date).days + 1)
        year_frac = days_in_period / 365.0
        
        wealth_tax_period = end_value * wealth_tax_rate * year_frac
        stamp_duty_period = 34.20 * year_frac if stamp_duty else 0.0
        # Consulenza proporzionata in base ai giorni inclusivi del periodo
        advisory_cost_period = advisory_cost_annual * year_frac
        
        logger.info(f"[REPORT_COSTS] Periodo: {days_in_period} giorni. YearFrac: {year_frac:.4f}")
        logger.info(f"[REPORT_COSTS] Advisory Annual: {advisory_cost_annual} -> Period: {advisory_cost_period:.2f}")
        
        total_costs_simulated = wealth_tax_period + stamp_duty_period + advisory_cost_period + capital_gains_tax
        
        # MWR Corretto (Adjusted) => Inserisco un flusso di cassa in uscita alla fine equivalente ai costi, o sottraggo dal capitale finale
        # Entrambi gli approcci riducono la performance calcolata simulando l'esborso in data 'end_date'
        mwr_adjusted_val = 0.0
        if end_value > 0:
            mwr_adjusted_val, _ = get_tiered_mwr(mwr_flows, max(0.0, end_value - total_costs_simulated), t1=30, t2=365, end_date=end_date)
            
        period_pl_net = period_pl - total_costs_simulated

        # Calcolo performance per singolo asset per Worst/Best
        # Formula semplificata per asset_pl nel periodo = (End_Value - Start_Value) - NetInflows_Asset + Divs_Asset
        asset_stats = []
        for isin in all_isins:
            s_val = start_asset_perf.get(isin, {}).get('value', 0.0)
            e_val = end_asset_perf.get(isin, {}).get('value', 0.0)
            
            a_net_inflow = 0.0
            for pt in period_transactions:
                if pt['isin'] == isin:
                    if pt['type'] == 'BUY': a_net_inflow += pt['value']
                    else: a_net_inflow -= pt['value']
            
            a_divs = 0.0
            # Mappatura imperfetta nome->isin sui dividendi, usiamo nome
            for pd in period_dividends:
                if pd['name'] == holdings[isin]['name']:
                    a_divs += pd['amount']
                    
            a_pl = (e_val - s_val) - a_net_inflow + a_divs
            
            # Calcolo rendimento percentuale semplificato
            a_invested = s_val + (a_net_inflow if a_net_inflow > 0 else 0)
            a_pct = (a_pl / a_invested * 100) if a_invested > 0.0001 else 0.0
            
            if a_invested > 0 or s_val > 0 or e_val > 0:
                asset_stats.append({
                    'isin': isin,
                    'name': holdings[isin]['name'],
                    'value': e_val,
                    'pl': a_pl,
                    'pl_pct': a_pct,
                    'asset_class': holdings[isin]['asset_class']
                })
        
        asset_stats.sort(key=lambda x: x['pl'], reverse=True)
        best_performers = asset_stats[:3]
        worst_performers = asset_stats[-3:] if len(asset_stats) >= 3 else asset_stats

        # Response payload
        report_data = {
            'portfolio_id': portfolio_id,
            'start_date': start_date_str,
            'end_date': end_date_str,
            'summary': {
                'start_value': round(start_value, 2),
                'end_value': round(end_value, 2),
                'net_inflows': round(net_inflows, 2),
                'period_pl': round(period_pl, 2),
                'mwr_percent': mwr_val if mwr_val else 0.0,
                'adjusted_mwr_percent': mwr_adjusted_val if mwr_adjusted_val else 0.0,
                'estimated_wealth_tax': round(wealth_tax_period, 2),
                'estimated_stamp_duty': round(stamp_duty_period, 2),
                'estimated_advisory_cost': round(advisory_cost_period, 2),
                'total_costs': round(total_costs_simulated, 2),
                'net_pl': round(period_pl_net, 2),
                'total_dividends': round(total_dividends_in_period, 2),
                'realized_capital_gains': round(total_realized_gain, 2),
                'estimated_cg_tax': round(capital_gains_tax, 2)
            },
            'transactions': period_transactions,
            'capital_gains_detail': capital_gains,
            'dividends': period_dividends,
            'best_performers': best_performers,
            'worst_performers': worst_performers,
            'all_performances': asset_stats
        }

        return jsonify(report_data), 200

    except Exception as e:
        logger.error(f"[REPORT] Error: {e}")
        logger.error(traceback.format_exc())
        return jsonify(error=str(e)), 500
