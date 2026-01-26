
import unittest
import sys
import os

# Add api to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api')))

from ingest import calculate_delta

class TestReconciliationLogic(unittest.TestCase):
    
    def test_price_only_update_triggers_sell(self):
        """
        Scenario: User uploads a file with ISIN, Quantity=0, Price=150.
        DB has Quantity=10.
        Current Behavior: Generates a 'Vendita' (Sell) action for 10 units.
        Desired Behavior: Should ignore the quantity change if Qty=0 and no explicit 'Vendita' operation.
        """
        
        # 1. Setup Data
        excel_data = [
            {
                "isin": "US0000000001",
                "quantity": 0.0,
                "current_price": 150.0,
                "date": "2023-10-27",
                "operation": None # No explicit operation
            }
        ]
        
        db_holdings = {
            "US0000000001": 10.0 # User owns 10
        }
        
        # 2. Run Delta Calculation
        actions = calculate_delta(excel_data, db_holdings)
        
        print(f"\n[Repro] Actions generated: {actions}")
        
        # 3. Assertions
        # In the buggy version, we expect a 'Vendita' action
        sell_actions = [a for a in actions if a['type'] == 'Vendita']
        
        # Verification check
        if len(sell_actions) > 0:
            print("❌ Issue Reproduced: Found 'Vendita' action for price-only row.")
        else:
            print("✅ No 'Vendita' action found (Issue not present/FIXED).")
            
    def test_explicit_sell_works(self):
        """
        Scenario: User uploads a file with ISIN, Quantity=0, Operation='Vendita'.
        DB has Quantity=10.
        Result: Should generate a 'Vendita' action.
        """
        excel_data = [
            {
                "isin": "US0000000001",
                "quantity": 0.0,
                "current_price": 150.0,
                "date": "2023-10-27",
                "operation": "Vendita" 
            }
        ]
        
        db_holdings = {"US0000000001": 10.0}
        
        actions = calculate_delta(excel_data, db_holdings)
        sell_actions = [a for a in actions if a['type'] == 'Vendita']
        
        assert len(sell_actions) == 1, "Should generate Vendita if explicit"
        print("✅ Explicit Sell Logic OK")

if __name__ == '__main__':
    # Manually run the test method to see output clearly
    t = TestReconciliationLogic()
    t.test_price_only_update_triggers_sell()
    t.test_explicit_sell_works()
