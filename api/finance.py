import numpy as np
from scipy import optimize

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

    min_date = min(dates)
    # Convert dates to years fraction from min_date
    years = np.array([(d - min_date).days / 365.0 for d in dates])
    
    def npv(rate):
        return np.sum(amounts / (1 + rate)**years)
        
    try:
        # Newton-Raphson method to find rate where NPV is close to 0
        result = optimize.newton(npv, 0.1)
        return result
    except RuntimeError:
        return None  # Convergence failed
    except Exception:
        return None

def calculate_mwr(initial_value, final_value, cash_flows):
    """
    Calculate Money Weighted Return. 
    Equivalent to XIRR with Initial Value as neg inflow at start, 
    and Final Value as pos outflow at end.
    """
    # This is essentially XIRR
    pass
