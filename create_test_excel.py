
import pandas as pd

# Create a sample dataframe that mimics the portfolio structure
# Columns based on api/ingest.py expectation
data = {
    "Descrizione Titolo": ["Apple Inc.", "Microsoft Corp", "Test Asset"],
    "Codice ISIN": ["US0378331005", "US5949181045", "IT0000000000"],
    "Qta": [None, None, None], # No Quantity change
    "Divisa": ["USD", "USD", "EUR"],
    "Prezzo Medio Carico": [150, 250, 10], # Irrelevant for price update
    "Data": ["01/01/2026", "01/01/2026", "01/01/2026"],
    "Operazione": [None, None, None], # No Operation
    "Prezzo Op": [None, None, None], # No Op Price
    "Prezzo Corrente": [200.50, 400.20, 12.50], # NEW PRICES
    "Tipologia": ["Azioni", "Azioni", "Obbligazioni"]
}

df = pd.DataFrame(data)
df.to_excel("test_price_update.xlsx", index=False)
print("Created test_price_update.xlsx")
