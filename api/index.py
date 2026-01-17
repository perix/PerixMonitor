from flask import Flask, jsonify, request
# Load env vars before other imports
from dotenv import load_dotenv
import os
load_dotenv('.env.local')

import pandas as pd
import numpy as np
from ingest import parse_portfolio_excel, calculate_delta
from isin_resolver import resolve_isin
from finance import xirr
from logger import logger
import io
import traceback

app = Flask(__name__)
logger.info("Backend API Initialized")

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled Exception: {str(e)}")
    logger.error(traceback.format_exc())
    return jsonify(error=str(e)), 500

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify(message="Hello from Python!")

@app.route('/api/reset', methods=['POST'])
def reset_db_route():
    logger.warning("RESET DB REQUEST RECEIVED")
    # For now, since we don't have persistent DB connected in this script yet (it relies on Supabase client which we need to set up), 
    # we just acknowledge. In a real scenario, this would delete rows.
    # TODO: Connect Supabase verify
    logger.info("DB Reset acknowledged (simulation)")
    return jsonify(status="ok", message="DB Reset Simulated"), 200

@app.route('/api/ingest', methods=['POST'])
def ingest_excel():
    if 'file' not in request.files:
        logger.error("INGEST FAIL: No file part in request")
        return jsonify(error="No file part"), 400
    
    file = request.files['file']
    if file.filename == '':
        logger.error("INGEST FAIL: No selected file")
        return jsonify(error="No selected file"), 400

    parse_result = parse_portfolio_excel(file.stream)
    
    if "error" in parse_result:
        logger.error(f"INGEST FAIL: Parse Error - {parse_result['error']}")
        return jsonify(error=parse_result["error"]), 400
    
    db_holdings = request.form.get('db_holdings', {}) 
    if isinstance(db_holdings, str):
        import json
        try:
             db_holdings = json.loads(db_holdings)
        except Exception as e:
             logger.warning(f"INGEST WARNING: Failed to parse db_holdings json: {e}")
             db_holdings = {}

    try:
        delta = calculate_delta(parse_result['data'], db_holdings)
    except Exception as e:
        logger.error(f"INGEST FAIL: Delta Calculation Error - {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify(error=f"Calculation Error: {str(e)}"), 500
    
    return jsonify(
        parsed_data=parse_result['data'],
        delta=delta
    )

@app.route('/api/resolve_isin', methods=['GET'])
def resolve_isin_route():
    isin = request.args.get('isin')
    if not isin:
        return jsonify(error="Missing ISIN"), 400
    
    result = resolve_isin(isin)
    if result:
        return jsonify(result)
    else:
        return jsonify(error="Not found"), 404

@app.route('/api/calculate_xirr', methods=['POST'])
def calculate_xirr_route():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        from datetime import datetime
        for t in transactions:
            if isinstance(t['date'], str):
                t['date'] = datetime.fromisoformat(t['date'].replace('Z', ''))

        result = xirr(transactions)
        return jsonify(xirr=result)
    except Exception as e:
        return jsonify(error=str(e)), 500

if __name__ == '__main__':
    app.run(port=5328, debug=True)
