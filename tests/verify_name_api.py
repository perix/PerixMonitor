
import requests
import sys

# Portfolio ID from previous logs
PORTFOLIO_ID = "580964f6-88eb-48f7-9237-e60cd2dbfff2" 
API_URL = f"http://localhost:5328/api/dashboard/history?portfolio_id={PORTFOLIO_ID}"

try:
    print(f"Requesting: {API_URL}")
    r = requests.get(API_URL, timeout=5)
    
    if r.status_code == 200:
        data = r.json()
        series = data.get('series', [])
        found_target = False
        
        for s in series:
            if "LU0733673288" in s['isin']:
                found_target = True
                print(f"✅ Found series for LU0733673288")
                print(f"Name returned by API: '{s['name']}'")
                
                if s['name'] == "LU0733673288":
                    print("❌ FAIL: Name is still the ISIN.")
                else:
                    print("✅ SUCCESS: Name is descriptive.")
                    
        if not found_target:
             print("⚠️ Target ISIN not found in response.")
    else:
        print(f"❌ Error: {r.status_code}")

except Exception as e:
    print(f"Failed: {e}")
