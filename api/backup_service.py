import json
import io
from datetime import datetime
from db_helper import execute_request, upsert_table, query_table
from logger import logger
from price_manager import get_latest_prices_batch
from finance import xirr, get_tiered_mwr

def create_backup_payload(portfolio_id):
    """
    Generates the complete backup JSON payload for a given portfolio.
    Structure:
    {
        "metadata": { "version": "1.0", "created_at": "...", "app": "PerixMonitor" },
        "portfolio": { ... },
        "transactions": [ ... ],
        "dividends": [ ... ],
        "snapshots": [ ... ],
        "notes": [ ... ],
        "settings": [ ... ],
        "report": { ... } # Pre-calculated summary
    }
    """
    try:
        # 1. Fetch Portfolio
        res_p = execute_request('portfolios', 'GET', params={'id': f'eq.{portfolio_id}', 'select': '*'})
        if not res_p or res_p.status_code != 200:
            raise Exception("Portfolio not found")
        portfolio = res_p.json()[0]

        # 2. Fetch Dependent Data
        t_params = {'portfolio_id': f'eq.{portfolio_id}', 'select': '*, assets(isin, name, currency, asset_class)'}
        res_t = execute_request('transactions', 'GET', params=t_params)
        transactions = res_t.json() if res_t and res_t.status_code == 200 else []

        d_params = {'portfolio_id': f'eq.{portfolio_id}', 'select': '*, assets(isin)'}
        res_d = execute_request('dividends', 'GET', params=d_params)
        dividends = res_d.json() if res_d and res_d.status_code == 200 else []

        s_params = {'portfolio_id': f'eq.{portfolio_id}'}
        res_s = execute_request('snapshots', 'GET', params=s_params)
        snapshots = res_s.json() if res_s and res_s.status_code == 200 else []

        n_params = {'portfolio_id': f'eq.{portfolio_id}', 'select': '*, assets(isin)'}
        res_n = execute_request('asset_notes', 'GET', params=n_params)
        notes = res_n.json() if res_n and res_n.status_code == 200 else []

        set_params = {'portfolio_id': f'eq.{portfolio_id}', 'select': '*, assets(isin)'}
        res_set = execute_request('portfolio_asset_settings', 'GET', params=set_params)
        settings = res_set.json() if res_set and res_set.status_code == 200 else []

        # 3. Fetch UI & Global Settings (app_config)
        # We want:
        # - memory_settings_{user_id}_{portfolio_id}
        # - openai_config
        # - asset_variation_threshold_{portfolio_id} (if exists) or global thresholds
        
        # We'll fetch all and filter by key pattern
        res_config = execute_request('app_config', 'GET', params={'select': '*'})
        all_config = res_config.json() if res_config and res_config.status_code == 200 else []
        
        ui_config = []
        target_patterns = [
            f"memory_settings_", # We'll filter for {portfolio_id} inside the loop or use ilike
            "openai_config",
            "asset_variation_threshold" # Global or per-portfolio
        ]
        
        for cfg in all_config:
            key = cfg.get('key', '')
            # Portfolio specific memory settings
            if key.startswith("memory_settings_") and key.endswith(f"_{portfolio_id}"):
                ui_config.append(cfg)
            # Global or portfolio-specific price threshold
            elif key == "price_variation_threshold" or key == f"price_variation_threshold_{portfolio_id}":
                ui_config.append(cfg)
            # Global AI Config
            elif key == "openai_config":
                ui_config.append(cfg)

        # 4. Fetch Historical Prices for involved Assets
        # Collect all ISINs
        isins = set()
        for t in transactions:
            if t.get('assets') and t['assets'].get('isin'): isins.add(t['assets']['isin'])
        for d in dividends:
            if d.get('assets') and d['assets'].get('isin'): isins.add(d['assets']['isin'])
        # [NEW] Collect from Notes and Settings
        for n in notes:
            if n.get('assets') and n['assets'].get('isin'): isins.add(n['assets']['isin'])
        for s in settings:
            if s.get('assets') and s['assets'].get('isin'): isins.add(s['assets']['isin'])
        
        prices = []
        if isins:
            # We want ALL history for these ISINs
            # Filter by isin IN (...)
            in_filter = f"in.({','.join(isins)})"
            # We assume execute_request can handle this or we might need batching if too many assets.
            # safe batching 
            isin_list = list(isins)
            batch_size = 30 # Reduced to prevent URL overly long
            for i in range(0, len(isin_list), batch_size):
                batch = isin_list[i:i+batch_size]
                p_filter = f"in.({','.join(batch)})"
                
                # [FIX] Pagination Loop
                offset = 0
                limit = 1000
                while True:
                    # Order by date asc to be clean
                    res_prices = execute_request('asset_prices', 'GET', params={
                        'isin': p_filter, 
                        'order': 'date.asc',
                        'limit': limit,
                        'offset': offset
                    })
                    
                    if not res_prices or res_prices.status_code != 200:
                        logger.error(f"BACKUP: Failed to fetch prices batch offset {offset}")
                        break
                    
                    batch_data = res_prices.json()
                    if not batch_data:
                        break
                        
                    prices.extend(batch_data)
                    
                    if len(batch_data) < limit:
                        break # End of data for this batch
                        
                    offset += limit
        
        # 4b. [NEW] Fetch Full Asset Details (Metadata, Trends, Sector, etc.)
        assets_full = []
        if isins:
            isin_list = list(isins)
            asset_batch_size = 50
            for i in range(0, len(isin_list), asset_batch_size):
                batch = isin_list[i:i+asset_batch_size]
                in_filter = f"in.({','.join(batch)})"
                res_assets = execute_request('assets', 'GET', params={'isin': in_filter, 'select': '*'})
                if res_assets and res_assets.status_code == 200:
                    assets_full.extend(res_assets.json())
                else:
                    logger.error(f"BACKUP: Failed to fetch assets batch {i}")

        # 5. Generate Report (Summary)
        report = generate_backup_report(portfolio, transactions, dividends, snapshots)

        # 6. Assemble Payload
        payload = {
            "metadata": {
                "version": "1.3", # Bump for Assets support
                "created_at": datetime.now().isoformat(),
                "app": "PerixMonitor"
            },
            "portfolio": portfolio,
            "assets": assets_full, # [NEW] Full Asset Metadata
            "transactions": transactions,
            "dividends": dividends,
            "snapshots": snapshots,
            "notes": notes,
            "settings": settings,
            "ui_config": ui_config,
            "prices": prices,
            "report": report
        }
        
        return payload

    except Exception as e:
        logger.error(f"BACKUP CREATE FAILED: {e}")
        raise e

