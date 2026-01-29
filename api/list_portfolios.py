from supabase_client import get_supabase_client
import sys

def list_portfolios():
    supabase = get_supabase_client()
    res = supabase.table('portfolios').select("id, name").execute()
    if res.data:
        for p in res.data:
            print(f"ID: {p['id']} - Name: {p['name']}")
    else:
        print("No portfolios found.")

if __name__ == "__main__":
    list_portfolios()
