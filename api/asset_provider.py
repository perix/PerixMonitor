import logging
from datetime import datetime
from price_manager import get_latest_price, get_price_history

logger = logging.getLogger("perix_monitor")

class AssetProvider:
    """
    Provider for asset information and prices using internal DB.
    """
    def __init__(self):
        pass

    def get_asset_info(self, isin):
        """
        Fetches asset info from DB snapshots.
        """
        # logger.info(f"Fetching info for ISIN (DB): {isin}")
        
        # Default Structure
        asset_info = {
            "anagrafica": {
                "nome_strumento": isin, # We don't have name unless we query 'assets' table or use placeholder
                "isin": isin,
                "emittente": "N/A",
                "garante": "N/A",
                "mercato_quotazione": "Manual",
                "data_emissione": None,
                "data_scadenza": None,
                "sottostanti": []
            },
            "rating": {
                "rating_emittente_sp": "N/A",
                "rating_emittente_moodys": "N/A",
                "rating_emittente_fitch": "N/A",
                "livello_rischio_kid": "N/A"
            },
            "categoria": {
                "tipologia_acepi": "N/A",
                "protezione_capitale": "N/A",
                "barriera_premio": "N/A",
                "barriera_capitale": "N/A"
            },
            "ultimo_prezzo_chiusura": {
                "prezzo": 0,
                "valuta": "EUR",
                "data_riferimento": None,
                "fonte": "Manual Upload"
            },
            "cedole_staccate_ufficialmente": {
                "frequenza": "N/A",
                "importo_unitario_mensile": "N/A",
                "totale_premi_pagati_cumulati": "N/A",
                "elenco_cedole_pagate": []
            }
        }

        # Fetch Price from DB
        latest = get_latest_price(isin)
        if latest:
            asset_info['ultimo_prezzo_chiusura']['prezzo'] = float(latest['price'])
            asset_info['ultimo_prezzo_chiusura']['data_riferimento'] = latest['date']
            asset_info['ultimo_prezzo_chiusura']['fonte'] = latest['source']
        else:
            # logger.warning(f"No manual price found for {isin}")
            pass

        return {"asset_info": asset_info}

    def get_historical_data(self, isin, start_date=None):
        """
        Fetch historical price data from DB.
        """
        history = get_price_history(isin)
        # Format for frontend/recharts: {date, close}
        data = []
        for h in history:
            data.append({
                "date": h['date'],
                "close": float(h['price'])
            })
        return data
