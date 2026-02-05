
import unittest
import sys
import os
import pandas as pd
from datetime import datetime

# Add api to path
sys.path.append(os.path.join(os.getcwd(), 'api'))

from ingest import parse_portfolio_excel

class TestNewIngestionLogic(unittest.TestCase):
    
    def simulate_file_upload(self, data_list):
        """Helper to create a dataframe and pass it to parser"""
        df = pd.DataFrame(data_list)
        # Mock file object logic inside parse_portfolio_excel uses pd.read_excel or csv.
        # But parse_portfolio_excel takes a file stream.
        # However, we can call the specific parsers directly if we want Unit Tests,
        # OR we can mock the behavior.
        # But ingest.py exposes `parse_dividends_file`, `parse_transactions_file`, `parse_prices_file`
        # IF we imported them. But they are not exported by main dispatcher usually.
        # Let's import the dispatcher and use it.
        # But we need to wrap the df in a way that read_excel accepts?
        # Simpler: Write temporary CSV/Excel or mock pandas read.
        
        # Actually, let's just make the specific parsers accessible or import them from ingest
        # (they are defined in ingest.py, so we can import them if we update the import)
        pass

    def test_case_1_transactions(self):
        """CASO 1: Transazioni Acquisto/Vendita esplicite"""
        print("\n[Test Case 1] Transactions...")
        from ingest import parse_transactions_file
        
        data = [
            {
                "ISIN": "ISIN1", 
                "Descrizione Asset": "Asset 1", 
                "Quantità": 10, 
                "Data": "2024-01-01", 
                "Prezzo Operazione (EUR)": 50.0, 
                "Operazione": "Acquisto",
                "Tipologia": "Stock"
            },
            {
                "ISIN": "ISIN1", 
                "Descrizione Asset": "Asset 1", 
                "Quantità": 5, 
                "Data": "2024-01-02", 
                "Prezzo Operazione (EUR)": 55.0, 
                "Operazione": "Vendita",
                "Tipologia": "Stock"
            }
        ]
        df = pd.DataFrame(data)
        # Normalize columns as dispatcher does
        df.columns = [c.lower() for c in df.columns]
        
        result = parse_transactions_file(df)
        self.assertIsNone(result['error'])
        self.assertEqual(len(result['data']), 2)
        self.assertEqual(result['data'][0]['operation'], 'Acquisto')
        self.assertEqual(result['data'][1]['operation'], 'Vendita')
        print("-> OK: Valid transactions parsed corrrectly")

        # Test Negative Running Quantity
        data_bad = [
            {
                "ISIN": "ISIN2", 
                "Descrizione Asset": "Asset 2", 
                "Quantità": 10, 
                "Data": "2024-01-01", 
                "Prezzo Operazione (EUR)": 50.0, 
                "Operazione": "Vendita", # Selling without buying
                "Tipologia": "Stock"
            }
        ]
        df_bad = pd.DataFrame(data_bad)
        df_bad.columns = [c.lower() for c in df_bad.columns]
        result_bad = parse_transactions_file(df_bad)
        self.assertIsNotNone(result_bad['error'])
        print(f"-> OK: Error correctly detected for negative balance: {result_bad['error']}")

    def test_case_2_dividends(self):
        """CASO 2: Cedole/Dividendi"""
        print("\n[Test Case 2] Dividends...")
        from ingest import parse_dividends_file
        
        data = [
            {
                "ISIN": "ISIN1", 
                "Valore Cedola (EUR)": 15.50, 
                "Data Flusso": "2024-03-01"
            },
            {
                "ISIN": "ISIN2", 
                "Valore Cedola (EUR)": -2.00, # Expense
                "Data Flusso": "2024-03-01"
            }
        ]
        df = pd.DataFrame(data)
        df.columns = [c.lower() for c in df.columns]
        
        result = parse_dividends_file(df)
        self.assertIsNone(result['error'])
        self.assertEqual(len(result['data']), 2)
        self.assertEqual(result['data'][0]['amount'], 15.50)
        self.assertEqual(result['data'][1]['amount'], -2.00)
        print("-> OK: Positive and Negative dividends accepted")

    def test_case_3_prices(self):
        """CASO 3: Prezzi"""
        print("\n[Test Case 3] Prices...")
        from ingest import parse_prices_file
        
        data = [
            {
                "ISIN": "ISIN1", 
                "Data": "2024-04-01", 
                "Prezzo Corrente (EUR)": 100.0
            },
            {
                "ISIN": "ISIN1", # Duplicate date, different price -> Warning
                "Data": "2024-04-01", 
                "Prezzo Corrente (EUR)": 101.0
            },
            {
                "ISIN": "ISIN2", 
                "Data": "2024-04-02", 
                "Prezzo Corrente (EUR)": 50.0
            }
        ]
        df = pd.DataFrame(data)
        df.columns = [c.lower() for c in df.columns]
        
        result = parse_prices_file(df)
        self.assertIsNone(result['error'])
        self.assertEqual(len(result['data']), 2) # Should match 2 rows (one for ISIN1 unique, one for ISIN2)
        # Note: Logic keeps ONE price per ISIN+Date.
        
        # Check warning
        self.assertTrue(len(result['warnings']) > 0)
        print(f"-> OK: Prices parsed with correct warning: {result['warnings'][0]}")

if __name__ == '__main__':
    unittest.main()
