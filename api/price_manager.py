import logging
from datetime import datetime, timedelta
import pandas as pd
from db_helper import execute_request, upsert_table, update_table

logger = logging.getLogger("perix_monitor")

def save_price_snapshot(isin, price, date=None, source="Manual Upload"):
    """
    Salva o aggiorna (upsert) un prezzo per un ISIN.
    Restituisce True se successo, False altrimenti.
    """
    if not price or price <= 0:
        logger.warning(f"SALVATAGGIO PREZZO SALTATO: Prezzo non valido {price} per {isin}")
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
        # Upsert basato sul vincolo (isin, date, source)
        success = upsert_table('asset_prices', data, on_conflict='isin, date, source')
        if success:
            logger.debug(f"SALVATAGGIO PREZZO SUCCESS: {isin} = {price}€ ({date}) [{source}]")
            return True
        return False
    except Exception as e:
        logger.error(f"SALVATAGGIO PREZZO FALLITO: {isin} -> {e}")
        return False

def get_price_history(isin, days=None):
    """
    Recupera la storia prezzi per un ISIN, unendo:
    1. 'asset_prices' (Dati Manuali/Mercato)
    2. 'transactions' (Prezzi impliciti da Acquisti/Vendite)
    
    Parametro 'days': se fornito, limita il recupero agli ultimi N giorni.
    
    Restituisce lista di dict: [{'date': 'YYYY-MM-DD', 'price': float, 'source': str}, ...]
    ordinata per data crescente.
    """
    try:
        cutoff_date = None
        if days:
            cutoff_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

        # 1. Recupera Prezzi Espliciti
        params = {
            'select': 'price,date,source',
            'isin': f'eq.{isin}',
            'order': 'date.asc'
        }
        if cutoff_date:
            params['date'] = f'gte.{cutoff_date}'

        res_prices = execute_request(
            'asset_prices', 
            'GET', 
            params=params
        )
        prices_list = res_prices.json() if res_prices and res_prices.status_code == 200 else []
        
        # 2. Recupera Prezzi Transazioni (Impliciti)
        trans_params = {
            'select': 'price_eur,date,type,assets!inner(isin)',
            'assets.isin': f'eq.{isin}',
            'price_eur': 'neq.0',
            'order': 'date.asc'
        }
        if cutoff_date:
            trans_params['date'] = f'gte.{cutoff_date}'

        res_trans = execute_request(
            'transactions',
            'GET',
            params=trans_params
        )
        trans_data = res_trans.json() if res_trans and res_trans.status_code == 200 else []

        if trans_data:
            for t in trans_data:
                # Add transaction prices as 'Transaction' source
                d_str = t['date']
                if 'T' in d_str: d_str = d_str.split('T')[0]
                
                prices_list.append({
                    "price": float(t['price_eur']),
                    "date": d_str,
                    "source": f"Transaction ({t['type']})"
                })
        
        if not prices_list:
            return []

        # 3. Unione e Deduplicazione
        if not prices_list:
            return []

        df = pd.DataFrame(prices_list)
        df['date'] = pd.to_datetime(df['date'], format='mixed', dayfirst=False)
        
        # Deduplicazione logica: se abbiamo la stessa data e lo stesso prezzo, 
        # preferiamo la fonte più specifica "Transaction (BUY)" rispetto a "Transaction"
        # o preserviamo "Manual Upload" se differente.
        
        # Sort by date, then source length descending (so 'Transaction (BUY)' > 'Transaction')
        df['source_len'] = df['source'].str.len()
        df = df.sort_values(by=['date', 'source_len'], ascending=[True, False])
        
        # Drop duplicates where date, price are identical (keep the first which is longest source name)
        df = df.drop_duplicates(subset=['date', 'price'], keep='first')
        
        # Final sort by date descending (per il frontend)
        df = df.sort_values(by='date', ascending=False)
        
        result = []
        for _, row in df.iterrows():
            result.append({
                "date": row['date'].strftime('%Y-%m-%d'),
                "price": row['price'],
                "source": row.get('source', 'Unknown')
            })
            
        return result

    except Exception as e:
        logger.error(f"Errore recupero storia unificata per {isin}: {e}")
        return []

def update_asset_trend(isin):
    """
    Ricalcola e salva il trend dell'asset basandosi sugli ultimi due prezzi disponibili.
    """
    try:
        history = get_price_history(isin) # Già ordinata DESC dalla mia modifica precedente
        if len(history) < 2:
            # Non ci sono abbastanza dati per un trend
            update_table('assets', {
                'last_trend_variation': None,
                'last_trend_days': None,
                'last_trend_ts': datetime.now().isoformat()
            }, {'isin': isin})
            return

        latest = history[0]
        penultimate = history[1]
        
        p1 = float(latest['price'])
        p2 = float(penultimate['price'])
        
        logger.info(f"[TREND DEBUG] ISIN={isin} | Latest: data={latest['date']}, prezzo={p1} | Penultimate: data={penultimate['date']}, prezzo={p2}")
        
        if p2 == 0:
            return

        variation = ((p1 - p2) / p2) * 100
        
        # Calcola i giorni di differenza
        d1 = datetime.strptime(latest['date'], '%Y-%m-%d')
        d2 = datetime.strptime(penultimate['date'], '%Y-%m-%d')
        days = (d1 - d2).days

        update_table('assets', {
            'last_trend_variation': variation,
            'last_trend_days': days,
            'last_trend_ts': datetime.now().isoformat()
        }, {'isin': isin})
        
        logger.info(f"TREND AGGIORNATO per {isin}: {variation:.2f}% ({days} giorni)")

    except Exception as e:
        logger.error(f"Errore ricalcolo trend per {isin}: {e}")

