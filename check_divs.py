
import os
import requests
import json
from dotenv import load_dotenv

# Load env from .env or .env.local
load_dotenv('.env')
load_dotenv('.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# 1. Check Portfolios
print("\n--- PORTFOLIOS ---")
resp = requests.get(f"{url}/rest/v1/portfolios?select=id,name", headers=headers)
print(resp.status_code, resp.text)

# 2. Check Dividends
print("\n--- DIVIDENDS (Latest 5) ---")
resp = requests.get(f"{url}/rest/v1/dividends?select=*,assets(isin)&limit=5&order=date.desc", headers=headers)
print(resp.status_code, resp.text)

# 3. Check specific Portfolio stats (placeholder for testing)
# If we find a portfolio, we can test calculations here.
