"""
Asset Movements Module.

Provides a modular, reusable function and API endpoint to retrieve
all movements (transactions + dividends/fees) for a specific asset
within a portfolio.

Endpoint: GET /api/asset-movements?portfolio_id=<uuid>&asset_id=<uuid>
"""

from flask import Blueprint, request, jsonify
from db_helper import execute_request
from logger import logger
import traceback

movements_bp = Blueprint('movements', __name__)


def get_asset_movements(portfolio_id: str, asset_id: str, debug_mode: bool = False) -> dict:
    """
    Retrieves all movements for a specific asset in a portfolio.
    Combines transactions (BUY/SELL) and dividends (DIVIDEND/EXPENSE)
    into a unified, date-sorted list.

    Args:
        portfolio_id: UUID of the portfolio
        asset_id: UUID of the asset
        debug_mode: If True, enables detailed logging

    Returns:
        dict with keys:
            - 'movements': list of movement dicts
            - 'error': error string if something went wrong (None on success)
    """
    try:
        if debug_mode:
            logger.debug(f"[MOVEMENTS] Fetching movements for asset_id={asset_id} in portfolio_id={portfolio_id}")

        movements = []

        # 1. Fetch Transactions (BUY/SELL)
        res_trans = execute_request('transactions', 'GET', params={
            'select': 'date,type,quantity,price_eur',
            'portfolio_id': f'eq.{portfolio_id}',
            'asset_id': f'eq.{asset_id}',
            'order': 'date.desc'
        })

        if res_trans and res_trans.status_code == 200:
            transactions = res_trans.json()
            if debug_mode:
                logger.debug(f"[MOVEMENTS] Fetched {len(transactions)} transactions")

            for t in transactions:
                try:
                    qty = float(t.get('quantity', 0))
                    price = float(t.get('price_eur', 0))
                    tx_type = t.get('type', 'BUY')

                    movements.append({
                        'date': t.get('date'),
                        'operation': 'Acquisto' if tx_type == 'BUY' else 'Vendita',
                        'quantity': qty,
                        'value': round(qty * price, 2)
                    })
                except (ValueError, TypeError) as e:
                    logger.error(f"[MOVEMENTS] Error parsing transaction: {e} | raw={t}")
                    continue
        elif res_trans:
            logger.error(f"[MOVEMENTS] Transactions fetch failed: HTTP {res_trans.status_code}")
        else:
            logger.error("[MOVEMENTS] Transactions fetch returned None response")

        # 2. Fetch Dividends/Fees (DIVIDEND/EXPENSE)
        res_divs = execute_request('dividends', 'GET', params={
            'select': 'date,type,amount_eur',
            'portfolio_id': f'eq.{portfolio_id}',
            'asset_id': f'eq.{asset_id}',
            'order': 'date.desc'
        })

        if res_divs and res_divs.status_code == 200:
            dividends = res_divs.json()
            if debug_mode:
                logger.debug(f"[MOVEMENTS] Fetched {len(dividends)} dividends/fees")

            for d in dividends:
                try:
                    amount = float(d.get('amount_eur', 0))
                    div_type = d.get('type', 'DIVIDEND')

                    if div_type == 'EXPENSE':
                        operation = 'Fee'
                    else:
                        operation = 'Cedola/Dividendo'

                    movements.append({
                        'date': d.get('date'),
                        'operation': operation,
                        'quantity': None,  # No quantity for dividends/fees
                        'value': round(amount, 2)
                    })
                except (ValueError, TypeError) as e:
                    logger.error(f"[MOVEMENTS] Error parsing dividend: {e} | raw={d}")
                    continue
        elif res_divs:
            logger.error(f"[MOVEMENTS] Dividends fetch failed: HTTP {res_divs.status_code}")
        else:
            logger.error("[MOVEMENTS] Dividends fetch returned None response")

        # 3. Sort by date descending (most recent first)
        movements.sort(key=lambda m: m.get('date') or '', reverse=True)

        if debug_mode:
            logger.debug(f"[MOVEMENTS] Total movements returned: {len(movements)}")

        return {'movements': movements, 'error': None}

    except Exception as e:
        logger.error(f"[MOVEMENTS] Unexpected error: {e}")
        logger.error(traceback.format_exc())
        return {'movements': [], 'error': str(e)}

