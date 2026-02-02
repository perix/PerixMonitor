import logging
from datetime import datetime
import pandas as pd
from supabase_client import get_supabase_client

logger = logging.getLogger("perix_monitor")

def save_price_snapshot(isin, price, date=None, source="Manual Upload"):
    """
    Upserts a price record for an ISIN.
    Returns True if successful, False otherwise.
    """
    if not price or price <= 0:
        logger.warning(f"SAVE PRICE SKIPPED: Invalid price {price} for {isin}")
        return False

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
        res = supabase.table('asset_prices').upsert(data, on_conflict='isin, date, source').execute()
        logger.debug(f"SAVE PRICE SUCCESS: {isin} = {price}€ ({date}) [{source}]")
        return True
    except Exception as e:
        logger.error(f"SAVE PRICE FAIL: {isin} -> {e}")
        return False

def get_price_history(isin):
    """
    Fetches all historical prices for an ISIN, merging:
    1. 'asset_prices' (Manual/Market Data)
    2. 'transactions' (Implicit Prices from Buys/Sells)
    
    Returns list of dicts: [{'date': 'YYYY-MM-DD', 'price': float, 'source': str}, ...]
    sorted by date ascending.
    """
    try:
        supabase = get_supabase_client()
        
        # 1. Fetch Explicit Prices
        res_prices = supabase.table('asset_prices').select("price, date, source")\
            .eq('isin', isin)\
            .order('date', desc=False)\
            .execute()
        
        prices_list = res_prices.data if res_prices.data else []
        
        # 2. Fetch Transaction Prices (Implicit)
        # We only care about transactions that have a valid price_eur
        res_trans = supabase.table('transactions').select("price_eur, date, type, assets!inner(isin)")\
            .eq('assets.isin', isin)\
            .neq('price_eur', 0)\
            .order('date', desc=False)\
            .execute()
            
        if res_trans.data:
            for t in res_trans.data:
                # Add transaction prices as 'Transaction' source
                # Ensure date format consistency
                d_str = t['date']
                if 'T' in d_str: d_str = d_str.split('T')[0]
                
                prices_list.append({
                    "price": float(t['price_eur']),
                    "date": d_str,
                    "source": f"Transaction ({t['type']})"
                })
        
        if not prices_list:
            return []

        # 3. Merge and Sort
        # Convert to DF for easy sorting/deduplication
        df = pd.DataFrame(prices_list)
        df['date'] = pd.to_datetime(df['date'], format='mixed', dayfirst=False) # ISO format expected
        
        # Sort by date
        df = df.sort_values(by='date')
        
        # Deduplicate same day? 
        # Strategy: If multiple prices on same day, prefer 'Manual Upload' or 'Yahoo', else take latest.
        # For simplicity, we just keep the last one committed (or average? No, last is better for EOD).
        # But wait, transactions might happen intraday. Asset prices usually EOD.
        # Let's keep all for history, but get_interpolated wil handle dedup.
        
        # Re-convert to list of dicts
        # date back to string
        result = []
        for _, row in df.iterrows():
            result.append({
                "date": row['date'].strftime('%Y-%m-%d'),
                "price": row['price'],
                "source": row.get('source', 'Unknown')
            })
            
        return result

    except Exception as e:
        logger.error(f"Failed to get unified history for {isin}: {e}")
        return []

def get_latest_price(isin):
    """
    Fetches the most recent price for an ISIN.
    Uses the unified history (Prices + Transactions) to determine the absolute latest value.
    """
    try:
        # Get full history (it's fast enough for single asset, or we could optimize query)
        # Optimizing query for unified latest is hard in Supabase-Py without SQL function.
        # Let's fetch history and take last.
        
        history = get_price_history(isin)
        
        if history:
            # Assuming history is sorted by date ascending from get_price_history
            return history[-1]
            
        return None
    except Exception as e:
        logger.error(f"Failed to get latest price for {isin}: {e}")
        return None

def get_price_before_date(isin, target_date_str):
    """
    Fetches the most recent price for an ISIN strictly BEFORE the target_date.
    target_date_str should be 'YYYY-MM-DD'.
    Returns dict {'date': 'YYYY-MM-DD', 'price': float, ...} or None.
    """
    try:
        history = get_price_history(isin)
        if not history:
            return None
            
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d")
        
        # History is sorted by date ascending. We want the last one < target_date.
        # Iterate backwards
        for entry in reversed(history):
            entry_date = datetime.strptime(entry['date'], "%Y-%m-%d")
            if entry_date < target_date:
                return entry
                
        return None
    except Exception as e:
        logger.error(f"Failed to get price before {target_date_str} for {isin}: {e}")
        return None

