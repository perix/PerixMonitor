
import os
import sys
from collections import Counter
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("db_check")

# Mock supabase client if not available, or import
try:
    sys.path.append(os.path.join(os.getcwd(), "api"))
    from supabase_client import get_supabase_client
except ImportError:
    print("Could not import supabase_client. Ensure you run this from project root.")
    sys.exit(1)

def check_duplicates():
    supabase = get_supabase_client()
    
    # Check ASSETS table
    print("--- Checking ASSETS Table ---")
    try:
        # Fetch all ISINs
        res = supabase.table('assets').select("isin, name, id").execute()
        assets = res.data
        
        isin_counts = Counter([a['isin'] for a in assets])
        duplicates = {k: v for k, v in isin_counts.items() if v > 1}
        
        if duplicates:
            print(f"WARNING: Found {len(duplicates)} duplicate ISINs in 'assets' table!")
            for isin, count in duplicates.items():
                print(f"  - {isin}: {count} copies")
                # List details
                dupes = [a for a in assets if a['isin'] == isin]
                for d in dupes:
                    print(f"    ID: {d['id']}, Name: {d['name']}")
        else:
            print("SUCCESS: No duplicate ISINs found in 'assets' table. Assets are effectively shared/normalized.")
            
    except Exception as e:
        print(f"Error checking assets: {e}")

    # Check PRICES table
    print("\n--- Checking ASSET_PRICES Table ---")
    try:
        # We can't fetch all prices easily if huge, but let's check a sample or count
        # Just check if prices are linked to ISIN (which they are by definition in code)
        # We want to see if we have duplicate prices for same ISIN/Date/Source? (Schema should prevent)
        
        # Taking a sample ISIN from assets
        if assets:
            sample_isin = assets[0]['isin']
            print(f"Checking prices for sample ISIN: {sample_isin}")
            res = supabase.table('asset_prices').select("*").eq('isin', sample_isin).execute()
            print(f"Found {len(res.data)} price entries for {sample_isin}.")
            
            # Check for dupes in sample
            keys = [f"{p['date']}_{p['source']}" for p in res.data]
            key_counts = Counter(keys)
            dupe_keys = {k: v for k, v in key_counts.items() if v > 1}
            if dupe_keys:
                 print(f"WARNING: Duplicate prices found for same date/source for {sample_isin}!")
            else:
                 print("SUCCESS: No duplicate prices for sample ISIN.")

    except Exception as e:
         print(f"Error checking prices: {e}")

if __name__ == "__main__":
    check_duplicates()
