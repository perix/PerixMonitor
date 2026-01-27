import os
import sys
from dotenv import load_dotenv

# Add api to path
sys.path.append(os.path.join(os.getcwd(), 'api'))

load_dotenv('.env.local')

from supabase_client import get_supabase_client

try:
    supabase = get_supabase_client()
    res = supabase.table('portfolios').select('id, name').execute()
    print(f"Portfolios: {res.data}")
    
    if res.data:
        p_id = res.data[0]['id']
        trans = supabase.table('transactions').select('id', count='exact').eq('portfolio_id', p_id).execute()
        print(f"Transactions in first portfolio: {trans.count}")
except Exception as e:
    print(f"Error: {e}")
