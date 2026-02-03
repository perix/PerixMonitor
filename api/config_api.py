
from flask import Blueprint, request, jsonify
from supabase_client import get_supabase_client
from logger import logger

config_bp = Blueprint('config_bp', __name__)

@config_bp.route('/api/config/assets', methods=['GET'])
def get_asset_config():
    try:
        supabase = get_supabase_client()
        res = supabase.table('app_config').select('value').eq('key', 'asset_settings').execute()
        
        default_settings = {"priceVariationThreshold": 0.1}
        
        if res.data and len(res.data) > 0:
            return jsonify(res.data[0]['value'])
        else:
            return jsonify(default_settings)
    except Exception as e:
        logger.error(f"Failed to fetch asset config: {e}")
        return jsonify({"error": str(e)}), 500

@config_bp.route('/api/config/assets', methods=['POST', 'OPTIONS'])
def update_asset_config():
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        supabase = get_supabase_client()
        
        # Upsert configuration
        payload = {
            "key": "asset_settings",
            "value": data,
            "updated_at": "now()"
        }
        
        res = supabase.table('app_config').upsert(payload).execute()
        return jsonify({"message": "Settings updated", "data": data})

    except Exception as e:
        logger.error(f"Failed to update asset config: {e}")
        return jsonify({"error": str(e)}), 500
