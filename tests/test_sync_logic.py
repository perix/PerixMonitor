
import unittest
import sys
import os
from unittest.mock import MagicMock, patch

# Add api to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api')))

# Mock supabase components before importing index
sys.modules['supabase_client'] = MagicMock()
sys.modules['supabase_client'].get_supabase_client = MagicMock()

from index import app

class TestSyncLogic(unittest.TestCase):
    
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    @patch('index.get_supabase_client')
    def test_sync_vendita_direction(self, mock_get_client):
        """
        Verify that an item with type='Vendita' and quantity_change=10 (positive)
        is correctly interpreted as a SELL transaction.
        """
        # Setup Mock Supabase
        mock_supabase = MagicMock()
        mock_get_client.return_value = mock_supabase
        
        # Mock Assets Select (return existing asset)
        mock_supabase.table().select().in_().execute.return_value.data = [{'id': 'asset-123', 'isin': 'US0000000001'}]
        # Mock Insert (capture the call)
        mock_insert = mock_supabase.table().insert
        mock_insert.return_value.execute.return_value.data = []

        # Payload representing what Frontend sends to /api/sync
        payload = {
            "portfolio_id": "port-1",
            "changes": [
                {
                    "isin": "US0000000001",
                    "type": "Vendita",        # The field we hope it respects
                    "quantity_change": 10.0,  # Absolute value as sent by ingest.py
                    "date": "2023-01-01",
                    "price": 100.0
                }
            ]
        }
        
        # Execute Request
        response = self.app.post('/api/sync', json=payload)
        
        # Check Response
        self.assertEqual(response.status_code, 200)
        
        # Verify Supabase Insert Call
        # We expect one insert into 'transactions'
        # Check arguments of the insert call
        # Mock structure: supabase.table('transactions').insert(...)
        
        # Find the call to table('transactions')
        # This is hard with chained mocks. Let's inspect the last insert call if possible.
        # Ensure 'transactions' table was used
        # mock_supabase.table.assert_any_call('transactions')
        
        # Get args passed to insert
        # We assume the logic calls: table('transactions').insert(list_of_txs)
        # We need to find the specific call where table name was transactions
        
        # Simplified assumption: The code calls table('transactions').insert(...)
        # We can look at mock_supabase.table.call_args_list to find the one for 'transactions'
        # Then get the return value of that call, and check its insert call.
        
        # Actually, let's look at how many times insert was called.
        # Should be called once for transactions (if valid).
        
        # Let's inspect the logic in index.py directly via import if test_client is too opaque,
        # but test_client is better for integration.
        
        # We can iterate through mock_supabase.table.mock_calls?
        # A simpler way:
        # The logic does: supabase.table('transactions').insert(valid_transactions).execute()
        
        # We can capture the `valid_transactions` list by side_effect or just inspecting call args
        # But we don't have direct access to the `valid_transactions` variable.
        # We need to inspect the mock.
        
        pass 
        # I'll rely on the print output for debugging the mock chains or use specific mock setup.
        
        # Better approach: Patching the exact logic is flaky.
        # Let's just trust that if I patch 'index.get_supabase_client', I can inspect the mock.
        
        # Let's iterate all calls to mock_supabase.table('transactions').insert
        # But since table() creates a new mock, we need to configure THAT mock.
        
        # Resetting mock setup for clarity:
        table_mock = MagicMock()
        mock_supabase.table.side_effect = lambda name: table_mock if name == 'transactions' else MagicMock()
        
        # Run again with this setup
        self.app.post('/api/sync', json=payload)
        
        # Check insert args on table_mock
        insert_args = table_mock.insert.call_args
        # Inspect mock calls to find the insert on 'transactions'
        # table_mock has been configured as the return value for table('transactions')
        
        print("\n[Test] Inspecting mock calls...")
        if table_mock.insert.called:
             args = table_mock.insert.call_args
             txs = args[0][0]
             print(f"[Test] Transactions sent to DB: {txs}")
             if txs[0]['type'] == 'SELL':
                 print("✅ Logic Correct: 'Vendita' mapped to 'SELL'")
             else:
                 print(f"❌ BUG: 'Vendita' mapped to '{txs[0]['type']}'")
        else:
             print("❌ Insert not called on transactions table mock")


if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(TestSyncLogic)
    unittest.TextTestRunner(verbosity=2).run(suite)

