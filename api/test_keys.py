import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

print(f"Testing with Anon Key: {anon_key[:10]}...")
try:
    client = create_client(url, anon_key)
    print("Success initializing client with anon key!")
except Exception as e:
    print(f"Failed with anon key: {type(e).__name__}: {e}")

service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
print(f"Testing with Service Key: {service_key[:10]}...")
try:
    client = create_client(url, service_key)
    print("Success initializing client with service key!")
except Exception as e:
    print(f"Failed with service key: {type(e).__name__}: {e}")
