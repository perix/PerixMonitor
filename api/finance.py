import numpy as np
import datetime

def xirr(transactions, guess=0.1):
    """
    Calcola XIRR (Extended Internal Rate of Return) per una lista di transazioni.
    
    Args:
        transactions: lista di dict con 'date' (datetime) e 'amount' (float).
                      Entrate (Inflows) sono negative, Uscite/Valore Corrente (Outflows) positive.
                      
    Returns:
        float: Valore XIRR (annualizzato).
    """
    dates = [t['date'] for t in transactions]
    amounts = [t['amount'] for t in transactions]

    if not dates or not amounts:
        return 0.0

    amounts = np.array(amounts)
    # Controllo cambio segno
    if np.all(amounts >= 0) or np.all(amounts <= 0):
        return 0.0

    min_date = min(dates)
    # Converti date in frazione di anni da min_date
    years = np.array([(d - min_date).days / 365.0 for d in dates])
    
    # Metodo Newton-Raphson
    rate = guess
    max_iter = 100
    tol = 1e-6
    
    for _ in range(max_iter):
        # Prevenzione divisione per zero o errori con (1+rate) <= 0
        if rate <= -1.0:
            rate = -0.99 + 1e-9 # Bounce back
            
        # Funzione NPV = sum( C_i / (1+r)^t_i )
        # Power rule: (1+rate)**years
        try:
            factor = (1 + rate) ** years
            npv = np.sum(amounts / factor)
            
            # Derivata: sum( - t_i * C_i / (1+r)^(t_i+1) )
            # derivata di (1+r)^-t è -t * (1+r)^(-t-1)
            # Quindi d/dr [C * (1+r)^-t] = C * -t * (1+r)^-(t+1) = -C * t / (1+rate)^(t+1)
            
            deriv = -np.sum(amounts * years / (factor * (1 + rate)))
            
            if abs(deriv) < 1e-9: # Evita divisione zero
                break
                
            new_rate = rate - npv / deriv
            
            if abs(new_rate - rate) < tol:
                return new_rate
            
            rate = new_rate
        except Exception:
            return None
            
    return rate

def deannualize_xirr(annual_xirr, days):
    """
    Converte XIRR annualizzato in rendimento di periodo per numero di giorni.
    Formula: (1 + r_annual)^(days/365) - 1
    """
    if days <= 0: return 0.0
    try:
        # Gestisce casi in cui annual_xirr è generico o vicino a -1
        return ((1 + annual_xirr) ** (days / 365.0)) - 1
    except:
        return annual_xirr # Fallback

def get_tiered_mwr(cash_flows, current_value, t1=30, t2=365, end_date=None):
    """
    Calcola MWR basato su logica a livelli (Tiered):
    - Giorni < T1: Ritorno Semplice (Total Gain / Net Invested)
    - T1 <= Giorni < T2: Ritorno di Periodo (XIRR De-annualizzato)
    - Giorni >= T2: XIRR Annualizzato
    
    Returns: (mwr_value_percent, mwr_type_string)
    """
    if not cash_flows:
        return 0.0, "NONE"
        
    # Ordina flussi per data
    sorted_flows = sorted(cash_flows, key=lambda x: x['date'])
    start_date = sorted_flows[0]['date']
    
    if end_date is None:
        end_date = datetime.datetime.now()
    
    # Calcola durata
    duration_days = (end_date - start_date).days
    if duration_days < 0: duration_days = 0
    
    # Aggiungi valore corrente come flusso finale per XIRR
    calc_flows = sorted_flows + [{"date": end_date, "amount": current_value}]
    
    # Log inputs for debug
    from logger import logger
    logger.info(f"[FINANCE] get_tiered_mwr: dur={duration_days}d, val={current_value}, end={end_date.strftime('%Y-%m-%d')}")
    # logger.info(f"[FINANCE] calc_flows: {[{'d': f['date'].strftime('%Y-%m-%d'), 'a': f['amount']} for f in calc_flows]}")
    
    # --- Tier 1: Ritorno Semplice ---
    if duration_days < t1:
        # P&L % Semplice = (Valore Corrente - Netto Investito) / Netto Investito
        # Netto investito è la somma degli outflow (negativi in input cash_flow, qui li vogliamo come costo positivo)
        
        # Approccio Net Cash Flow: Somma(Tutti i flussi eccetto finale).
        # In sorted_flows, gli acquisti sono Negativi.
        net_cash_input = sum(-f['amount'] for f in sorted_flows) # Positivo significa denaro immesso
        
        if net_cash_input <= 0.0001: 
             # Edge case: Nessun investimento netto o negativo (prelievi > depositi)
             return 0.0, "SIMPLE"
             
        simple_return = (current_value - net_cash_input) / net_cash_input
        return round(simple_return * 100, 2), "SIMPLE"

    # --- Tier 2 & 3: Base XIRR ---
    xirr_val = xirr(calc_flows)
    if xirr_val is None:
        return 0.0, "ERROR"
        
    if duration_days < t2:
        # Tier 2: Ritorno di Periodo
        period_val = deannualize_xirr(xirr_val, duration_days)
        return round(period_val * 100, 2), "PERIOD"
    else:
        # Tier 3: Annualizzato
        return round(xirr_val * 100, 2), "ANNUAL"
