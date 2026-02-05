
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

# HACK: Bypass supabase-py validation for opaque/local keys
# Local Supabase uses 'sb_...' keys which look invalid to the python client (expects JWT).
# We init with a dummy JWT and then swap the headers.
dummy_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.dummy"

try:
    # Try normal init first (in case keys are JWTs)
    supabase: Client = create_client(url, key)
except Exception:
    # If it fails (likely Invalid API Key), use the bypass
    supabase: Client = create_client(url, dummy_jwt)
    
    # Swap in the real key
    supabase.supabase_key = key
    
    # Update headers for PostgREST
    supabase.postgrest.auth(key)
    
    # Update headers for Auth/GoTrue (Important for Admin)
    # Note: gotrue-py client stores headers in .headers (dict)
    # We might need to inspect the object structure if this doesn't work.
    # Current library version usually has supabase.auth._headers or similar?
    # Inspecting basic usage:
    # supabase.auth is a GoTrueClient.
    
    # For newer supabase-py, auth is separate.
    # Let's set the headers directly in the http client if accessible, or rebuild.
    # The GoTrue client usually gets the headers from the parent or sets them on init.
    
    # Re-setting headers manually where we can:
    supabase.options.headers["apikey"] = key
    supabase.options.headers["Authorization"] = f"Bearer {key}"
    
    # Also fix the Auth client headers if they were initialized with dummy
    if hasattr(supabase.auth, 'headers'):
        supabase.auth.headers["apikey"] = key
        supabase.auth.headers["Authorization"] = f"Bearer {key}"
    
    # For postgrest, .auth() call above handles it.

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
