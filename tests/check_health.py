
import requests

try:
    print("Checking backend health...")
    r = requests.get("http://localhost:5328/api/health", timeout=2)
    print(f"Status: {r.status_code}")
except Exception as e:
    print(f"Failed: {e}")
