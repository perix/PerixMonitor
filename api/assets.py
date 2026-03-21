from flask import jsonify
from asset_provider import AssetProvider
from logger import logger
import os
import requests
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

    @app.route('/api/assets/<isin>/external', methods=['GET'])
    def get_external_asset_info(isin):
        try:
            api_key = os.getenv('API_KEY_AUTHORIZED')
            if not api_key:
                return jsonify(error="API key non configurata"), 500
            
            headers = {"X-API-KEY": api_key.strip()}
            url = f"https://analisicertificati.vercel.app/api/asset/{isin}"
            response = requests.get(url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Error external API for {isin}: {response.text}")
                return jsonify(error=f"Errore API esterna: {response.status_code}"), response.status_code
                
            return jsonify(response.json())
        except Exception as e:
            logger.error(f"Error fetching external API for {isin}: {e}")
            return jsonify(error=str(e)), 500
