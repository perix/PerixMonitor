
import unittest
import sys
import os

# Add api to path
sys.path.append(os.path.join(os.getcwd(), 'api'))

from ingest import calculate_delta

class TestIngestionLogic(unittest.TestCase):
    
    def test_rule_1_partial_sales_file(self):
        """
        Rule 1: If file contains ONLY sales rows, missing assets in DB should NOT be error/missing.
        """
        # DB has 2 assets
        db_holdings = {
            "ISIN1": {"qty": 100.0, "metadata": {}},
            "ISIN2": {"qty": 50.0, "metadata": {}}
        }
        
        # Excel has only ISIN1 (Selling 10)
        # We simulate what parse_portfolio_excel returns
        excel_data = [
            {
                "isin": "ISIN1",
                "quantity": 90.0, # Selling 10
                "operation": "Vendita",
                "op_price_eur": 10.0,
                "date": "2023-01-01"
            }
        ]
        
        # We expect ISIN2 to NOT be in the delta actions (ignored), or explicitly not "MISSING_FROM_UPLOAD"
        # If the logic assumes "Full Sync" by default, ISIN2 will be MISSING_FROM_UPLOAD.
        
        deltas = calculate_delta(excel_data, db_holdings, ignore_missing=False) # Default behavior
        
        # Check for ISIN2
        isin2_action = next((d for d in deltas if d['isin'] == "ISIN2"), None)
        
        # Based on user requirement: "non ci deve essere nessun errore" -> Meaning no "MISSING_FROM_UPLOAD" causing a sell-off
        # Current expected behavior (FAIL condition): It likely DOES report MISSING_FROM_UPLOAD
        
        print(f"\n[Test 1] Partial Sales File. ISIN2 Action: {isin2_action['type'] if isin2_action else 'None'}")
        
    
    def test_rule_2_qty_mismatch_no_op(self):
        """
        Rule 2: Asset qty differs from DB, NO 'Acquisto'/'Vendita' -> ERROR.
        """
        db_holdings = {
            "ISIN3": {"qty": 100.0, "metadata": {}}
        }
        
        # Excel shows 110 (increase) but NO explicit operation
        excel_data = [
            {
                "isin": "ISIN3",
                "quantity": 110.0,
                "operation": None, # or empty string
                "op_price_eur": 0.0,
                "date": None
            }
        ]
        
        deltas = calculate_delta(excel_data, db_holdings)
        
        action = deltas[0]
        print(f"\n[Test 2] Mismatch No Op. Action Type: {action['type']}")
        
        # User wants this to be an ERROR.
        # Current expected behavior (FAIL condition): It returns "Acquisto"
        
if __name__ == '__main__':
    # Manually run
    t = TestIngestionLogic()
    t.test_rule_1_partial_sales_file()
    t.test_rule_2_qty_mismatch_no_op()
