
from flask import Blueprint, request, jsonify
from db_helper import query_table, update_table
from logger import logger

config_bp = Blueprint('config_bp', __name__)

@config_bp.route('/api/config/assets', methods=['GET'])
def get_asset_config():
    """
    Retrieves asset configuration (priceVariationThreshold) from Portfolio Settings.
    Requires 'portfolio_id' query param.
    """
    try:
        portfolio_id = request.args.get('portfolio_id')
        default_settings = {"priceVariationThreshold": 0.1}

        if not portfolio_id:
            # Fallback for legacy calls (though we should migrate frontend)
            # We can't easily guess which portfolio. Return default.
            logger.warning("get_asset_config: No portfolio_id provided. Returning defaults.")
            return jsonify(default_settings)
        
        # Fetch settings from portfolio
        res = query_table('portfolios', 'settings', {'id': portfolio_id})
        
        if res and len(res) > 0:
            settings = res[0].get('settings') or {}
            # Merge with defaults to ensure keys exist
            merged = default_settings.copy()
            merged.update(settings)
            return jsonify(merged)
            
        return jsonify(default_settings)
        
    except Exception as e:
        logger.error(f"Failed to fetch asset config: {e}")
        return jsonify({"error": str(e)}), 500

@config_bp.route('/api/config/assets', methods=['POST', 'OPTIONS'])
def update_asset_config():
    """
    Updates asset configuration in Portfolio Settings.
    """
    try:
        if request.method == 'OPTIONS':
             return jsonify(status="ok"), 200
             
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        portfolio_id = data.get('portfolio_id') or request.args.get('portfolio_id')
        
        if not portfolio_id:
            return jsonify({"error": "portfolio_id is required"}), 400
            
        # Clean data (remove ID if present)
        settings_to_update = {k: v for k, v in data.items() if k != 'portfolio_id'}
        
        # 1. Fetch current settings to merge (JSONB patch via code)
        current_settings = {}
        res = query_table('portfolios', 'settings', {'id': portfolio_id})
        if res and len(res) > 0:
            current_settings = res[0].get('settings') or {}
            
        # 2. Merge
        current_settings.update(settings_to_update)
        
        # 3. Update
        if update_table('portfolios', {'settings': current_settings}, {'id': portfolio_id}):
            return jsonify({"message": "Settings updated", "data": current_settings})
        else:
            return jsonify({"error": "Failed to save settings to portfolio"}), 500

    except Exception as e:
        logger.error(f"Failed to update asset config: {e}")
        return jsonify({"error": str(e)}), 500

@config_bp.route('/api/config/asset-settings', methods=['GET'])
def get_asset_specific_settings():
    """
    Fetches settings for a specific asset in a portfolio.
    """
    try:
        portfolio_id = request.args.get('portfolio_id')
        asset_id = request.args.get('asset_id')
        
        if not portfolio_id or not asset_id:
            return jsonify({"error": "portfolio_id and asset_id are required"}), 400
            
        res = query_table('portfolio_asset_settings', 'settings', {
            'portfolio_id': portfolio_id,
            'asset_id': asset_id
        })
        
        if res and len(res) > 0:
            return jsonify(res[0].get('settings') or {})
            
        return jsonify({})
        
    except Exception as e:
        logger.error(f"Failed to fetch asset specific settings: {e}")
        return jsonify({"error": str(e)}), 500

@config_bp.route('/api/config/asset-settings', methods=['POST', 'OPTIONS'])
def update_asset_specific_settings():
    """
    Updates settings for a specific asset in a portfolio.
    """
    try:
        if request.method == 'OPTIONS':
            return jsonify(status="ok"), 200
            
        data = request.json
        portfolio_id = data.get('portfolio_id')
        asset_id = data.get('asset_id')
        settings = data.get('settings')
        
        if not portfolio_id or not asset_id or settings is None:
            return jsonify({"error": "portfolio_id, asset_id and settings are required"}), 400
            
        # 1. Fetch existing settings to merge
        current_data = {}
        res = query_table('portfolio_asset_settings', 'id, settings', {
            'portfolio_id': portfolio_id,
            'asset_id': asset_id
        })
        
        if res and len(res) > 0:
            row_id = res[0]['id']
            current_settings = res[0].get('settings') or {}
            current_settings.update(settings)
            
            if update_table('portfolio_asset_settings', {'settings': current_settings}, {'id': row_id}):
                return jsonify({"success": True, "settings": current_settings})
        else:
            # If no row exists, we might need to create it? 
            # But normally rows are created during color assignment/sync.
            # Let's use upsert or just return error if color is mandatory.
            # Color manager handles color assignment, so a row should exist if the asset is in the portfolio.
            # However, for robustness:
            from db_helper import upsert_table
            new_row = {
                "portfolio_id": portfolio_id,
                "asset_id": asset_id,
                "settings": settings,
                "color": "#888888" # Default if missing
            }
            if upsert_table('portfolio_asset_settings', new_row, on_conflict='portfolio_id, asset_id'):
                return jsonify({"success": True, "settings": settings})
                
        return jsonify({"error": "Failed to update asset settings"}), 500
        
    except Exception as e:
        logger.error(f"Failed to update asset specific settings: {e}")
        return jsonify({"error": str(e)}), 500
