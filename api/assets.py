from flask import jsonify
from asset_provider import AssetProvider
from logger import logger

def register_assets_routes(app):
    provider = AssetProvider()

    @app.route('/api/assets/<isin>', methods=['GET'])
    def get_asset_details(isin):
        try:
            data = provider.get_asset_info(isin)
            return jsonify(data)
        except Exception as e:
            logger.error(f"Error fetching asset {isin}: {e}")
            return jsonify(error=str(e)), 500

    @app.route('/api/assets/<isin>/history', methods=['GET'])
    def get_asset_history(isin):
        try:
            # Optional: accept start_date
            history = provider.get_historical_data(isin)
            return jsonify(history=history)
        except Exception as e:
            logger.error(f"Error fetching history {isin}: {e}")
            return jsonify(error=str(e)), 500
