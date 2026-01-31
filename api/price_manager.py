import logging
from datetime import datetime
import pandas as pd
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

def get_interpolated_price_history(isin, min_date=None, max_date=None):
    """
    Fetches historical prices and interpolates missing days using LOCF (Last Observation Carried Forward).
    Returns a dictionary {date_str: price}.
    
    This implements the "Time Bucket" + "LOCF" strategy in Python (Pandas) 
    to robustly handle irregular/episodic price ingestion.
    """
    raw_history = get_price_history(isin)
    
    if not raw_history:
        return {}

    try:
        # Convert to DataFrame
        df = pd.DataFrame(raw_history)
        df['date'] = pd.to_datetime(df['date'])
        df = df.set_index('date').sort_index()

        # Handle duplicates if any (take last)
        df = df[~df.index.duplicated(keep='last')]
        
        # Determine strict range
        start = min_date if min_date else df.index.min()
        if not max_date:
            max_date = datetime.now()
            
        end = max_date

        if start > end:
            return {}

        # Create full daily range
        full_idx = pd.date_range(start=start, end=end, freq='D')
        
        # Reindex and forward fill (LOCF)
        # 'method' deprecated in reindex, use ffill() after
        df_interp = df.reindex(full_idx)
        df_interp['price'] = df_interp['price'].ffill()

        # If starts with NaNs (because min_date < first price), backfill or leave 0/NaN?
        # Standard LOCF implies we don't look into the future, so keep NaN or fill with 0.
        # But if we want to smooth graph start, we might backfill cost? 
        # dashboard.py handles 0 price by checking.
        df_interp['price'] = df_interp['price'].fillna(0)

        # Convert back to dict {str: float}
        # index is Timestamp, map to str
        result = df_interp['price'].to_dict()
        return {k.strftime('%Y-%m-%d'): v for k, v in result.items()}

    except Exception as e:
        logger.error(f"Interpolation error for {isin}: {e}")
        # Fallback to sparse map
        return {row['date']: row['price'] for row in raw_history}
