from dotenv import load_dotenv
import os
from supabase import create_client

# Explicitly load production env
load_dotenv('.env.production.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing credentials")
    exit(1)

supabase = create_client(url, key)

print("Fetching users...")
try:
    response = supabase.auth.admin.list_users()
    print(f"Type of response: {type(response)}")
    print(f"Dir response: {dir(response)}")
    
    # Simulate API logic
    users_list = []
    print("Attempting iteration...")
    for u in response:
        # print(f"Item type: {type(u)}")
        users_list.append({
            "id": u.id,
            "email": u.email
        })
    print(f"Successfully serialized {len(users_list)} users.")
except Exception as e:
    print(f"Error: {e}")