def calculate_projected_trend(isin, candidate_prices):
    """
    Calculates the 'Latest Trend' that would result from applying the candidate_prices to the history.
    
    candidate_prices: List of dicts {'date': 'YYYY-MM-DD', 'price': float}
    
    Logic:
    1. Initial History = DB History (Prices + Transactions)
    2. Virtual History = Merged(Initial + Candidates)
       - Candidates overwrite Initial if dates match.
    3. Sort by Date.
    4. Latest = Last Item.
    5. Previous = Penultimate Item.
    6. Calculate Trend & Days Delta.
    
    Returns: {
        'latest_price': float,
        'latest_date': str,
        'variation_pct': float,
        'days_delta': int
    } or None if not enough data.
    """
    try:
        # 1. Fetch existing history
        history = get_price_history(isin) or []
        
        # 2. Convert to Dictionary for easy merge (Key: Date String)
        # We prefer 'Candidate' source over existing
        price_map = {item['date']: item['price'] for item in history}
        
        # 3. Apply Candidates
        for cand in candidate_prices:
            d_str = cand.get('date')
            p_val = cand.get('price')
            if d_str and p_val is not None:
                # Ensure date format is consistent YYYY-MM-DD
                # Assuming candidate input is already YYYY-MM-DD from parser
                price_map[d_str] = float(p_val)
        
        # 4. Reconstruct List and Sort
        timeline = [{'date': k, 'price': v} for k, v in price_map.items()]
        timeline.sort(key=lambda x: datetime.strptime(x['date'], "%Y-%m-%d"))
        
        if not timeline:
            return None
            
        latest = timeline[-1]
        
        if len(timeline) < 2:
            # Only one price exists (and it's the one we just added/overwrite)
            return {
                'latest_price': latest['price'],
                'latest_date': latest['date'],
                'variation_pct': 0.0,
                'days_delta': 0
            }
            
        previous = timeline[-2]
        
        d1 = datetime.strptime(previous['date'], "%Y-%m-%d")
        d2 = datetime.strptime(latest['date'], "%Y-%m-%d")
        days_delta = abs((d2 - d1).days)
        
        old_p = previous['price']
        new_p = latest['price']
        
        if old_p == 0:
             pct = 0.0
        else:
             pct = ((new_p - old_p) / old_p) * 100
             
        return {
            'latest_price': new_p,
            'latest_date': latest['date'],
            'previous_price': old_p,
            'previous_date': previous['date'],
            'variation_pct': pct,
            'days_delta': days_delta
        }

    except Exception as e:
        logger.error(f"Projected trend error for {isin}: {e}")
        return None

def get_interpolated_price_history(isin, min_date=None, max_date=None):
    """
    Fetches historical prices and interpolates missing days using LOCF (Last Observation Carried Forward).
    Returns a dictionary {date_str: price}.
    
    This implements the "Time Bucket" + "LOCF" strategy in Python (Pandas) 
    to robustly handle irregular/episodic price ingestion.
    """
    raw_history = get_price_history(isin) # Now Unified!
    
    if not raw_history:
        return {}

    try:
        # Convert to DataFrame
        df = pd.DataFrame(raw_history)
        df['date'] = pd.to_datetime(df['date'])
        
        # Sort just in case
        df = df.sort_values(by='date')
        
        df = df.set_index('date')

        # Handle duplicates: keep the last entry for the day
        # (e.g. if we have Transaction + Manual, usually Manual is EOD so it might be better, 
        # or implies later update. Sort is stable, so order in list matters. 
        # In get_price_history we sorted by date. If same date, unpredictable unless we sort by source priority.
        # Let's assume last is best.)
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
        df_interp = df.reindex(full_idx)
        df_interp['price'] = df_interp['price'].ffill()

        # If starts with NaNs (because min_date < first price), fill with 0
        df_interp['price'] = df_interp['price'].fillna(0)

        # Convert back to dict {str: float}
        result = df_interp['price'].to_dict()
        return {k.strftime('%Y-%m-%d'): v for k, v in result.items()}

    except Exception as e:
        logger.error(f"Interpolation error for {isin}: {e}")
        return {}
