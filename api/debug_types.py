import os
import sys
from dotenv import load_dotenv

if os.path.exists('.env.local'):
    load_dotenv('.env.local')

from supabase_client import get_supabase_client

try:
    supabase = get_supabase_client()
    res = supabase.table('assets').select('asset_class').execute()
    types = set(r['asset_class'] for r in res.data if r['asset_class'])
    print(f"TYPES_FOUND: {types}")
except Exception as e:
    print(f"ERROR: {e}")
