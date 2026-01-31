
import sys
import os
from datetime import datetime
import numpy as np

# Add api to path
sys.path.append(os.path.join(os.getcwd(), 'api'))

from finance import xirr, get_tiered_mwr

def run_debug():
    print("--- DEBUG CALCULATION ---")
    
    # INPUTS FROM USER TABLE
    # Buy: 04/03/2024
    # Qty: 808.89
    # Price: 115.52
    qty = 808.89
    price_buy = 115.52
    date_buy_str = "2024-03-04"
    
    # Current: 31/01/2026
    # Price: 153.56
    price_curr = 153.56
    date_curr_str = "2026-01-31" # User's table date
    
    # 1. Calculate Amounts
    invested = qty * price_buy
    current_val = qty * price_curr
    
    print(f"Qty: {qty}")
    print(f"Buy Date: {date_buy_str}, Price: {price_buy}")
    print(f"Invested Amount: {invested} (negative flow)")
    print(f"Curr Date: {date_curr_str}, Price: {price_curr}")
    print(f"Current Value: {current_val} (positive flow)")
    
    # 2. XIRR Manual Calculation (Clean Dates)
    date_buy = datetime.fromisoformat(date_buy_str)
    date_curr = datetime.fromisoformat(date_curr_str)
    
    flows_manual = [
        {"date": date_buy, "amount": -invested},
        {"date": date_curr, "amount": current_val}
    ]
    
    res_manual = xirr(flows_manual)
    print(f"\n[MANUAL XIRR] Result: {res_manual * 100:.4f}%")
    
    # 3. Simulate App Logic (datetime.now)
    # The app uses datetime.now() for the 'current' leg in get_tiered_mwr
    # Let's say run at 17:49 today
    date_now = datetime.now()
    
    print(f"\n[APP SIMULATION] Using datetime.now(): {date_now}")
    
    flows_app = [
        {"date": date_buy, "amount": -invested} # Transaction Date usually has time 00:00:00 or from DB
    ]
    
    # Calling get_tiered_mwr
    # It appends current value with end_date = datetime.now()
    mwr_val, mwr_type = get_tiered_mwr(flows_app, current_val)
    print(f"[APP LOGIC] Result: {mwr_val}% ({mwr_type})")
    
    # 4. Check sensitivity to time
    # What if date_buy had a time? Usually ISO from DB
    
    # 5. Check if 'invested' logic in dashboard differs
    # Dashboard: holdings[isin]["cost"] += (qty * price)
    # then cash_flows.append({"date": ..., "amount": - (qty * price)})
    # Exact same math.

if __name__ == "__main__":
    run_debug()