def get_latest_price(isin):
    """
    Recupera il prezzo più recente per un ISIN.
    Usa la storia unificata (Prezzi + Transazioni).
    """
    try:
        history = get_price_history(isin)
        if history:
            return history[0]  # history è ordinata per data DESC → [0] = più recente
        return None
    except Exception as e:
        logger.error(f"Errore recupero ultimo prezzo per {isin}: {e}")
        return None

def get_latest_prices_batch(isins):
    """
    OTTIMIZZAZIONE: Recupera l'ultimo prezzo per una lista di ISIN in un'unica (doppia) chiamata.
    Restituisce un dizionario {isin: {'price': float, 'date': str, 'source': str}}
    """
    if not isins:
        return {}
    
    try:
        unique_isins = list(set(isins))
        # Supabase filter syntax for IN: column=in.(val1,val2,...)
        in_filter = f"in.({','.join(unique_isins)})"
        
        prices_map = {} 

        # Fetch Asset Prices
        res_prices = execute_request(
            'asset_prices',
            'GET',
            params={
                'select': 'isin,price,date,source',
                'isin': in_filter
            }
        )
        
        # Fetch Transaction Prices
        # Note: filtering inner join with dot notation
        res_trans = execute_request(
             'transactions',
             'GET',
             params={
                 'select': 'price_eur,date,type,assets!inner(isin)',
                 'assets.isin': in_filter,
                 'price_eur': 'neq.0'
             }
        )

        all_data = []
        if res_prices and res_prices.status_code == 200:
            all_data.extend(res_prices.json())
        
        if res_trans and res_trans.status_code == 200:
            for t in res_trans.json():
                d_str = t['date']
                if 'T' in d_str: d_str = d_str.split('T')[0]
                all_data.append({
                    "isin": t['assets']['isin'],
                    "price": float(t['price_eur']),
                    "date": d_str,
                    "source": f"Transaction ({t['type']})"
                })

        if not all_data:
            return {}

        df = pd.DataFrame(all_data)
        df['date'] = pd.to_datetime(df['date'], format='mixed', dayfirst=False)
        df = df.sort_values(by='date')
        
        latest_df = df.groupby('isin').tail(1)
        
        for _, row in latest_df.iterrows():
            prices_map[row['isin']] = {
                "price": float(row['price']),
                "date": row['date'].strftime('%Y-%m-%d'),
                "source": row.get('source', 'Calculated')
            }
            
        return prices_map

    except Exception as e:
        logger.error(f"Errore recupero prezzi batch: {e}")
        return {}

def get_price_before_date(isin, target_date_str):
    """
    Recupera il prezzo più recente per un ISIN strettamente PRIMA della target_date.
    """
    try:
        history = get_price_history(isin)
        if not history:
            return None
            
        target_date = datetime.strptime(target_date_str, "%Y-%m-%d")
        
        for entry in reversed(history):
            entry_date = datetime.strptime(entry['date'], "%Y-%m-%d")
            if entry_date < target_date:
                return entry
                
        return None
    except Exception as e:
        logger.error(f"Errore recupero prezzo prima di {target_date_str} per {isin}: {e}")
        return None

