
from flask import jsonify, request
from logger import logger
import traceback
import os
import requests

def register_settings_routes(app):

    @app.route('/api/settings/ai', methods=['GET', 'OPTIONS'])
    def get_ai_config():
        """
        Retrieves the AI/OpenAI configuration from app_config table.
        Uses direct HTTP to bypass RLS with opaque tokens.
        """
        try:
            if request.method == 'OPTIONS':
                return jsonify(status="ok"), 200

            supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            
            if not supabase_url or not service_key:
                # Return defaults if no credentials
                return jsonify({
                    "model": "gpt-4o-mini",
                    "temperature": 0.7,
                    "max_tokens": 1000,
                })
            
            rest_url = f"{supabase_url}/rest/v1/app_config"
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.get(
                f"{rest_url}?key=eq.openai_config&select=value",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0 and data[0].get('value'):
                    return jsonify(data[0]['value'])
            
            # Return defaults if not found
            return jsonify({
                "model": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 1000,
            })
            
        except Exception as e:
            logger.error(f"GET SETTINGS ERROR: {str(e)}")
            return jsonify(error=str(e)), 500

    @app.route('/api/settings/ai', methods=['POST', 'OPTIONS'])
    def save_ai_config():
        """
        Saves the AI/OpenAI configuration to app_config table.
        Uses direct HTTP to bypass RLS with opaque tokens.
        """
        try:
            if request.method == 'OPTIONS':
                return jsonify(status="ok"), 200

            config_data = request.json
            if not config_data:
                return jsonify(error="No config data provided"), 400

            supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            
            if not supabase_url or not service_key:
                return jsonify(error="Missing Supabase credentials"), 500
            
            rest_url = f"{supabase_url}/rest/v1/app_config"
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=representation"
            }
            
            # Upsert
            response = requests.post(
                rest_url,
                headers=headers,
                json={
                    "key": "openai_config",
                    "value": config_data
                },
                timeout=10
            )
            
            if response.status_code not in [200, 201]:
                logger.error(f"SAVE SETTINGS ERROR: HTTP {response.status_code} - {response.text}")
                return jsonify(error=f"Database error: {response.status_code}"), 500
            
            return jsonify(success=True, message="Configuration saved")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"SAVE SETTINGS ERROR (Network): {str(e)}")
            return jsonify(error=str(e)), 500
        except Exception as e:
            logger.error(f"SAVE SETTINGS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
