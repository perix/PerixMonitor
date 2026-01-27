import os
from dotenv import load_dotenv

# Try to load .env.local
loaded = load_dotenv('.env.local')
print(f"Loaded .env.local: {loaded}")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

print(f"URL: '{url}'")
if key:
    print(f"Key length: {len(key)}")
    print(f"Key starts with: {key[:10]}...")
    print(f"Key ends with: ...{key[-5:]}")
else:
    print("Key is None")
