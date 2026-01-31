
import logging
import sys
import unittest
try:
    from api.ingest import calculate_delta
except ImportError:
    # Allow running from root
    from api.ingest import calculate_delta

# Setup mock logger
logging.basicConfig(level=logging.INFO)

class TestIngestionLogicExtended(unittest.TestCase):

    def test_simple_transaction_logic(self):
        """
        Scenario 1: Explicit Sale.
        Excel: Qty=50, Op=Vendita. DB: Qty=100.
        Result: 'Vendita' of 50. New Total: 50.
        """
        print("\n[Test 1] Simple Transaction Mode")
        excel_data = [
            {'isin': 'IT001', 'quantity': 50, 'operation': 'Vendita', 'op_price_eur': 50.0},
            {'isin': 'IT002', 'quantity': 100, 'operation': 'Acquisto', 'op_price_eur': 100.0}
        ]
        db_holdings = {
            'IT001': {'qty': 100},
            'IT002': {'qty': 50}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        
        self.assertEqual(len(deltas), 2)
        
        # Check Vendita
        act1 = next(d for d in deltas if d['isin'] == 'IT001')
        self.assertEqual(act1['type'], 'Vendita')
        self.assertEqual(act1['quantity_change'], 50)
        self.assertEqual(act1['new_total_qty'], 50)
        
        # Check Acquisto
        act2 = next(d for d in deltas if d['isin'] == 'IT002')
        self.assertEqual(act2['type'], 'Acquisto')
        self.assertEqual(act2['quantity_change'], 100)
        self.assertEqual(act2['new_total_qty'], 150)
        
        print("Test 1 Passed: Simple Transaction Logic Correct.")

    def test_price_update_mismatch_error(self):
        """
        Scenario: No Op, but Valid Qty mismatch.
        Excel: Qty=100 (No Operation). DB: Qty=50.
        Expect: ERROR_QTY_MISMATCH_NO_OP (Strict Check)
        """
        print("\n[Test 2] Price Update - Mismatch Error")
        excel_data = [
            {'isin': 'IT003', 'quantity': 100, 'operation': None, 'op_price_eur': 100.0}
        ]
        db_holdings = {
            'IT003': {'qty': 50}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0]['type'], 'ERROR_QTY_MISMATCH_NO_OP')
        print("Test 2 Passed: Mismatch caught as Error.")

    def test_price_update_valid_match(self):
        """
        Scenario: No Op, Qty Matches.
        Expect: NO Transaction Action.
        """
        print("\n[Test 2b] Price Update - Valid Match")
        excel_data = [
            {'isin': 'IT005', 'quantity': 100, 'operation': None, 'asset_type': 'Bond', 'op_price_eur': 100.0}
        ]
        db_holdings = {
            'IT005': {'qty': 100, 'metadata': {'assetType': 'Bond'}}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        
        # Should be empty or contain only meta updates if any. No meta change here.
        self.assertEqual(len(deltas), 0)
        print("Test 2b Passed: Valid match ignored transaction-wise.")
        
    
    def test_price_update_empty_qty(self):
        """
        Scenario: No Op, Empty Qty (None).
        Expect: NO Transaction Action (Valid Price Update).
        """
        print("\n[Test 2c] Price Update - Empty Qty")
        excel_data = [
            {'isin': 'IT006', 'quantity': None, 'operation': None, 'asset_type': 'Stock', 'op_price_eur': 60.0}
        ]
        db_holdings = {
            'IT006': {'qty': 100, 'metadata': {'assetType': 'Stock'}}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        self.assertEqual(len(deltas), 0)
        print("Test 2c Passed: Empty Qty ignored.")

    
    def test_buy_incomplete_op(self):
        """
        Scenario: Buy Op, has Qty but NO Price.
        Expect: ERROR_INCOMPLETE_OP.
        """
        print("\n[Test 4a] Buy Incomplete (No Price)")
        excel_data = [
            {'isin': 'IT007', 'quantity': 100, 'operation': 'Acquisto', 'op_price_eur': None}
        ]
        db_holdings = {'IT007': {'qty': 0}}
        
        deltas = calculate_delta(excel_data, db_holdings)
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0]['type'], 'ERROR_INCOMPLETE_OP')
        print("Test 4a Passed: Missing Price caught.")

    def test_sell_incomplete_op(self):
        """
        Scenario: Sell Op, has Price but NO Qty.
        Expect: ERROR_INCOMPLETE_OP.
        """
        print("\n[Test 4b] Sell Incomplete (No Qty)")
        # Note: Previous test_buy_no_qty covered Qty mismatch, now we have specific incomplete error
        excel_data = [
            {'isin': 'IT008', 'quantity': None, 'operation': 'Vendita', 'op_price_eur': 50.0}
        ]
        db_holdings = {'IT008': {'qty': 100}}
        
        deltas = calculate_delta(excel_data, db_holdings)
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0]['type'], 'ERROR_INCOMPLETE_OP')
        print("Test 4b Passed: Missing Qty caught.")
        
    def test_excessive_sell_error(self):
        """
        Scenario: Sell 200, Own 100. Error.
        """
        print("\n[Test 3] Excessive Sell Error")
        excel_data = [
            {'isin': 'IT004', 'quantity': 200, 'operation': 'Vendita', 'description': 'Asset D', 'op_price_eur': 50.0}
        ]
        db_holdings = {
            'IT004': {'qty': 100}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0]['type'], 'ERROR_NEGATIVE_QTY')
        print("Test 3 Passed: Excessive Sell Caught.")

if __name__ == '__main__':
    unittest.main()