from dashboard import calculate_portfolio_summary

def generate_backup_report(portfolio, transactions, dividends, snapshots):
    """
    Generates a summary report for the backup preview.
    Uses the SHARED dashboard calculation logic for total consistency.
    """
    portfolio_id = portfolio.get('id')
    
    # Call the exact same logic used by the dashboard
    summary = calculate_portfolio_summary(portfolio_id)
    
    data = {
        "portfolio_name": portfolio.get('name'),
        "total_transactions": len(transactions),
        "total_dividends": len(dividends),
        "asset_count": len(summary.get('allocation', [])),
        "first_activity": None,
        "last_activity": None,
        "initial_value": 0.0,
        "final_value": summary.get('total_value', 0.0),
        "overall_mwr": summary.get('xirr', 0.0), # Already in percentage from calculate_portfolio_summary
        "assets_list": [a['name'] for a in summary.get('allocation', [])]
    }

    # First/Last activity dates (still need to extract from transactions/dividends for the report)
    dates = []
    for t in transactions:
        t_date_str = t.get('date')
        if t_date_str:
            try:
                dt = datetime.fromisoformat(t_date_str.split('T')[0])
                dates.append(dt)
            except: pass
    for d in dividends:
        d_date_str = d.get('date')
        if d_date_str:
            try:
                dt = datetime.fromisoformat(d_date_str.split('T')[0])
                dates.append(dt)
            except: pass
    
    if dates:
        dates.sort()
        data['first_activity'] = dates[0].strftime('%Y-%m-%d')
        data['last_activity'] = dates[-1].strftime('%Y-%m-%d')

    # Initial Value calculation from snapshots
    if snapshots:
        sorted_snaps = sorted(snapshots, key=lambda x: x.get('date') or '')
        data['initial_value'] = float(sorted_snaps[0].get('total_eur', 0) or 0)
    else:
        # Fallback: if no snapshots, try to find the very first transaction value
        data['initial_value'] = 0.0

    return data

