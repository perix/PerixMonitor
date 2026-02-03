
from flask import jsonify, request
from supabase_client import get_supabase_client
from logger import logger
import traceback

def register_settings_routes(app):

    @app.route('/api/settings/ai', methods=['GET', 'OPTIONS'])
    def get_ai_config():
        """
        Retrieves the AI/OpenAI configuration from app_config table.
        Uses Service Role, so it bypasses RLS.
        """
        try:
            supabase = get_supabase_client()
            res = supabase.table('app_config').select('value').eq('key', 'openai_config').limit(1).execute()
            
            if not res.data:
                # Return defaults or empty object if not found
                return jsonify({
                    "model": "gpt-4o-mini",
                    "temperature": 0.7,
                    "max_tokens": 1000,
                    # ... other defaults can be handled by frontend if missing
                })
            
            return jsonify(res.data[0]['value'])
            
        except Exception as e:
            logger.error(f"GET SETTINGS ERROR: {str(e)}")
            return jsonify(error=str(e)), 500

    @app.route('/api/settings/ai', methods=['POST', 'OPTIONS'])
    def save_ai_config():
        """
        Saves the AI/OpenAI configuration to app_config table.
        Uses Service Role, so it bypasses RLS.
        """
        try:
            config_data = request.json
            if not config_data:
                return jsonify(error="No config data provided"), 400

            supabase = get_supabase_client()
            
            # Upsert
            res = supabase.table('app_config').upsert({
                "key": "openai_config",
                "value": config_data,
                "updated_at": "now()"
            }).execute()
            
            # Check for success (res.data check might be list or dict depending on lib version, usually list of inserted)
            # if res.data...
            
            return jsonify(success=True, message="Configuration saved")
            
        except Exception as e:
            logger.error(f"SAVE SETTINGS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
