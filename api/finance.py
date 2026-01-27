import numpy as np

def xirr(transactions):
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
    rate = 0.1
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

def calculate_mwr(initial_value, final_value, cash_flows):
    """
    Calculate Money Weighted Return. 
    Equivalent to XIRR with Initial Value as neg inflow at start, 
    and Final Value as pos outflow at end.
    """
    # This is essentially XIRR
    pass