def get_portfolio_movements(portfolio_id: str, start_date: str = None, end_date: str = None, include_dividends: bool = False, debug_mode: bool = False) -> dict:
    """
    Retrieves all movements for a portfolio, with optional date filtering.
    Combines transactions (BUY/SELL) and optionally dividends/fees into a unified, date-sorted list.

    Args:
        portfolio_id: UUID of the portfolio
        start_date: Optional start date (YYYY-MM-DD or ISO)
        end_date: Optional end date (YYYY-MM-DD or ISO)
        include_dividends: If True, includes DIVIDEND and EXPENSE
        debug_mode: If True, enables detailed logging

    Returns:
        dict with keys:
            - 'movements': list of movement dicts
            - 'error': error string if something went wrong (None on success)
    """
    try:
        if debug_mode:
            logger.debug(f"[PORTFOLIO_MOVEMENTS] Fetching movements for portfolio_id={portfolio_id}, start={start_date}, end={end_date}, divs={include_dividends}")

        movements = []

        # 1. Fetch Transactions (BUY/SELL) with asset metadata
        trans_params = {
            'select': 'date,type,quantity,price_eur,assets(isin,name,asset_class)',
            'portfolio_id': f'eq.{portfolio_id}',
            'order': 'date.desc'
        }
        if start_date:
            trans_params['date'] = f'gte.{start_date}'
        if end_date:
            if 'date' in trans_params:
                trans_params['date'] = [trans_params['date'], f'lte.{end_date}'] # This might need special string formatting for PostgREST
                # the db_helper handles lists as AND conditions if supported, but let's be safe: PostgREST AND syntax is &date=gte.x&date=lte.y
                # execute_request doesn't support list for same key natively in a simple dict unless handled. Let's filter in python if DB filter is tricky
                pass

        res_trans = execute_request('transactions', 'GET', params=trans_params)

        if res_trans and res_trans.status_code == 200:
            transactions = res_trans.json()
            if debug_mode:
                logger.debug(f"[PORTFOLIO_MOVEMENTS] Fetched {len(transactions)} candidate transactions")

            for t in transactions:
                t_date = t.get('date', '')
                
                # Manual date filtering to safely handle 'lte' / 'gte' without DB querystring quirks
                if start_date and t_date < start_date: continue
                if end_date and t_date > end_date + "T23:59:59": continue

                try:
                    qty = float(t.get('quantity', 0))
                    price = float(t.get('price_eur', 0))
                    tx_type = t.get('type', 'BUY')
                    asset_data = t.get('assets', {}) or {}

                    movements.append({
                        'date': t_date,
                        'isin': asset_data.get('isin', ''),
                        'description': asset_data.get('name', ''),
                        'asset_class': asset_data.get('asset_class', ''),
                        'type': 'Acquisto' if tx_type == 'BUY' else 'Vendita',
                        'quantity': qty,
                        'value': round(qty * price, 2)
                    })
                except (ValueError, TypeError) as e:
                    logger.error(f"[PORTFOLIO_MOVEMENTS] Error parsing transaction: {e} | raw={t}")
                    continue
        elif res_trans:
            logger.error(f"[PORTFOLIO_MOVEMENTS] Transactions fetch failed: HTTP {res_trans.status_code}")
        else:
            logger.error("[PORTFOLIO_MOVEMENTS] Transactions fetch returned None response")


        # 2. Fetch Dividends/Fees (DIVIDEND/EXPENSE) if requested
        if include_dividends:
            divs_params = {
                'select': 'date,type,amount_eur,assets(isin,name,asset_class)',
                'portfolio_id': f'eq.{portfolio_id}',
                'order': 'date.desc'
            }

            res_divs = execute_request('dividends', 'GET', params=divs_params)

            if res_divs and res_divs.status_code == 200:
                dividends = res_divs.json()
                if debug_mode:
                    logger.debug(f"[PORTFOLIO_MOVEMENTS] Fetched {len(dividends)} candidate dividends")

                for d in dividends:
                    d_date = d.get('date', '')
                    
                    if start_date and d_date < start_date: continue
                    if end_date and d_date > end_date + "T23:59:59": continue

                    try:
                        amount = float(d.get('amount_eur', 0))
                        div_type = d.get('type', 'DIVIDEND')
                        asset_data = d.get('assets', {}) or {}

                        if div_type == 'EXPENSE':
                            operation = 'Fee'
                        else:
                            operation = 'Cedola/Dividendo'

                        movements.append({
                            'date': d_date,
                            'isin': asset_data.get('isin', ''),
                            'description': asset_data.get('name', ''),
                            'asset_class': asset_data.get('asset_class', ''),
                            'type': operation,
                            'quantity': None,  # No quantity
                            'value': round(amount, 2)
                        })
                    except (ValueError, TypeError) as e:
                        logger.error(f"[PORTFOLIO_MOVEMENTS] Error parsing dividend: {e} | raw={d}")
                        continue
            elif res_divs:
                logger.error(f"[PORTFOLIO_MOVEMENTS] Dividends fetch failed: HTTP {res_divs.status_code}")
            else:
                logger.error("[PORTFOLIO_MOVEMENTS] Dividends fetch returned None response")

        # 3. Sort by date descending
        movements.sort(key=lambda m: m.get('date') or '', reverse=True)

        if debug_mode:
            logger.debug(f"[PORTFOLIO_MOVEMENTS] Total portfolio movements returned: {len(movements)}")

        return {'movements': movements, 'error': None}

    except Exception as e:
        logger.error(f"[PORTFOLIO_MOVEMENTS] Unexpected error: {e}")
        logger.error(traceback.format_exc())
        return {'movements': [], 'error': str(e)}




