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

    @app.route('/api/assets/<isin>/external', methods=['GET'])
    def get_external_asset_info(isin):
        """Analisi del certificato integrata in PerixMonitor (ex proxy verso il servizio
        esterno). Cache-first: se l'ISIN è già in DB serve la cache aggiornando i prezzi
        live; altrimenti estrae dal web (LLM + web_search), calcola il Worst-Of e
        ARRICCHISCE il DB salvando il nuovo certificato."""
        try:
            from cert_analyzer import analyze_certificate
            import cert_db

            result = analyze_certificate(isin)

            if result.get('error'):
                return jsonify(result), 502

            # Salva su DB solo i risultati freschi (non quelli già serviti da cache)
            if not result.get('from_cache'):
                try:
                    cert_db.save_analysis(result)
                    result['from_cache'] = False
                except Exception as e_save:
                    logger.error(f"Errore salvataggio certificato {isin}: {e_save}")

            return jsonify(result)
        except Exception as e:
            logger.error(f"Error analyzing certificate {isin}: {e}")
            return jsonify(error=str(e)), 500
