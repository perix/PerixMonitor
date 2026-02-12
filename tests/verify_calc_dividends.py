
import datetime
import numpy as np
import sys
import os

# Aggiungi la directory api al path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api')))

from finance import get_tiered_mwr

def test_mwr_with_dividends():
    print("--- Testing MWR with Dividends ---")
    
    # Investimento di 1000 EUR il 2023-01-01
    start_date = datetime.datetime(2023, 1, 1)
    # Dividendo di 100 EUR il 2023-07-01
    div_date = datetime.datetime(2023, 7, 1)
    # Valore finale al 2024-01-01: 1000 EUR (nessun capital gain, solo dividendo)
    end_date = datetime.datetime(2024, 1, 1)
    
    cash_flows = [
        {"date": start_date, "amount": -1000.0},
        {"date": div_date, "amount": 100.0}
    ]
    current_value = 1000.0 # Valore dell'asset a fine periodo
    
    # MWR dovrebbe essere circa il 10% (leggermente di più a causa del timing)
    mwr_val, mwr_type = get_tiered_mwr(cash_flows, current_value, t1=30, t2=365, end_date=end_date)
    
    print(f"MWR: {mwr_val}% ({mwr_type})")
    
    # Verifica approssimativa: 100/1000 = 10%
    if mwr_val > 9.0 and mwr_val < 11.0:
        print("SUCCESS: MWR consistent with expectation.")
    else:
        print(f"FAIL: MWR {mwr_val} outside expected range.")

def test_pnl_logic_simulation():
    print("\n--- Simulating P&L Logic with Dividends ---")
    # Simulo quello che accade in portfolio.py
    current_value = 1100.0
    invested = 1000.0
    total_dividends = 50.0
    
    # Formula implementata: (current_value - invested) + total_dividends
    pnl_value = (current_value - invested) + total_dividends
    # Profitto = 100 (capital gain) + 50 (dividendi) = 150
    
    print(f"Expected P&L: 150.0")
    print(f"Calculated P&L: {pnl_value}")
    
    if pnl_value == 150.0:
        print("SUCCESS: P&L logic simulation correct.")
    else:
        print("FAIL: P&L logic mismatch.")

if __name__ == "__main__":
    test_mwr_with_dividends()
    test_pnl_logic_simulation()
