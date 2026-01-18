
import sys
import os

# Add parent directory to path to import api modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api')))

# Mock parsing result
parse_result = {
    'data': [
        {
            'isin': 'US0378331005',
            'quantity': 0,        # Zero quantity
            'current_price': 150.0, # Price present
            'date': '2023-10-27',
            'avg_price_eur': 0.0
        },
        {
            'isin': 'US0378331005',
            'quantity': 10,       # Positive quantity
            'current_price': 155.0,
            'date': '2023-10-28',
            'avg_price_eur': 140.0
        }
    ]
}

def test_ingest_logic():
    print("Running ingestion logic test...")
    prices_to_save = []
    total_value_eur = 0
    
    # --- LOGIC EXTRACTED FROM api/index.py ---
    for row in parse_result['data']:
        qty = row.get('quantity', 0)
        
        # Market Value calculation
        curr_price = row.get('current_price')
        
        # [MODIFIED] Always save price if present, regardless of quantity
        if curr_price:
             # Collect individual price for later saving
             prices_to_save.append({
                 "isin": row['isin'],
                 "price": curr_price,
                 "date": row.get('date'), # Might be None, handled by backend
                 "source": "Manual Upload" 
             })

        if curr_price and qty:
             total_value_eur += (qty * curr_price)
    # ------------------------------------------

    print(f"Prices Captured: {len(prices_to_save)}")
    for p in prices_to_save:
        print(f"  - ISIN: {p['isin']}, Price: {p['price']}, Date: {p['date']}")
    
    print(f"Total Value: {total_value_eur}")

    # Assertions
    assert len(prices_to_save) == 2, "Should capture 2 prices (one from qty=0, one from qty=10)"
    assert prices_to_save[0]['price'] == 150.0, "First price should be 150.0"
    assert prices_to_save[1]['price'] == 155.0, "Second price should be 155.0"
    assert total_value_eur == 1550.0, "Total value should only include the second item (10 * 155)"
    
    print("\n✅ TEST PASSED: Logic correctly captures prices regardless of quantity.")

if __name__ == "__main__":
    test_ingest_logic()
