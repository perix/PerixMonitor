
import requests
import os

url = "http://localhost:5328/api/ingest"
file_path = "test_price_update.xlsx"

# Use a valid portfolio ID from your DB (e.g., from logs or previous context)
# I'll use a dummy one, the backend just needs it for context, or checks existance.
# Since I mocked the check in my mind, let's use a random valid UUID if possible, or one I see in logs.
# Log showed: a3f493c6-753a-464b-b53f-98e4a0ef3809
portfolio_id = "a3f493c6-753a-464b-b53f-98e4a0ef3809" 

with open(file_path, 'rb') as f:
    files = {'file': f}
    data = {'portfolio_id': portfolio_id}
    try:
        response = requests.post(url, files=files, data=data)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            json_data = response.json()
            # Check price_variations
            pv = json_data.get('price_variations')
            if pv:
                print("SUCCESS: price_variations found!")
                for item in pv:
                    print(f" - {item['name']} ({item['isin']}): {item['old_price']} -> {item['new_price']} ({item['variation_pct']:.2f}%)")
            else:
                print("FAILURE: price_variations NOT found in response.")
                print("Keys:", json_data.keys())
                print("Delta:", json_data.get('delta'))
        else:
            print("Error:", response.text)
    except Exception as e:
        print("Exception:", e)
