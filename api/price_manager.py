import logging
from datetime import datetime
from supabase_client import get_supabase_client

logger = logging.getLogger("perix_monitor")

def save_price_snapshot(isin, price, date=None, source="Manual Upload"):
    """
    Upserts a price record for an ISIN.
    """
    if not price or price <= 0:
        return

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    data = {
        "isin": isin,
        "price": price,
        "date": date,
        "source": source
    }

    try:
        supabase = get_supabase_client()
        # Upsert based on (isin, date, source) constraint 
        # Note: on_conflict requires the constraint name or columns
        res = supabase.table('asset_prices').upsert(data, on_conflict='isin, date, source').execute()
        logger.debug(f"Saved price for {isin}: {price}")
    except Exception as e:
        logger.error(f"Failed to copy price for {isin}: {e}")
        # If table doesn't exist, this will log an error.

def get_latest_price(isin):
    """
    Fetches the most recent price for an ISIN from the DB.
    """
    try:
        supabase = get_supabase_client()
        # Order by date descending, limit 1
        res = supabase.table('asset_prices').select("price, date, source")\
            .eq('isin', isin)\
            .order('date', desc=True)\
            .limit(1)\
            .execute()
        
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to get latest price for {isin}: {e}")
        return None

def get_price_history(isin):
    """
    Fetches all historical prices for an ISIN.
    """
    try:
        supabase = get_supabase_client()
        res = supabase.table('asset_prices').select("price, date")\
            .eq('isin', isin)\
            .order('date', desc=False)\
            .execute()
        return res.data if res.data else []
    except Exception as e:
        logger.error(f"Failed to get history for {isin}: {e}")
        return []
