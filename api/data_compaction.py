import logging
import pandas as pd
from datetime import datetime, timedelta
from db_helper import execute_request, delete_table

logger = logging.getLogger("perix_monitor")

# --- PARAMETRI CONFIGURABILI ---
COMPACTION_RECENT_MONTHS = 6          # Mesi di "alta risoluzione" (Keep all)
COMPACTION_THRESHOLD_PCT = 0.005      # 0.5% variazione minima per Medium Term
COMPACTION_OLD_YEARS = 2              # Anni per Old Term (Weekly freq)

def compact_prices(isin=None, dry_run=True):
    """
    Esegue la compaction dei prezzi storici per ridurre lo spazio occupato
    senza perdere informazioni significative per i grafici (LOCF).
    
    Args:
        isin (str, optional): Se specificato, processa solo questo ISIN.
        dry_run (bool): Se True, non cancella nulla ma logga cosa farebbe.
    
    Returns:
        dict: Statistiche { 'total_rows': N, 'deleted_rows': M, 'details': [...] }
    """
    stats = {'total_rows': 0, 'deleted_rows': 0, 'details': []}
    
    # 1. Identifica gli ISIN da processare
    isins_to_process = []
    if isin:
        isins_to_process = [isin]
    else:
        # Fetch distinct ISINs from asset_prices
        # Note: Supabase doesn't support distinct via rest easily without rpc
        # We fetch all assets instead
        res_assets = execute_request('assets', 'GET', params={'select': 'isin'})
        if res_assets and res_assets.status_code == 200:
            isins_to_process = [r['isin'] for r in res_assets.json() if r.get('isin')]
        else:
            logger.error("COMPACTION: Failed to fetch assets list")
            return stats

    logger.info(f"COMPACTION: Processing {len(isins_to_process)} assets. DryRun={dry_run}")

    for current_isin in isins_to_process:
        try:
            # 2. Fetch Dati
            # Prezzi (> 10k rows might need pagination, but max limit usually 1000. Set explicit high limit)
            res_p = execute_request('asset_prices', 'GET', params={
                'select': 'id,date,price',
                'isin': f'eq.{current_isin}',
                'order': 'date.asc',
                'limit': '10000' 
            })
            if not res_p or res_p.status_code != 200:
                continue
                
            prices_data = res_p.json()
            if not prices_data:
                continue

            # Eventi protetti (Transazioni / Dividendi -> Date da NON cancellare)
            res_t = execute_request('transactions', 'GET', params={
                'select': 'date',
                'assets.isin': f'eq.{current_isin}',
                'assets': 'not.is.null' # hint for join
            }) # Note: Join syntax depends on setup, simplified:
            # Actually easier: fetch transactions by asset_id? No we have ISIN.
            # Let's filter by ISIN if possible or assume we need asset_id linkage.
            # Workaround: Fetch asset_id first or use inner join syntax:
            res_t = execute_request('transactions', 'GET', params={
                'select': 'date,assets!inner(isin)',
                'assets.isin': f'eq.{current_isin}'
            })
            
            res_d = execute_request('dividends', 'GET', params={
                'select': 'date,assets!inner(isin)',
                'assets.isin': f'eq.{current_isin}'
            })

            protected_dates = set()
            if res_t and res_t.status_code == 200:
                for t in res_t.json():
                    d_str = t.get('date', '')[:10]
                    if d_str: protected_dates.add(d_str)
            
            if res_d and res_d.status_code == 200:
                for d in res_d.json():
                    d_str = d.get('date', '')[:10]
                    if d_str: protected_dates.add(d_str)

            # 3. Elaborazione Pandas
            df = pd.DataFrame(prices_data)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
            
            total = len(df)
            if total < 10:
                continue

            # Mark rows to keep
            # Default: False (Candidate for deletion)
            df['keep'] = False 
            
            # Rule 1: Keep First and Last
            df.iloc[0, df.columns.get_loc('keep')] = True
            df.iloc[-1, df.columns.get_loc('keep')] = True
            
            # Rule 2: Keep Protected Dates
            df.loc[df['date'].astype(str).isin(protected_dates), 'keep'] = True
            
            # Rule 3: Time-based Logic
            now = datetime.now()
            cutoff_recent = now - timedelta(days=COMPACTION_RECENT_MONTHS*30)
            cutoff_old = now - timedelta(days=COMPACTION_OLD_YEARS*365)
            
            # A) Recent: Keep All
            df.loc[df['date'] > cutoff_recent, 'keep'] = True
            
            # B) Old: Weekly Frequency (keep first of each week)
            # Filter for Old range AND not already kept
            mask_old = (df['date'] < cutoff_old)
            if mask_old.any():
                # Group by Year-Week
                old_df = df[mask_old].copy()
                old_df['y_w'] = old_df['date'].dt.strftime('%Y-%U')
                # Keep first entry of each week
                ids_to_keep_weekly = old_df.groupby('y_w')['id'].first().values
                df.loc[df['id'].isin(ids_to_keep_weekly), 'keep'] = True

            # C) Medium Term (Between Old and Recent): Variation Filter
            # Iterate only rows that are NOT kept yet and in the medium range
            # To apply RDP-like logic efficiently, we iterate sequentially
            # Simple approach: If variation < X% from LAST KEPT POINT, drop.
            
            mask_medium = (df['date'] >= cutoff_old) & (df['date'] <= cutoff_recent)
            medium_indices = df[mask_medium].index
            
            if len(medium_indices) > 0:
                last_kept_price = df.iloc[medium_indices[0]]['price'] # Start with first in range
                # Ensure first in range is kept? No, rely on previous logic.
                # Find the actual last kept node before this range
                prev_kept = df[df.index < medium_indices[0]]
                if not prev_kept.empty:
                    last_kept_price = prev_kept.iloc[-1]['price']
                
                for idx in medium_indices:
                    # If already kept (e.g. protected date), update reference
                    if df.at[idx, 'keep']:
                        last_kept_price = df.at[idx, 'price']
                        continue
                        
                    curr_price = df.at[idx, 'price']
                    pct_diff = abs(curr_price - last_kept_price) / last_kept_price if last_kept_price > 0 else 1
                    
                    if pct_diff > COMPACTION_THRESHOLD_PCT:
                        # Significant change -> Keep
                        df.at[idx, 'keep'] = True
                        last_kept_price = curr_price
                    else:
                        # Redundant -> Leave keep=False (Delete)
                        pass
            
            # 4. Identification IDs to delete
            rows_to_delete = df[~df['keep']]
            ids_to_delete = rows_to_delete['id'].tolist()
            count = len(ids_to_delete)
            
            stats['total_rows'] += total
            stats['deleted_rows'] += count
            stats['details'].append(f"{current_isin}: {total} -> {total-count} (Removed {count})")
            
            if count > 0 and not dry_run:
                # Batch delete (chunks of 100 to be safe with URL length?)
                # Supabase DELETE accepts filtering. "id.in.(...)"
                # Limit chunk size
                chunk_size = 50
                for i in range(0, len(ids_to_delete), chunk_size):
                    chunk = ids_to_delete[i:i+chunk_size]
                    id_filter_str = f"({','.join(chunk)})"
                    
                    # Manually execute DELETE since delete_table helper is simple
                    # We utilize delete_table with 'id.in': id_filter_str
                    delete_table('asset_prices', {'id.in': id_filter_str})
                    
        except Exception as e:
            logger.error(f"COMPACTION ERROR {current_isin}: {e}")
            import traceback
            logger.error(traceback.format_exc())

    return stats

if __name__ == "__main__":
    # Test esecuzione
    import sys
    dry = True
    if len(sys.argv) > 1 and sys.argv[1] == '--commit':
        dry = False
    
    print(f"Starting Compaction (DryRun={dry})...")
    res = compact_prices(dry_run=dry)
    print("Result:", res)
