
from flask import Blueprint, request, jsonify
from supabase_client import get_supabase_client
from logger import logger
from finance import get_tiered_mwr
import pandas as pd
import numpy as np
from datetime import datetime

memory_bp = Blueprint('memory', __name__)

@memory_bp.route('/api/memory/data', methods=['GET'])
def get_memory_data():
    """
    Fetches data for the Memoria table.
    - Aggregates Transactions (Buy/Sell) including partial sales.
    - Aggregates Dividends.
    - Fetches Current Prices (Manual/Live).
    - Fetches Asset Notes.
    - Calculates P&L: (Value + Sales + Dividends) - Cost.
    """
    try:
        portfolio_id = request.args.get('portfolio_id')
        if not portfolio_id:
            return jsonify(error="Missing portfolio_id"), 400
        
        # Get MWR tiering thresholds
        mwr_t1 = int(request.args.get('mwr_t1', 30))
        mwr_t2 = int(request.args.get('mwr_t2', 365))

        supabase = get_supabase_client()
        
        # 1. Fetch Transactions (Optimized: Single Query)
        res_trans = supabase.table('transactions').select(
            'quantity, price_eur, type, date, asset_id, assets(isin, name, asset_class, metadata, last_trend_variation)'
        ).eq('portfolio_id', portfolio_id).execute()
        
        transactions = res_trans.data
        
        # 2. Fetch Dividends
        res_divs = supabase.table('dividends').select(
            'amount_eur, date, asset_id'
        ).eq('portfolio_id', portfolio_id).execute()
        
        dividends = res_divs.data
        
        # 3. Fetch Asset Notes
        res_notes = supabase.table('asset_notes').select(
            'asset_id, note'
        ).eq('portfolio_id', portfolio_id).execute()
        
        notes_map = {n['asset_id']: n['note'] for n in res_notes.data}

        # 4. Fetch Latest Prices (From asset_prices table)
        # We need prices for ALL assets in the portfolio.
        # Get unique ISINs first
        all_isins = set()
        for t in transactions:
            if t.get('assets') and t['assets'].get('isin'):
                all_isins.add(t['assets']['isin'])
        
        # Batch fetch latest prices is tricky without a "latest" view or function.
        # We can fetch ALL prices for these ISINs and filter in Python, or use `price_manager` loop.
        # Given "Optimized" requirement, bulk fetch is better, but `asset_prices` can be huge.
        # Let's rely on `price_manager.get_latest_price` loop for now, 
        # BUT since we might have 50-100 assets, N+1 is bad.
        # Better: Fetch ALL prices for these ISINs (order desc date) and drop duplicates in Pandas.
        
        price_map = {}
        if all_isins:
            res_prices = supabase.table('asset_prices').select('isin, price, date')\
                .in_('isin', list(all_isins))\
                .order('date', desc=True)\
                .execute()
            
            # Keep only the first (latest) price for each ISIN
            seen_isins = set()
            for p in res_prices.data:
                if p['isin'] not in seen_isins:
                    price_map[p['isin']] = p['price']
                    seen_isins.add(p['isin'])

        # --- Aggregation / Calculation in Python ---
        
        # Structure: { asset_id: { ... stats ... } }
        assets_stats = {}

        # Process Transactions
        for t in transactions:
            aid = t['asset_id']
            asset_info = t['assets']
            if not asset_info: continue
            
            if aid not in assets_stats:
                assets_stats[aid] = {
                    'asset_id': aid,
                    'isin': asset_info['isin'],
                    'name': asset_info['name'],
                    'type': asset_info['asset_class'] or 'Unknown',
                    'last_trend_variation': asset_info.get('last_trend_variation'),
                    'first_buy_date': None,
                    'last_sell_date': None,
                    'total_cost': 0.0,
                    'total_sales': 0.0,
                    'quantity': 0.0,
                    'dividends': 0.0,
                    'note': notes_map.get(aid, ''),
                    'cashflows': []  # For XIRR calculation
                }
            
            details = assets_stats[aid]
            
            qty = float(t['quantity'])
            price = float(t['price_eur'])
            date_str = t['date']
            
            # Parse date for cashflows
            try:
                tx_date = datetime.strptime(date_str, '%Y-%m-%d')
            except:
                tx_date = datetime.now()
            
            # Dates and cashflows
            if t['type'] == 'BUY':
                if details['first_buy_date'] is None or date_str < details['first_buy_date']:
                    details['first_buy_date'] = date_str
                
                details['total_cost'] += (qty * price)
                details['quantity'] += qty
                # BUY = cash outflow (negative for XIRR)
                details['cashflows'].append({'date': tx_date, 'amount': -(qty * price)})
                
            elif t['type'] == 'SELL':
                if details['last_sell_date'] is None or date_str > details['last_sell_date']:
                    details['last_sell_date'] = date_str
                
                details['total_sales'] += (qty * price)
                details['quantity'] -= qty # Sell reduces holding
                # SELL = cash inflow (positive for XIRR)
                details['cashflows'].append({'date': tx_date, 'amount': qty * price})
        
        # Process Dividends
        for d in dividends:
            aid = d['asset_id']
            if aid in assets_stats:
                assets_stats[aid]['dividends'] += float(d['amount_eur'])
                # Dividend = cash inflow (positive for XIRR)
                try:
                    div_date = datetime.strptime(d['date'], '%Y-%m-%d')
                except:
                    div_date = datetime.now()
                assets_stats[aid]['cashflows'].append({'date': div_date, 'amount': float(d['amount_eur'])})
            else:
                # Dividend for asset not in transactions? Unlikely but possible (if transactions deleted?)
                # We ignore or fetch asset info? Let's ignore for safety if no transaction history exists.
                pass

        # Final List Construction
        results = []
        
        for aid, stats in assets_stats.items():
            qty = stats['quantity']
            isin = stats['isin']
            
            # Current Value
            current_price = price_map.get(isin, 0.0)
            
            # Handle negligible quantities (float errors)
            if abs(qty) < 0.0001:
                qty = 0.0
                
            current_value = qty * current_price
            
            # P&L Calculation (Absolute)
            # P&L = (Final Value + Sales + Dividends) - Cost
            # Final Value is Current Value.
            pnl = (current_value + stats['total_sales'] + stats['dividends']) - stats['total_cost']
            
            # MWR/XIRR Calculation using tiered logic
            mwr_value = 0.0
            mwr_type = "NONE"
            
            if stats['cashflows']:
                # For closed positions, use final sale value instead of current value
                final_value = current_value if qty > 0 else 0.0
                # For closed positions, the cashflows already contain all the inflows from sales
                # So we pass 0 as current value since it's already in cashflows
                # For open positions, pass current_value
                try:
                    mwr_value, mwr_type = get_tiered_mwr(
                        stats['cashflows'], 
                        final_value,
                        t1=mwr_t1, 
                        t2=mwr_t2
                    )
                except Exception as e:
                    logger.error(f"XIRR calc error for asset {aid}: {e}")
                    mwr_value = 0.0
                    mwr_type = "ERROR"
            
            # Dates formatting
            open_date = stats['first_buy_date']
            # Close Date only if Quantity is 0 (Closed Position)
            close_date = stats['last_sell_date'] if qty == 0 else None
            
            results.append({
                "id": aid,
                "isin": isin,
                "description": stats['name'],
                "type": stats['type'],
                "open_date": open_date,
                "close_date": close_date,
                "pnl": round(pnl, 2),
                "mwr": mwr_value,
                "mwr_type": mwr_type,
                "value": round(current_value, 2),
                "value": round(current_value, 2),
                "note": stats['note'],
                "last_trend_variation": stats.get('last_trend_variation'),
                # Extra debug info if needed
                "qty": qty,
                "total_divs": round(stats['dividends'], 2)
            })

        return jsonify(data=results)

    except Exception as e:
        logger.error(f"MEMORIA DATA ERROR: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify(error=str(e)), 500

@memory_bp.route('/api/memory/notes', methods=['POST', 'OPTIONS'])
def save_note():
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        data = request.json
        portfolio_id = data.get('portfolio_id')
        asset_id = data.get('asset_id')
        note = data.get('note')
        
        if not portfolio_id or not asset_id:
             return jsonify(error="Missing IDs"), 400

        supabase = get_supabase_client()
        
        # Upsert Note
        res = supabase.table('asset_notes').upsert({
            "portfolio_id": portfolio_id,
            "asset_id": asset_id,
            "note": note,
            "updated_at": "now()"
        }, on_conflict='portfolio_id, asset_id').execute()
        
        return jsonify(success=True, message="Note saved")

    except Exception as e:
        logger.error(f"SAVE NOTE ERROR: {e}")
        return jsonify(error=str(e)), 500

@memory_bp.route('/api/memory/settings', methods=['GET', 'POST', 'OPTIONS'])
def memory_settings():
    """
    Saves/Loads table configuration (column visibility, sorting, filters)
    Key: memory_settings_{user_id}_{portfolio_id}
    """
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        supabase = get_supabase_client()
        
        if request.method == 'POST':
            data = request.json
            user_id = data.get('user_id')
            portfolio_id = data.get('portfolio_id')
            settings = data.get('settings')
            
            if not user_id or not portfolio_id:
                return jsonify(error="Missing user/portfolio id"), 400
                
            key = f"memory_settings_{user_id}_{portfolio_id}"
            
            supabase.table('app_config').upsert({
                "key": key,
                "value": settings,
                "updated_at": "now()"
            }).execute()
            
            return jsonify(success=True)
            
        elif request.method == 'GET':
            user_id = request.args.get('user_id')
            portfolio_id = request.args.get('portfolio_id')
            
            if not user_id or not portfolio_id:
                 return jsonify(error="Missing user/portfolio id"), 400

            key = f"memory_settings_{user_id}_{portfolio_id}"
            res = supabase.table('app_config').select('value').eq('key', key).maybe_single().execute()
            
            if res and res.data:
                return jsonify(settings=res.data['value'])
            return jsonify(settings={}) # Empty default

    except Exception as e:
        logger.error(f"MEMORY SETTINGS ERROR: {e}")
        return jsonify(error=str(e)), 500
