from datetime import datetime

# Questa funzione replica esattamente il blocco logico di api/report.py 
# in cui calcoliamo il Capital Gain e aggiorniamo il PMC (Prezzo Medio Ponderato) progressivo.
def calculate_capital_gains_pmc(transactions, start_date, end_date):
    holdings = {}
    capital_gains = []
    
    # Inizializziamo
    for t in transactions:
        isin = t['assets']['isin']
        if isin not in holdings:
            holdings[isin] = {'qty': 0.0, 'avg_cost': 0.0}

    # Trasformiamo la data str in obj
    for t in transactions:
        t_date = datetime.strptime(t['date'], '%Y-%m-%d')
        if t_date > end_date:
            continue

        isin = t['assets']['isin']
        qty = float(t['quantity'])
        price = float(t['price_eur'])
        val = qty * price
        is_buy = t['type'] == 'BUY'
        
        curr_h = holdings[isin]
        in_period = start_date <= t_date <= end_date

        if is_buy:
            # Calcolo PMC progressivo: costo_totale_precedente + nuovo_costo / quantita_totale
            if curr_h['qty'] >= -0.0001:
                total_cost = (curr_h['qty'] * curr_h['avg_cost']) + val
                new_qty = curr_h['qty'] + qty
                if new_qty > 0:
                    curr_h['avg_cost'] = total_cost / new_qty
            curr_h['qty'] += qty
        else:
            # Vendita. Il Plus/Minus valore si basa sul PMC progressivo fino a quel momento.
            pmc = curr_h['avg_cost']
            gain_per_unit = price - pmc
            total_gain = gain_per_unit * qty
            
            if in_period:
                capital_gains.append({
                    'isin': isin,
                    'sell_price': price,
                    'pmc': pmc,
                    'realized_gain': total_gain
                })
            curr_h['qty'] -= qty
            
    return capital_gains

def test_pmc_calculation():
    # Scenario di test:
    # 1. 01 Gen: Compro 100 quote a 10€ (PMC = 10€)
    # 2. 01 Feb: Compro 100 quote a 20€ (Nuovo Costo Totale = 1000+2000=3000, Qty=200, PMC = 3000/200 = 15€)
    # 3. 01 Mar: Vendo 50 quote a 25€ (Plusvalenza = (25€ - 15€ di PMC)*50 = 500€). Rimangono 150 quote a 15€ di PMC.
    # 4. 01 Apr: Vendo 100 quote a 10€ (Minusvalenza = (10€ - 15€ di PMC)*100 = -500€). Rimangono 50 quote a 15€.
    
    transactions = [
        {'date': '2025-01-01', 'type': 'BUY', 'assets': {'isin': 'IT001'}, 'quantity': 100, 'price_eur': 10},
        {'date': '2025-02-01', 'type': 'BUY', 'assets': {'isin': 'IT001'}, 'quantity': 100, 'price_eur': 20},
        {'date': '2025-03-01', 'type': 'SELL', 'assets': {'isin': 'IT001'}, 'quantity': 50, 'price_eur': 25},
        {'date': '2025-04-01', 'type': 'SELL', 'assets': {'isin': 'IT001'}, 'quantity': 100, 'price_eur': 10},
    ]
    
    start_date = datetime.strptime('2025-01-01', '%Y-%m-%d')
    end_date = datetime.strptime('2025-12-31', '%Y-%m-%d')
    
    cgs = calculate_capital_gains_pmc(transactions, start_date, end_date)
    
    assert len(cgs) == 2
    
    # Controllo prima vendita (Gain)
    assert cgs[0]['pmc'] == 15.0
    assert cgs[0]['sell_price'] == 25.0
    assert cgs[0]['realized_gain'] == 500.0
    
    
    print("✓ Test PMC ed estrazione plusvalenze completato con successo!")

if __name__ == '__main__':
    test_pmc_calculation()
