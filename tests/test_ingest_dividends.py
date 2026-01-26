
import requests
import pandas as pd
import io

def test_dividend_ingest():
    # Create valid dataframe matching new rules
    data = {
        "ISIN": ["US1234567890", "IT0000000000"],
        "Importo": [15.50, -2.30], # Positive (Dividend), Negative (Expense)
        "Data Flusso": ["2024-01-01", "2024-01-02"],
        "ExtraColumn": ["Info1", "Info2"] # Extra column should be ignored but allowed
    }
    df = pd.DataFrame(data)
    
    # Save to bytes
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    files = {'file': ('test_dividends.xlsx', output, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    
    # Send request
    try:
        response = requests.post('http://127.0.0.1:5328/api/ingest', files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get('type') == 'DIVIDENDS' or res_json.get('type') == 'KPI_DIVIDENDS':
                print("SUCCESS: Detected as DIVIDENDS type.")
                data = res_json.get('parsed_data', [])
                if len(data) == 2:
                    print("SUCCESS: Correctly parsed 2 items.")
                    print(f"Items: {data}")
                else:
                    print(f"FAIL: Expected 2 items, got {len(data)}")
            else:
                print(f"FAIL: Incorrect type detected: {res_json.get('type')}")
        else:
            print("FAIL: Request failed")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_dividend_ingest()
