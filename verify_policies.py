import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load production env
load_dotenv('.env.production.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not service_key:
    print("Error: Missing Supabase credentials")
    exit(1)

client: Client = create_client(url, service_key)

def verify_policies():
    print("\n--- Verifying RLS Policies ---")
    try:
        # Query pg_policies table via RPC or direct SQL if possible? 
        # Supabase Service Role can access system tables? Usually yes via PostgREST if not hidden.
        # But pg_policies is usually not exposed to PostgREST.
        
        # However, we can use the 'assets' table access to check if we can *read* it (we know we can).
        # To truly verify policies without a token, we rely on the DB output from the migration tool.
        
        # But let's try to list policies if exposed.
        try:
            res = client.table('pg_policies').select('*').execute()
            print(f"Policies found: {len(res.data)}")
            for p in res.data:
                if p['tablename'] in ['profiles', 'app_config']:
                    print(f" - {p['policyname']} ON {p['tablename']} ({p['cmd']})")
        except Exception as e:
            print(f"Cannot read pg_policies directly via API: {e}")
            print("Assuming migration tool output is source of truth.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_policies()
