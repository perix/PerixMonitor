import sys
import os
import json
from datetime import datetime

# Add api to path
sys.path.append(os.path.join(os.getcwd(), 'api'))

from supabase_client import get_supabase_client
from finance import xirr

def inspect_db():
    print("--- INSPECTING DB TRANSACTIONS ---")
    isin = "FR0013393329" # H2O MULTIBONDS
    
    supabase = get_supabase_client()
    
    # 1. Get Asset ID
    res_asset = supabase.table('assets').select('id, name').eq('isin', isin).execute()
    if not res_asset.data:
        print(f"Asset {isin} not found in DB!")
        return
        
    asset_id = res_asset.data[0]['id']
    print(f"Asset Found: {asset_id} ({res_asset.data[0]['name']})")
    
    # 2. Get Transactions
    res_trans = supabase.table('transactions').select('*').eq('asset_id', asset_id).execute()
    
    transactions = res_trans.data
    print(f"Found {len(transactions)} transactions:")
    
    total_qty = 0
    total_invested = 0
    flows = []
    
    for t in transactions:
        print(f" - [{t['date']}] {t['type']} Qty: {t['quantity']} @ {t['price_eur']}€")
        
        q = float(t['quantity'])
        p = float(t['price_eur'])
        val = q * p
        
        if t['type'] == 'BUY':
            total_qty += q
            total_invested += val
            flows.append({"date": datetime.fromisoformat(t['date'].replace('Z','')), "amount": -val})
        else:
            total_qty -= q
            # total_invested logic depends on method, but for net flow:
            total_invested -= val
            flows.append({"date": datetime.fromisoformat(t['date'].replace('Z','')), "amount": val})

    print(f"\nTotal Qty: {total_qty}")
    print(f"Total Net Invested (Cash Out): {total_invested}")
    
    # 3. Get Latest Price (to simulate full calc)
    from price_manager import get_latest_price
    lp = get_latest_price(isin)
    print(f"\nLatest Price in DB: {lp}")
    
    if lp:
        current_val = total_qty * float(lp['price'])
        print(f"Current Value ({lp['price']}): {current_val}")
        
        flows.append({"date": datetime.now(), "amount": current_val})
        
        res_xirr = xirr(flows)
        print(f"\n[DB DATA XIRR] Result: {res_xirr * 100 if res_xirr else 'Error'}%")

if __name__ == "__main__":
    inspect_db()
