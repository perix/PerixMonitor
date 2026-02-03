import requests
import os
from dotenv import load_dotenv

load_dotenv('.env.production.local')

base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") 
# Wait, for API calls we target the Next.js API, not Supabase directly.
# Production URL:
prod_url = "https://perix-monitor.vercel.app" # Guessed from deployment guide

print(f"Testing API against: {prod_url}")

def test_api_options():
    try:
        url = f"{prod_url}/api/settings/ai"
        print(f"Testing OPTIONS {url}...")
        res = requests.options(url)
        print(f"Status: {res.status_code}")
        print(f"Headers: {res.headers}")
        print(f"Allow: {res.headers.get('Allow')}")
    except Exception as e:
        print(f"Error: {e}")

def test_api_post():
    try:
        url = f"{prod_url}/api/settings/ai"
        print(f"Testing POST {url}...")
        res = requests.post(url, json={"test": "data"})
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_api_options()
    test_api_post()
