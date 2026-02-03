import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load production env
load_dotenv('.env.production.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not service_key:
    print("Error: Missing Supabase credentials in .env.production.local")
    exit(1)

# Service Role Client (Admin)
admin_client: Client = create_client(url, service_key)

# Anon Client (Public/User)
# Note: To fully test User RLS we'd need a user JWT, but we can test Anon access or 
# just infer from Service Role inspection.
anon_client: Client = create_client(url, anon_key)

def check_users_alignment():
    print("\n--- Checking Users/Profiles Alignment ---")
    try:
        # Get Auth Users
        auth_users_response = admin_client.auth.admin.list_users()
        auth_users = auth_users_response if isinstance(auth_users_response, list) else auth_users_response.users
        
        print(f"Auth Users found: {len(auth_users)}")
        
        # Get Profiles
        profiles_response = admin_client.table('profiles').select('*').execute()
        profiles = profiles_response.data
        print(f"Profiles found: {len(profiles)}")
        
        auth_ids = {u.id for u in auth_users}
        profile_ids = {p['id'] for p in profiles}
        
        missing_in_profiles = auth_ids - profile_ids
        if missing_in_profiles:
            print(f"CRITICAL: {len(missing_in_profiles)} users exist in Auth but missing in 'profiles' table!")
            for uid in missing_in_profiles:
                # Find email
                user = next((u for u in auth_users if u.id == uid), None)
                email = user.email if user else "Unknown"
                print(f" - Missing Profile for: {uid} ({email})")
        else:
            print("OK: All Auth users have a Profile.")
            
    except Exception as e:
        print(f"Error checking users: {e}")

def check_app_config_access():
    print("\n--- Checking App Config Access ---")
    try:
        # Try to read with Service Role
        res = admin_client.table('app_config').select('*').execute()
        print(f"Admin read 'app_config': Success, {len(res.data)} items.")
        
        # Try to read with Anon Role (should fail or return empty if RLS is strict)
        try:
            res_anon = anon_client.table('app_config').select('*').execute()
            print(f"Anon read 'app_config': Success (Unexpected if default deny?), {len(res_anon.data)} items.")
        except Exception as e:
            print(f"Anon read 'app_config': Failed as expected ({e})")
            
    except Exception as e:
        print(f"Error checking app_config: {e}")

def list_tables_count():
    print("\n--- Listing Table Counts (Admin) ---")
    tables = ['assets', 'portfolios', 'transactions', 'snapshots', 'users', 'profiles'] # 'users' usually not exposed in public schema
    for t in tables:
        try:
            if t == 'users': continue # skip auth view
            res = admin_client.table(t).select('*', count='exact', head=True).execute()
            print(f"Table '{t}': {res.count} rows")
        except Exception as e:
            print(f"Table '{t}': Error ({e})")

if __name__ == "__main__":
    print(f"Connecting to: {url}")
    check_users_alignment()
    check_app_config_access()
    list_tables_count()