def analyze_backup_file(file_content):
    """
    Parses uploaded JSON file and validates content.
    Returns the report and unique name proposal.
    """
    try:
        data = json.loads(file_content)
        
        # Validation
        if "metadata" not in data or "portfolio" not in data:
            raise Exception("Formato file non valido (mancano metadati o portfolio)")

        report = data.get("report", {})
        original_name = data["portfolio"].get("name", "Imported Portfolio")
        backup_date = data["metadata"].get("created_at")

        # Propose Unique Name
        proposed_name = original_name
        
        # Check uniqueness in DB
        res = execute_request('portfolios', 'GET', params={'select': 'id,name'})
        existing_names = [p['name'] for p in res.json()] if res and res.status_code == 200 else []
        
        counter = 1
        while proposed_name in existing_names:
            proposed_name = f"{original_name} ({counter})"
            counter += 1

        return {
            "valid": True,
            "report": report,
            "backup_date": backup_date,
            "original_name": original_name,
            "proposed_name": proposed_name,
            "data_preview": data # We might send back the data or just keep it in FE
        }

    except Exception as e:
        logger.error(f"BACKUP ANALYZE FAILED: {e}")
        return {"valid": False, "error": str(e)}

def restore_backup(data_json, new_name, user_id=None):
    """
    Restores the backup into a NEW portfolio with new_name.
    """
    try:
        from db_helper import execute_request, upsert_table

        # 1. Create New Portfolio
        p_data = data_json["portfolio"]
        
        # Create Payload
        new_portfolio = {
            "name": new_name,
            "settings": p_data.get("settings", {}),
            "user_id": user_id 
        }
        
        # Insert and get ID
        res_p = execute_request('portfolios', 'POST', body=new_portfolio, headers={"Prefer": "return=representation"})
        if not res_p or res_p.status_code != 201:
            raise Exception(f"Failed to create portfolio: {res_p.text}")
        
        new_pid = res_p.json()[0]['id']
        logger.info(f"RESTORE: Created new portfolio {new_pid} ('{new_name}')")

        # 2. RESTORE ASSETS (Improved with Metadata Support)
        asset_id_map = {}
        existing_assets = {} # isin -> id
        
        backup_assets_list = data_json.get("assets", [])
        assets_payload = [] # List of dicts for upsert
        old_id_map_by_isin = {} # isin -> old_id (from backup)
        
        if backup_assets_list:
            # --- NEW BACKUP FORMAT (Rich Metadata) ---
            logger.info(f"RESTORE: Using rich asset metadata from backup ({len(backup_assets_list)} assets).")
            for a in backup_assets_list:
                isin = a.get('isin')
                if not isin: continue
                
                old_id_map_by_isin[isin] = a.get('id')
                
                # Prepare for upsert: remove IDs/Timestamp, keep metadata
                cleaned = a.copy()
                if 'id' in cleaned: del cleaned['id']
                if 'created_at' in cleaned: del cleaned['created_at']
                
                assets_payload.append(cleaned)
                
        else:
            # --- LEGACY BACKUP FORMAT (Scan Transactions) ---
            logger.info("RESTORE: Legacy backup format detected. Scanning transactions for assets...")
            assets_found = {} # isin -> info
            
            def scan_source(source_list, key_prefix="Transaction"):
                for item in source_list:
                    asset_info = item.get('assets')
                    old_aid = item.get('asset_id')
                    if asset_info and asset_info.get('isin'):
                        isin = asset_info.get('isin')
                        # Capture mapping
                        old_id_map_by_isin[isin] = old_aid
                        
                        if isin not in assets_found:
                            assets_found[isin] = {
                                'isin': isin,
                                'name': asset_info.get('name') or isin,
                                'asset_class': asset_info.get('asset_class') or 'ETF',
                                'currency': asset_info.get('currency') or 'EUR'
                            }

            scan_source(data_json.get("transactions", []), "Transaction")
            scan_source(data_json.get("dividends", []), "Dividend")
            scan_source(data_json.get("notes", []), "Note")
            scan_source(data_json.get("settings", []), "Setting")
            
            assets_payload = list(assets_found.values())

        # 3. UPSERT ASSETS (Create Missing or Update Metadata)
        if assets_payload:
            # Batch Upsert using on_conflict='isin'
            chunk_size = 50
            for i in range(0, len(assets_payload), chunk_size):
                chunk = assets_payload[i:i+chunk_size]
                if not upsert_table('assets', chunk, on_conflict='isin'):
                    logger.warning(f"RESTORE: Asset batch {i} upsert had issues.")
        
        # 4. RE-BUILD ID MAP (Fetch actual IDs from DB)
        if old_id_map_by_isin:
            target_isins = list(old_id_map_by_isin.keys())
            chunk_size = 100
            for i in range(0, len(target_isins), chunk_size):
                batch = target_isins[i:i+chunk_size]
                in_filter = f"in.({','.join(batch)})"
                res_assets = execute_request('assets', 'GET', params={'select': 'id,isin', 'isin': in_filter})
                
                if res_assets and res_assets.status_code == 200:
                    for row in res_assets.json():
                        existing_assets[row['isin']] = row['id']
            
            # Populate Map
            for isin, new_id in existing_assets.items():
                old_id = old_id_map_by_isin.get(isin)
                if old_id:
                    asset_id_map[old_id] = new_id

        # Define variables used in subsequent blocks (previously defined in scanning block)
        txs = data_json.get("transactions", [])
        divs = data_json.get("dividends", [])

        # 3. Restore Transactions (with Remapping)
        if txs:
            clean_txs = []
            for t in txs:
                # Remap Asset ID
                old_aid = t.get('asset_id')
                # Try map, fallback to old if not found (risky, but what else?)
                # If we don't have a map, it means asset might be missing or no ISIN in backup.
                real_aid = asset_id_map.get(old_aid)
                
                if not real_aid:
                    # Try to lookup by ISIN inside this specific record if map failed
                    # (Edge case where distinct original_ids for same ISIN)
                    if t.get('assets') and t['assets'].get('isin'):
                        real_aid = existing_assets.get(t['assets']['isin'])
                
                if not real_aid:
                    logger.warning(f"RESTORE: Skipping transaction {t.get('id')} - Asset ID {old_aid} not found/remappable.")
                    continue
                    
                t['asset_id'] = real_aid
                t['portfolio_id'] = new_pid
                
                # Cleaning
                if 'id' in t: del t['id'] 
                if 'assets' in t: del t['assets']
                
                clean_txs.append(t)
            
            if clean_txs:
                upsert_table('transactions', clean_txs)

        # 4. Restore Dividends (with Remapping)
        if divs:
            clean_divs = []
            for d in divs:
                # Remap
                old_aid = d.get('asset_id')
                real_aid = asset_id_map.get(old_aid)
                
                # Fallback lookup
                if not real_aid and d.get('assets') and d['assets'].get('isin'):
                     real_aid = existing_assets.get(d['assets']['isin'])
                     
                if not real_aid:
                    continue

                d['asset_id'] = real_aid
                d['portfolio_id'] = new_pid
                if 'id' in d: del d['id']
                if 'assets' in d: del d['assets']
                clean_divs.append(d)
                
            if clean_divs:
                upsert_table('dividends', clean_divs)

        # 5. Restore Snapshots
        snaps = data_json.get("snapshots", [])
        if snaps:
            for s in snaps:
                s['portfolio_id'] = new_pid
                if 'id' in s: del s['id']
            upsert_table('snapshots', snaps)

        # 6. Restore Notes (with Remapping)
        notes = data_json.get("notes", [])
        if notes:
            clean_notes = []
            for n in notes:
                # Remap
                old_aid = n.get('asset_id')
                real_aid = asset_id_map.get(old_aid)
                
                # Fallback
                if not real_aid and n.get('assets') and n['assets'].get('isin'):
                     real_aid = existing_assets.get(n['assets']['isin'])
                
                if not real_aid: continue
                
                n['asset_id'] = real_aid
                n['portfolio_id'] = new_pid
                if 'id' in n: del n['id']
                if 'assets' in n: del n['assets']
                clean_notes.append(n)
                
            if clean_notes:
                upsert_table('asset_notes', clean_notes)
            
        # 7. Restore Asset Settings (with Remapping)
        as_sets = data_json.get("settings", [])
        if as_sets:
            clean_sets = []
            for s in as_sets:
                # Remap
                old_aid = s.get('asset_id')
                real_aid = asset_id_map.get(old_aid)
                
                 # Fallback
                if not real_aid and s.get('assets') and s['assets'].get('isin'):
                     real_aid = existing_assets.get(s['assets']['isin'])
                
                if not real_aid: continue

                s['asset_id'] = real_aid
                s['portfolio_id'] = new_pid
                if 'id' in s: del s['id']
                if 'assets' in s: del s['assets']
                clean_sets.append(s)
                
            if clean_sets:
                upsert_table('portfolio_asset_settings', clean_sets)

        # 8. Restore UI Config (app_config) - With RE-MAPPING
        ui_cfg = data_json.get("ui_config", [])
        if ui_cfg:
            old_pid = data_json["portfolio"].get("id")
            for cfg in ui_cfg:
                key = cfg.get('key', '')
                # Remap memory settings: memory_settings_{user_id}_{old_pid} -> ..._{new_pid}
                if key.startswith("memory_settings_") and key.endswith(f"_{old_pid}"):
                    new_key = key.replace(f"_{old_pid}", f"_{new_pid}")
                    cfg['key'] = new_key
                # Remap threshold: price_variation_threshold_{old_pid} -> ..._{new_pid}
                elif key == f"price_variation_threshold_{old_pid}":
                    cfg['key'] = f"price_variation_threshold_{new_pid}"
                
                # Remove original PK to avoid conflicts, rely on 'key' for upsert
                if 'id' in cfg: del cfg['id']
                
                # Direct upsert to app_config table
                upsert_table('app_config', cfg, on_conflict='key')

        # 9. Restore Asset Prices (Global Data)
        # These are shared across portfolios, but we restore them to ensure history exists.
        # We perform an upsert (DO NOTHING on conflict usually, or Update? 
        # Since it's history, if it exists it should be same. We'll use upsert)
        prices = data_json.get("prices", [])
        if prices:
            logger.info(f"RESTORE: Restoring {len(prices)} historical prices...")
            # Chunking for performance if many prices
            chunk_size = 1000
            for i in range(0, len(prices), chunk_size):
                chunk = prices[i:i + chunk_size]
                # cleanup
                for p in chunk:
                    if 'id' in p: del p['id']
                    if 'created_at' in p: del p['created_at']
                
                upsert_table('asset_prices', chunk, on_conflict='isin, date, source')

        return {"success": True, "new_portfolio_id": new_pid}

    except Exception as e:
        logger.error(f"RESTORE FAILED: {e}")
        raise e
