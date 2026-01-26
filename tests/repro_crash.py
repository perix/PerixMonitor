
import requests
import sys

# Portfolio ID from previous logs/context
PORTFOLIO_ID = "580964f6-88eb-48f7-9237-e60cd2dbfff2" 
API_URL = f"http://localhost:5328/api/dashboard/history?portfolio_id={PORTFOLIO_ID}"

try:
    print(f"Requesting: {API_URL}")
    r = requests.get(API_URL, timeout=5)
    print(f"Status: {r.status_code}")
    if r.status_code != 200:
        print(f"Body: {r.text}")
except Exception as e:
    print(f"Failed: {e}")
