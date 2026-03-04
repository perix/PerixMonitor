import threading
import uuid
import time
from flask import Blueprint, jsonify, request
from logger import logger
import os
import openai
import traceback
import json
from llm_utils import call_llm

llm_report_bp = Blueprint('llm_report', __name__)

# Store globale per i Job LLM (in-memory)
# Struttura: { job_id: { "status": "pending|completed|failed", "result": "...", "error": "..." } }
llm_jobs = {}
llm_jobs_lock = threading.Lock()

def _run_llm_task(job_id, prompt, system_prompt):
    """Esegue la chiamata LLM in background."""
    try:
        logger.info(f"[LLM_JOB] Inizio Task {job_id}")
        analysis_text = call_llm(prompt, system_prompt=system_prompt)
        
        with llm_jobs_lock:
            if analysis_text:
                llm_jobs[job_id]["status"] = "completed"
                llm_jobs[job_id]["result"] = analysis_text
            else:
                llm_jobs[job_id]["status"] = "failed"
                llm_jobs[job_id]["error"] = "L'LLM non ha restituito alcun contenuto"
        logger.info(f"[LLM_JOB] Task {job_id} completato con successo.")
    except Exception as e:
        logger.error(f"[LLM_JOB] Errore nel Task {job_id}: {e}")
        with llm_jobs_lock:
            llm_jobs[job_id]["status"] = "failed"
            llm_jobs[job_id]["error"] = str(e)

@llm_report_bp.route('/api/report/llm-analysis/start', methods=['POST'])
def start_llm_analysis():
    """Avvia un job asincrono per l'analisi LLM."""
    try:
        data = request.json
        period_data = data.get('report_data')
        
        if not period_data:
            return jsonify(error="Dati del report mancanti"), 400
            
        start_date = period_data.get('start_date')
        end_date = period_data.get('end_date')
        mwr = period_data.get('summary', {}).get('mwr_percent', 0)
        start_val = period_data.get('summary', {}).get('start_value', 0)
        end_val = period_data.get('summary', {}).get('end_value', 0)
        all_perf = period_data.get('all_performances', [])
        
        # Selezione asset per prompt
        if len(all_perf) > 30:
            assets_to_show = all_perf[:15] + all_perf[-15:]
        else:
            assets_to_show = all_perf

        assets_list = []
        if assets_to_show:
            for a in assets_to_show:
                isin_code = a.get('isin')
                if not isin_code: continue
                weight = (a.get('value', 0) / end_val * 100) if end_val > 0 else 0
                assets_list.append(f"{isin_code} (Peso: {weight:.2f}%)")
            
        assets_str = ", ".join(assets_list) if assets_list else "Nessun dato asset disponibile"
        
        prompt = f"""
        Sei un analista finanziario esperto. Analizza criticamente le performance complessive di questo portafoglio d'investimento nel periodo dal {start_date} al {end_date}.
        
        DATI SINTETICI DEL PORTAFOGLIO:
        - Valore Iniziale: {start_val} EUR
        - Valore Finale: {end_val} EUR
        - Rendimento Netto Time-Weighted (MWR): {mwr}%
        
        ISIN DEGLI ASSET E LORO PESO NEL PORTAFOGLIO (somma pesi = 100%):
        {assets_str}
        
        Compito:
        Scrivi un'analisi e un commento descrittivo (massimo 400 parole), effettuando una ricerca sul WEB per trovare giudizi, rating ed eventi salienti relativi agli ISIN sopra indicati, tenendo conto del loro peso relativo nel portafoglio.
        L'obiettivo è fornire all'investitore una panoramica chiara su come si è comportato il portafoglio alla luce del contesto di mercato e della qualità degli asset detenuti.
        Scrivi l'analisi in italiano in formato testo semplice (evita elenchi puntati eccessivi, usa paragrafi fluidi).
        """
        
        system_prompt = "Sei un analista finanziario senior di alto livello, esperto in sintesi macroeconomiche."
        
        job_id = str(uuid.uuid4())
        with llm_jobs_lock:
            llm_jobs[job_id] = {"status": "pending", "result": None, "error": None}
        
        # Avvio thread
        thread = threading.Thread(target=_run_llm_task, args=(job_id, prompt, system_prompt))
        thread.start()
        
        return jsonify({"job_id": job_id}), 202

    except Exception as e:
        logger.error(f"[LLM_REPORT_START] Error: {e}")
        return jsonify(error=str(e)), 500

@llm_report_bp.route('/api/report/llm-analysis/status/<job_id>', methods=['GET'])
def get_llm_analysis_status(job_id):
    """Ritorna lo stato di un job LLM."""
    with llm_jobs_lock:
        job = llm_jobs.get(job_id)
        if not job:
            return jsonify(error="Job non trovato"), 404
        return jsonify(job), 200

# Mantengo la rotta originale ma la trasformo in un alias del flusso asincrono 
# se possibile, oppure la lascio per ora finché non aggiorno il frontend.
# Meglio rimuoverla o renderla un errore guidato per forzare il passaggio al nuovo sistema.
@llm_report_bp.route('/api/report/llm-analysis', methods=['POST'])
def generate_llm_analysis_legacy():
    return jsonify(error="Endpoint Deprecated. Usa /api/report/llm-analysis/start"), 410
