import numpy as np
from datetime import datetime

def xirr(transactions, guess=0.1):
    """
    Calculate XIRR (Extended Internal Rate of Return) for a list of transactions.
    
    Args:
        transactions: list of dicts with 'date' (datetime) and 'amount' (float).
                      Inflows are negative, Outflows (current value) are positive.
                      
    Returns:
        float: XIRR value (annualized).
    """
    dates = [t['date'] for t in transactions]
    amounts = [t['amount'] for t in transactions]

    if not dates or not amounts:
        return 0.0

    amounts = np.array(amounts)
    # Check for sign change
    if np.all(amounts >= 0) or np.all(amounts <= 0):
        return 0.0

    min_date = min(dates)
    # Convert dates to years fraction from min_date
    years = np.array([(d - min_date).days / 365.0 for d in dates])
    
    # Newton-Raphson method
    rate = guess
    max_iter = 100
    tol = 1e-6
    
    for _ in range(max_iter):
        # Prevent division by zero or errors with (1+rate) <= 0
        if rate <= -1.0:
            rate = -0.99 + 1e-9 # Bounce back
            
        # NPV Function  = sum( C_i / (1+r)^t_i )
        # Using power rule: (1+rate)**years
        # Note: if rate is negative, we need to be careful with fractional powers, 
        # but here years are floats. standard XIRR usually assumes rate > -1
        try:
            factor = (1 + rate) ** years
            npv = np.sum(amounts / factor)
            
            # Derivative: sum( - t_i * C_i / (1+r)^(t_i+1) )
            # derivative of (1+r)^-t is -t * (1+r)^(-t-1)
            # So d/dr [C * (1+r)^-t] = C * -t * (1+r)^-(t+1) = -C * t / (1+rate)^(t+1)
            
            deriv = -np.sum(amounts * years / (factor * (1 + rate)))
            
            if abs(deriv) < 1e-9: # Avoid zero division
                break
                
            new_rate = rate - npv / deriv
            
            if abs(new_rate - rate) < tol:
                return new_rate
            
            rate = new_rate
        except Exception:
            return None
            
    return rate

    return rate

def deannualize_xirr(annual_xirr, days):
    """
    Convert annualized XIRR to a period return for the given number of days.
    Formula: (1 + r_annual)^(days/365) - 1
    """
    if days <= 0: return 0.0
    try:
        # Handle cases where annual_xirr is very generic or close to -1
        return ((1 + annual_xirr) ** (days / 365.0)) - 1
    except:
        return annual_xirr # Fallback

def get_tiered_mwr(cash_flows, current_value, t1=30, t2=365):
    """
    Calculate MWR based on tiered logic:
    - Days < T1: Simple Return (Total Gain / Total Invested)
    - T1 <= Days < T2: Period Return (De-annualized XIRR)
    - Days >= T2: Annualized XIRR
    
    Returns: (mwr_value_percent, mwr_type_string)
    """
    if not cash_flows:
        return 0.0, "NONE"
        
    # Sort flows by date
    sorted_flows = sorted(cash_flows, key=lambda x: x['date'])
    start_date = sorted_flows[0]['date']
    end_date = datetime.now()
    
    # Calculate duration
    duration_days = (end_date - start_date).days
    if duration_days < 0: duration_days = 0
    
    # Calculate Net Invested for Simple Return
    # Sum of negative amounts (investments)
    total_invested = sum(-f['amount'] for f in sorted_flows if f['amount'] < 0)
    
    # Add current value as final flow for XIRR
    calc_flows = sorted_flows + [{"date": end_date, "amount": current_value}]
    
    # --- Tier 1: Simple Return ---
    if duration_days < t1:
        if total_invested == 0: return 0.0, "SIMPLE"
        # Simple P&L % = (Current Value - Net Invested) / Net Invested
        # Note: This is an approximation. Net Invested is usually sum of inflows.
        # More accurately: Total Value - Total Invested (abs inflow).
        # Let's use the standard P&L logic: (Val - Cost) / Cost
        
        # We need a robust "Invested" metric. 
        # Net Cash Flow approach: Sum(All Flows except final).
        net_cash_input = sum(-f['amount'] for f in sorted_flows) # Positive means money put in
        
        if net_cash_input <= 0.0001: 
             # Edge case: No net investment or negative (withdrawal > deposit)
             return 0.0, "SIMPLE"
             
        simple_return = (current_value - net_cash_input) / net_cash_input
        return round(simple_return * 100, 2), "SIMPLE"

    # --- Tier 2 & 3: XIRR Base ---
    xirr_val = xirr(calc_flows)
    if xirr_val is None:
        return 0.0, "ERROR"
        
    if duration_days < t2:
        # Tier 2: Period Return
        period_val = deannualize_xirr(xirr_val, duration_days)
        return round(period_val * 100, 2), "PERIOD"
    else:
        # Tier 3: Annualized
        return round(xirr_val * 100, 2), "ANNUAL"
