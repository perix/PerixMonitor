from flask import Blueprint, request, jsonify
from price_manager import get_price_history
from db_helper import execute_request
from logger import logger
import traceback

prices_bp = Blueprint('prices', __name__)

@prices_bp.route('/api/asset-prices', methods=['GET'])
def get_asset_prices_route():
    """
    API endpoint to retrieve asset price history.
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
            logger.debug(f"[PRICES] API called: portfolio_id={portfolio_id}, asset_id={asset_id}")

        # Need to find the ISIN for this asset_id to call get_price_history
        res = execute_request('assets', 'GET', params={
            'select': 'isin',
            'id': f'eq.{asset_id}'
        })
        
        if res and res.status_code == 200:
            assets_data = res.json()
            if not assets_data:
                 return jsonify(error="Asset non trovato"), 404
            isin = assets_data[0].get('isin')
        else:
             return jsonify(error="Errore nel recupero ISIN dell'asset"), 500

        if not isin:
             return jsonify(error="Asset senza ISIN"), 400

        # Fetch history
        days = request.args.get('days', type=int)
        history = get_price_history(isin, days=days, portfolio_id=portfolio_id)
        
        # Sort history by date descending
        history.sort(key=lambda x: x.get('date', ''), reverse=True)

        return jsonify(prices=history)

    except Exception as e:
        logger.error(f"[PRICES] Route error: {e}")
        logger.error(traceback.format_exc())
        return jsonify(error=str(e)), 500

@prices_bp.route('/api/asset-prices/sync', methods=['POST'])
def sync_asset_prices_route():
    """
    Syncs asset prices (batch updates and deletions).
    Expects: { 
        "isin": "...", 
        "updates": [ {old_date, old_source, new_date, new_source, new_price} ],
        "deletions": [ {date, source} ] 
    }
    """
    try:
        data = request.json
        isin = data.get('isin')
        updates = data.get('updates', [])
        deletions = data.get('deletions', [])

        if not isin:
            return jsonify(error="Parametro ISIN mancante"), 400

        from db_helper import delete_table, upsert_table
        
        # 1. Process Deletions
        for d in deletions:
            date = d.get('date')
            source = d.get('source')
            if date and source:
                success = delete_table('asset_prices', {'isin': isin, 'date': date, 'source': source})
                if not success:
                    logger.warning(f"[PRICES_SYNC] Failed to delete: {isin} {date} {source}")

        # 2. Process Updates
        for u in updates:
            old_date = u.get('old_date')
            old_source = u.get('old_source')
            new_date = u.get('new_date')
            new_source = u.get('new_source')
            new_price = u.get('new_price')

            if not all([old_date, old_source, new_date, new_source, new_price is not None]):
                continue

            # If date or source changed, we must delete the old record first (PK change)
            if old_date != new_date or old_source != new_source:
                delete_table('asset_prices', {'isin': isin, 'date': old_date, 'source': old_source})
            
            # Upsert the new data
            upsert_table('asset_prices', {
                'isin': isin,
                'date': new_date,
                'source': new_source,
                'price': float(new_price)
            }, on_conflict='isin, date, source')

        # 3. Ricalcola il trend dell'asset dopo le modifiche
        from price_manager import update_asset_trend
        update_asset_trend(isin)

        return jsonify(message="Sincronizzazione completata con successo")

    except Exception as e:
        logger.error(f"[PRICES_SYNC] Route error: {e}")
        logger.error(traceback.format_exc())
        return jsonify(error=f"Errore interno: {str(e)}"), 500
