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
