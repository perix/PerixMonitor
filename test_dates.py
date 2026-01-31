import pandas as pd
from datetime import datetime

def test_date_parsing():
    dates = [
        "01/02/2023", # Could be Jan 2nd or Feb 1st
        "13/01/2023", # Definitely Jan 13th (if dd/mm)
        datetime(2023, 3, 4), # Already datetime
        "2023-04-05", # ISO
        "Invalid"
    ]

    print("--- Testing default pd.to_datetime ---")
    for d in dates:
        try:
            res = pd.to_datetime(d)
            print(f"Input: {d} -> {res} (Day: {res.day}, Month: {res.month})")
        except:
            print(f"Input: {d} -> Error")

    print("\n--- Testing pd.to_datetime with dayfirst=True ---")
    for d in dates:
        try:
            res = pd.to_datetime(d, dayfirst=True)
            print(f"Input: {d} -> {res} (Day: {res.day}, Month: {res.month})")
        except:
            print(f"Input: {d} -> Error")

if __name__ == "__main__":
    test_date_parsing()
