
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from logger import logger

# Load env vars
load_dotenv('.env.local')

url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Use Service Role Key for backend administration (bypasses RLS)
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    logger.error("Supabase URL or Key missing in .env.local")
    raise ValueError("Missing Supabase Credentials")

supabase: Client = create_client(url, key)

def get_supabase_client() -> Client:
    return supabase

def get_or_create_default_portfolio(user_email: str = "admin@example.com"):
    """
    DEPRECATED: We now require explicit portfolio_id from frontend.
    Keeping this as a fallback/test helper only if strictly needed, 
    but logic should move to explicit ID.
    """
    logger.warning("get_or_create_default_portfolio is deprecated! Use explicit portfolio_id.")
    return None

def verify_portfolio_access(portfolio_id: str):
    """
    Verifies if a portfolio exists.
    In a real app with auth middleware, we would check if the current user owns it.
    Since we use Service Role here for backend ops, we just check existence.
    """
    try:
        res = supabase.table('portfolios').select("id").eq("id", portfolio_id).execute()
        return len(res.data) > 0
    except Exception as e:
        logger.error(f"Error checking portfolio {portfolio_id}: {e}")
        return False
