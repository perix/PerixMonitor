
import sys
import os
import json

# Add api to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api')))

from supabase_client import get_supabase_client

def check_asset_details():
    supabase = get_supabase_client()
    target_isin = "LU0733673288"
    
    print(f"Checking asset: {target_isin}")
    
    # 1. Fetch asset row
    res = supabase.table('assets').select("id, name, metadata").eq('isin', target_isin).execute()
    
    if not res.data:
        print("❌ Asset not found.")
        return

    asset = res.data[0]
    print(f"DB Name Column: {asset['name']}")
    
    meta = asset.get('metadata')
    if meta:
        print("Metadata Keys found:", meta.keys())
        # Print potential name fields
        print(f"Meta 'longName': {meta.get('longName')}")
        print(f"Meta 'shortName': {meta.get('shortName')}")
        print(f"Meta 'profile': {json.dumps(meta.get('profile'), indent=2)}")
        print(f"Meta 'identifiers': {json.dumps(meta.get('identifiers'), indent=2)}")
        print(f"Full Metadata Keys: {list(meta.keys())}")
    else:
        print("❌ No Metadata found.")

if __name__ == "__main__":
    check_asset_details()
