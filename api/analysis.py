from flask import jsonify, request
from datetime import datetime
from finance import get_tiered_mwr
from logger import logger
import traceback


def register_analysis_routes(app):

    @app.route('/api/analysis/allocation', methods=['GET'])
    def get_analysis_allocation():
        """Allocazione per classe di asset (componente) con P&L e MWR.

        Base di calcolo: SOLO posizioni attualmente detenute (qty>0), coerente con
        la lista asset, il pannello dettaglio e /api/portfolio/<id>/aggregate.
        Riusa la funzione condivisa `compute_active_holdings` (single source of truth)
        per evitare divergenze: i flussi delle posizioni CHIUSE non vengono inclusi."""
        t_start = datetime.now()
        logger.info(f"[ANALYSIS_ALLOCATION] Started at {t_start}")
        try:
            portfolio_id = request.args.get('portfolio_id')
            if not portfolio_id:
                return jsonify(error="Missing portfolio_id"), 400

            # Import lazy per evitare import circolari (portfolio.py <-> analysis.py)
            from portfolio import compute_active_holdings

            holdings, settings = compute_active_holdings(portfolio_id)

            mwr_t1 = int(request.args.get('mwr_t1') or settings.get('mwr_t1', 30) or 30)
            mwr_t2 = int(request.args.get('mwr_t2') or settings.get('mwr_t2', 365) or 365)

            # Raggruppa le holding ATTIVE per componente
            comps = {}
            total_portfolio_value = 0.0
            for isin, h in holdings.items():
                comp = h.get('component') or "Altro"
                c = comps.setdefault(comp, {
                    "current_value": 0.0, "invested": 0.0, "total_dividends": 0.0,
                    "cashflows": [], "end_date": None, "assets": []
                })
                c["current_value"] += h['current_value']
                c["invested"] += h['net_invested']
                c["total_dividends"] += h['total_dividends']
                c["cashflows"].extend(h['cashflows'])
                c["end_date"] = h['end_date'] if c["end_date"] is None else max(c["end_date"], h['end_date'])
                c["assets"].append({
                    "name": h['name'], "isin": isin, "value": h['current_value'],
                    "last_trend_variation": h.get('last_trend_variation'),
                })
                total_portfolio_value += h['current_value']

            # Liquidità manuale (pseudo-asset) dalle settings del portafoglio
            try:
                manual_liquidity = float(settings.get('liquidity', 0) or 0)
            except Exception:
                manual_liquidity = 0.0
            if manual_liquidity > 0:
                c = comps.setdefault("Liquidità", {
                    "current_value": 0.0, "invested": 0.0, "total_dividends": 0.0,
                    "cashflows": [], "end_date": None, "assets": []
                })
                c["current_value"] += manual_liquidity
                c["invested"] += manual_liquidity
                c["assets"].append({
                    "name": "Liquidità Manuale", "isin": "MANUAL_CASH",
                    "value": manual_liquidity, "last_trend_variation": None,
                })
                total_portfolio_value += manual_liquidity

            # Finalizza metriche per componente
            result_list = []
            for comp_name, data in comps.items():
                curr_val = data["current_value"]
                invested = data["invested"]
                if curr_val <= 0 and invested <= 0:
                    continue

                total_divs = data["total_dividends"]
                cfs = data["cashflows"]
                if cfs:
                    mwr_val, mwr_type = get_tiered_mwr(cfs, curr_val, t1=mwr_t1, t2=mwr_t2, end_date=data["end_date"])
                else:
                    mwr_val, mwr_type = 0.0, "NONE"

                pl_val = (curr_val - invested) + total_divs
                pl_pct = (pl_val / invested * 100) if invested > 0 else 0
                alloc_pct = (curr_val / total_portfolio_value * 100) if total_portfolio_value > 0 else 0

                final_assets = []
                for a in data["assets"]:
                    asset_pct = (a['value'] / curr_val * 100) if curr_val > 0 else 0
                    final_assets.append({
                        "name": a['name'], "isin": a['isin'],
                        "value": round(a['value'], 2),
                        "percent_of_component": round(asset_pct, 2),
                        "last_trend_variation": a.get('last_trend_variation'),
                    })
                final_assets.sort(key=lambda x: x['value'], reverse=True)

                result_list.append({
                    "name": comp_name,
                    "value": round(curr_val, 2),
                    "percentage": round(alloc_pct, 2),
                    "invested": round(invested, 2),
                    "pl_value": round(pl_val, 2),
                    "pl_percent": round(pl_pct, 2),
                    "mwr": mwr_val,
                    "mwr_type": mwr_type,
                    "assets": final_assets,
                })

            result_list.sort(key=lambda x: x['value'], reverse=True)

            return jsonify({
                "total_portfolio_value": round(total_portfolio_value, 2),
                "components": result_list,
            })

        except Exception as e:
            logger.error(f"ANALYSIS ERROR: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify(error=str(e)), 500
