
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
        Qty=10, Op=Vendita -> Delta=-10. (Regardless of Excel Qty vs DB Qty relations)
        Scenario 2: Explicit Buy.
        Qty=50, Op=Acquisto -> Delta=+50.
        """
        print("\n[Test 1] Simple Transaction Mode")
        excel_data = [
            {'isin': 'IT001', 'quantity': 10, 'operation': 'Vendita', 'asset_type': 'Stock', 'description': 'Asset A'},
            {'isin': 'IT002', 'quantity': 50, 'operation': 'Acquisto', 'asset_type': 'Stock', 'description': 'Asset B'}
        ]
        db_holdings = {
            'IT001': {'qty': 100, 'metadata': {'assetType': 'Stock'}},
            'IT002': {'qty': 100, 'metadata': {'assetType': 'Stock'}}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        
        self.assertEqual(len(deltas), 2)
        
        # Action 1: Sell 10
        act1 = next(d for d in deltas if d['isin'] == 'IT001')
        self.assertEqual(act1['type'], 'Vendita')
        self.assertEqual(act1['quantity_change'], 10)
        self.assertEqual(act1['new_total_qty'], 90) # 100 - 10
        
        # Action 2: Buy 50
        act2 = next(d for d in deltas if d['isin'] == 'IT002')
        self.assertEqual(act2['type'], 'Acquisto')
        self.assertEqual(act2['quantity_change'], 50)
        self.assertEqual(act2['new_total_qty'], 150) # 100 + 50
        
        print("Test 1 Passed: Simple Transaction Logic Correct.")

    def test_price_update_mismatch_error(self):
        """
        Scenario: No Op, but Qty differs (999 vs 100).
        Expect: ERROR_QTY_MISMATCH_NO_OP.
        """
        print("\n[Test 2] Price Update - Mismatch Error")
        excel_data = [
            {'isin': 'IT003', 'quantity': 999, 'operation': None, 'asset_type': 'Stock', 'op_price_eur': 50.0, 'description': 'Asset C'}
        ]
        db_holdings = {
            'IT003': {'qty': 100, 'metadata': {'assetType': 'Stock'}}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0]['type'], 'ERROR_QTY_MISMATCH_NO_OP')
        print("Test 2 Passed: Mismatch caught as Error.")

    def test_price_update_valid_match(self):
        """
        Scenario: No Op, Qty matches DB (100 vs 100).
        Expect: NO Transaction Action (Valid Price Update).
        """
        print("\n[Test 2b] Price Update - Valid Match")
        excel_data = [
            {'isin': 'IT005', 'quantity': 100, 'operation': None, 'asset_type': 'Stock', 'op_price_eur': 55.0, 'description': 'Asset E'}
        ]
        db_holdings = {
            'IT005': {'qty': 100, 'metadata': {'assetType': 'Stock'}}
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

    def test_buy_no_qty(self):
        """
        Scenario: Buy Op, but Qty is None.
        Expect: Error.
        """
        print("\n[Test 4] Buy No Qty Error")
        excel_data = [
            {'isin': 'IT007', 'quantity': None, 'operation': 'Acquisto'}
        ]
        db_holdings = {
            'IT007': {'qty': 100}
        }
        
        deltas = calculate_delta(excel_data, db_holdings)
        self.assertTrue(len(deltas) >= 1)
        self.assertEqual(deltas[0]['type'], 'ERROR_QTY_MISMATCH')
        print("Test 4 Passed: Missing Qty in Buy caught.")
        
    def test_excessive_sell_error(self):
        """
        Scenario: Sell 200, Own 100. Error.
        """
        print("\n[Test 3] Excessive Sell Error")
        excel_data = [
            {'isin': 'IT004', 'quantity': 200, 'operation': 'Vendita', 'description': 'Asset D'}
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
