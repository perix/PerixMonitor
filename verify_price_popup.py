
import requests
import pandas as pd
import sys
import os
from datetime import datetime, timedelta

# Add api to path to use backend modules directly for seeding
sys.path.append(os.path.join(os.getcwd(), 'api'))

from supabase_client import get_supabase_client

def test_verification():
    print("--- STARTING VERIFICATION ---")
    
    isin = "IT_TEST_POPUP_01"
    old_price = 100.0
    new_price = 110.0 # +10%
    
    # 1. Seed Initial Price
    print(f"1. Seeding old price {old_price} for {isin}...")
    supabase = get_supabase_client()
    
    # Ensure asset exists (optional, but good for completeness, though price_manager might not enforce it strict FK depending on schema)
    # Schema probably enforces FK on asset_id? No, asset_prices has ISIN.
    # Let's check api/price_manager.py -> it upserts based on `isin`.
    # But usually `asset_prices` might link to assets? api/index.py deletes `asset_prices` by ISIN.
    # Let's just try inserting price.
    
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    res = supabase.table('asset_prices').upsert({
        "isin": isin,
        "price": old_price,
        "date": yesterday,
        "source": "VerificationSeed"
    }, on_conflict='isin, date, source').execute()
    
    print("   Seeded.")
    
    # Verify Seed
    check = supabase.table('asset_prices').select('*').eq('isin', isin).execute()
    print(f"   Seed Verification: {len(check.data)} records found.")
    if check.data:
        print(f"   Sample: {check.data[0]}")
    
    # 2. Create Excel
    print("2. Creating Excel with new price...")
    data = {
        "Descrizione Titolo": ["Test Popup Asset"],
        "Codice ISIN": [isin],
        "Qta": [None],
        "Divisa": ["EUR"],
        "Prezzo Medio Carico": [None], 
        "Data": [datetime.now().strftime("%d/%m/%Y")],
        "Operazione": [None], 
        "Prezzo Op": [None], 
        "Prezzo Corrente": [new_price],
        "Tipologia": ["Test"]
    }
    df = pd.DataFrame(data)
    filename = "verify_popup.xlsx"
    df.to_excel(filename, index=False)
    print(f"   Created {filename}")
    
    # 3. Call API
    print("3. Sending to API...")
    url = "http://localhost:5328/api/ingest"
    # Use a dummy portfolio id (must be valid UUID format usually)
    portfolio_id = "00000000-0000-0000-0000-000000000000" 
    
    with open(filename, 'rb') as f:
        files = {'file': f}
        data_payload = {'portfolio_id': portfolio_id}
        try:
            response = requests.post(url, files=files, data=data_payload)
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                json_data = response.json()
                pv = json_data.get('price_variations')
                if pv:
                    print(f"SUCCESS: Received {len(pv)} variations.")
                    item = pv[0]
                    print(f"   Asset: {item['name']}")
                    print(f"   Variation: {item['variation_pct']:.2f}% (Expected +10.00%)")
                    
                    if abs(item['variation_pct'] - 10.0) < 0.1:
                        print("   VERIFICATION PASSED!")
                    else:
                        print("   VERIFICATION FAILED: Calculation mismatch.")
                else:
                    print("FAILURE: price_variations missing.")
                    print("Delta:", json_data.get('delta'))
                    print("Prices:", json_data.get('prices'))
            else:
                print("Server Error:", response.text)
        except Exception as e:
            print("Exception:", e)

if __name__ == "__main__":
    test_verification()
