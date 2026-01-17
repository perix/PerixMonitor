import requests
import os
import json

# Fallback cache (in-memory for now, could be DB or Redis later)
ISIN_CACHE = {}

def resolve_isin(isin):
    """
    Resolve ISIN to a Ticker/Symbol using OpenFIGI.
    """
    if isin in ISIN_CACHE:
        return ISIN_CACHE[isin]

    api_key = os.environ.get('OPENFIGI_API_KEY')
    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['X-OPENFIGI-APIKEY'] = api_key

    url = 'https://api.openfigi.com/v3/mapping'
    payload = [{"idType": "ID_ISIN", "idValue": isin}]

    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            results = response.json()
            if results and 'data' in results[0]:
                # Heuristic: Prefer "Composite" or "Primary" listings in key markets (e.g., 'MI' for Milan)
                data = results[0]['data']
                
                # Logic to find best match:
                # 1. Look for marketSector="Equity" and exchCode="MI" (Milan) if Italian focus
                # 2. Look for composite FIGI
                
                best_match = None
                for d in data:
                    if d.get('exchCode') == 'MI':
                        best_match = d
                        break
                
                if not best_match: 
                    best_match = data[0] # Fallback to first

                result = {
                    "ticker": best_match.get('ticker'),
                    "name": best_match.get('name'),
                    "market": best_match.get('exchCode'),
                    "figi": best_match.get('figi')
                }
                ISIN_CACHE[isin] = result
                return result
            else:
                return None # No match found
        else:
            print(f"OpenFIGI Error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Exception resolving ISIN {isin}: {e}")
        return None