def calculate_projected_trend(isin, candidate_prices):
    """
    Calcola il 'Trend Ipotetico' confrontando le Candidate Prices con la storia DB 
    per rilevare aggiornamenti e calcolare la Variazione.
    """
    try:
        if not candidate_prices:
            return None

        # 1. Recupera lo storico. get_price_history ritorna ord. descrescente per data.
        history = get_price_history(isin) or []
        # Per sicurezza, re-ordiniamo desc:
        history.sort(key=lambda x: datetime.strptime(x['date'], "%Y-%m-%d"), reverse=True)
        
        # Selezioniamo il prezzo candidato più recente fornito nel file
        target_cand = max(candidate_prices, key=lambda x: datetime.strptime(x.get('date', '1900-01-01'), "%Y-%m-%d"))
        target_date = target_cand.get('date')
        target_price = target_cand.get('price')
        
        if not target_date or target_price is None:
            return None
            
        target_price = float(target_price)

        # Cerchiamo l'old_price: il prezzo con la prima data <= target_date presente in DB.
        old_price = None
        old_date = None
        is_update = False

        for entry in history:
            db_date = entry['date']
            db_price = entry['price']
            
            if db_date == target_date:
                is_update = True
                old_price = db_price
                old_date = db_date
                break
            elif datetime.strptime(db_date, "%Y-%m-%d") < datetime.strptime(target_date, "%Y-%m-%d"):
                old_price = db_price
                old_date = db_date
                break

        if old_price is None:
            # Asset nuovo o data più vecchia mai inserita
            variation_pct = 0.0
            days_delta = 0
            old_price = 0.0
        else:
            if old_price == 0:
                variation_pct = 0.0
            else:
                variation_pct = ((target_price - old_price) / old_price) * 100
                
            d1 = datetime.strptime(old_date, "%Y-%m-%d")
            d2 = datetime.strptime(target_date, "%Y-%m-%d")
            days_delta = abs((d2 - d1).days)

        return {
            'latest_price': target_price,
            'latest_date': target_date,
            'previous_price': old_price,
            'previous_date': old_date,
            'variation_pct': variation_pct,
            'days_delta': days_delta,
            'is_update': is_update
        }

    except Exception as e:
        logger.error(f"Errore calcolo trend per {isin}: {e}")
        return None

def get_interpolated_price_history(isin, min_date=None, max_date=None):
    """
    Recupera storia prezzi e interpola i giorni mancanti usando LOCF.
    """
    raw_history = get_price_history(isin)
    
    if not raw_history:
        return {}

    try:
        df = pd.DataFrame(raw_history)
        df['date'] = pd.to_datetime(df['date'], format='mixed', dayfirst=False)
        df = df.sort_values(by='date')
        df = df.set_index('date')

        df = df[~df.index.duplicated(keep='last')]
        
        start = min_date if min_date else df.index.min()
        if not max_date:
            max_date = datetime.now()
            
        end = max_date

        if start > end:
            return {}

        full_idx = pd.date_range(start=start, end=end, freq='D')
        
        df_interp = df.reindex(full_idx)
        df_interp['price'] = df_interp['price'].ffill()
        df_interp['price'] = df_interp['price'].fillna(0)

        result = df_interp['price'].to_dict()
        return {k.strftime('%Y-%m-%d'): v for k, v in result.items()}

    except Exception as e:
        logger.error(f"Errore interpolazione per {isin}: {e}")
        return {}

def get_interpolated_price_history_batch(isins, min_date=None, max_date=None):
    """
    OTTIMIZZAZIONE: Versione batch di get_interpolated_price_history.
    """
    if not isins:
        return {}

    unique_isins = list(set(isins))
    result_map = {}

    try:
        in_filter = f"in.({','.join(unique_isins)})"
        
        # [PERF] Build date filter for server-side filtering.
        # Without this, ALL historical prices are downloaded even when only a
        # recent window is needed. With years of data, this is the biggest
        # payload reduction (up to 90% fewer rows transferred).
        prices_params = {'select': 'isin,price,date', 'isin': in_filter}
        trans_params = {'select': 'price_eur,date,assets!inner(isin)', 'assets.isin': in_filter, 'price_eur': 'neq.0'}
        
        if min_date:
            date_str = min_date.strftime('%Y-%m-%d') if hasattr(min_date, 'strftime') else str(min_date)
            prices_params['date'] = f'gte.{date_str}'
            trans_params['date'] = f'gte.{date_str}'
        
        # 1. Fetch BULK (now with optional date filter)
        res_prices = execute_request('asset_prices', 'GET', params=prices_params)
        res_trans = execute_request('transactions', 'GET', params=trans_params)
        
        all_data = []
        if res_prices and res_prices.status_code == 200: all_data.extend(res_prices.json())
        if res_trans and res_trans.status_code == 200:
            for t in res_trans.json():
                 d_str = t['date']
                 if 'T' in d_str: d_str = d_str.split('T')[0]
                 all_data.append({
                     'isin': t['assets']['isin'],
                     'price': float(t['price_eur']),
                     'date': d_str
                 })
        
        if not all_data:
            return {}

        # 2. Elaborazione in Pandas
        df_all = pd.DataFrame(all_data)
        df_all['date'] = pd.to_datetime(df_all['date'], format='mixed', dayfirst=False)
        
        if not max_date: max_date = datetime.now()
        
        for isin, group in df_all.groupby('isin'):
            group = group.sort_values('date').set_index('date')
            group = group[~group.index.duplicated(keep='last')]
            
            asset_start = min_date if min_date else group.index.min()
            
            if asset_start > max_date:
                result_map[isin] = {}
                continue
                
            idx = pd.date_range(start=asset_start, end=max_date, freq='D')
            
            interp = group.reindex(idx)
            interp['price'] = interp['price'].ffill().fillna(0)
            
            res_dict = interp['price'].to_dict()
            result_map[isin] = {k.strftime('%Y-%m-%d'): v for k, v in res_dict.items()}

        return result_map

    except Exception as e:
        logger.error(f"Errore interpolazione batch: {e}")
        return {}

