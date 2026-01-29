import os
import sys
from dotenv import load_dotenv

if os.path.exists('.env.local'):
    load_dotenv('.env.local')

from supabase_client import get_supabase_client

def debug():
    supabase = get_supabase_client()
    
    print("--- PORTFOLIOS ---")
    res_p = supabase.table('portfolios').select('*').execute()
    for p in res_p.data:
        print(f"ID: {p['id']}, Name: {p['name']}, Keys: {list(p.keys())}")
        # Check if settings has cash
        settings = p.get('settings')
        if settings:
            print(f"  Settings: {settings}")

    print("\n--- ASSETS (Top 20) ---")
    res_a = supabase.table('assets').select('isin, name, asset_class').limit(20).execute()
    for a in res_a.data:
        print(f"ISIN: {a['isin']}, Name: {a['name']}, Type: {a['asset_class']}")

if __name__ == "__main__":
    debug()