@movements_bp.route('/api/asset-movements', methods=['GET'])
def get_asset_movements_route():
    """
    API endpoint to retrieve asset movements.
    Query params: portfolio_id, asset_id
    """
    try:
        portfolio_id = request.args.get('portfolio_id')
        asset_id = request.args.get('asset_id')

        if not portfolio_id:
            return jsonify(error="Parametro portfolio_id mancante"), 400
        if not asset_id:
            return jsonify(error="Parametro asset_id mancante"), 400

        # Check debug mode for this portfolio
        from index import check_debug_mode
        from logger import configure_file_logging
        debug_mode = check_debug_mode(portfolio_id)
        configure_file_logging(debug_mode)

        if debug_mode:
            logger.debug(f"[MOVEMENTS] API called: portfolio_id={portfolio_id}, asset_id={asset_id}")

        result = get_asset_movements(portfolio_id, asset_id, debug_mode=debug_mode)

        if result['error']:
            return jsonify(error=result['error']), 500

        return jsonify(movements=result['movements'])

    except Exception as e:
        logger.error(f"[MOVEMENTS] Route error: {e}")
        logger.error(traceback.format_exc())
        return jsonify(error=f"Errore interno: {str(e)}"), 500

@movements_bp.route('/api/portfolio-movements', methods=['GET'])
def get_portfolio_movements_route():
    """
    API endpoint to retrieve all movements for a portfolio.
    Query params: portfolio_id, start_date, end_date, include_dividends
    """
    try:
        portfolio_id = request.args.get('portfolio_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        include_dividends = request.args.get('include_dividends', 'false').lower() == 'true'

        if not portfolio_id:
            return jsonify(error="Parametro portfolio_id mancante"), 400

        # Check debug mode
        from index import check_debug_mode
        from logger import configure_file_logging
        debug_mode = check_debug_mode(portfolio_id)
        configure_file_logging(debug_mode)

        if debug_mode:
            logger.debug(f"[PORTFOLIO_MOVEMENTS] API called: portfolio_id={portfolio_id}, start={start_date}, end={end_date}, divs={include_dividends}")

        result = get_portfolio_movements(
            portfolio_id=portfolio_id, 
            start_date=start_date, 
            end_date=end_date, 
            include_dividends=include_dividends, 
            debug_mode=debug_mode
        )

        if result['error']:
            return jsonify(error=result['error']), 500

        return jsonify(movements=result['movements'])

    except Exception as e:
        logger.error(f"[PORTFOLIO_MOVEMENTS] Route error: {e}")
        logger.error(traceback.format_exc())
        return jsonify(error=f"Errore interno: {str(e)}"), 500

