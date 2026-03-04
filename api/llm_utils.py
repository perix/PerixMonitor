import os
import json
import openai
import traceback
from logger import logger
from db_helper import get_config

def get_model_capabilities(model_id):
    """
    Ritorna le capacità del modello basandosi sulla lista definita nel frontend.
    """
    capabilities = {
        'reasoning': False,
        'web_search': False,
        'temperature': True
    }
    
    # Logica basata sui modelli noti
    if 'o1' in model_id or 'o3' in model_id or 'gpt-5' in model_id:
        capabilities['reasoning'] = True
        capabilities['temperature'] = False
        
    if 'gpt-4.5' in model_id or 'gpt-5' in model_id or 'gpt-4-turbo' in model_id:
        capabilities['web_search'] = True
        
    return capabilities

def clean_text_for_pdf(text):
    """
    Sanifica il testo per renderlo compatibile con la generazione PDF (jsPDF).
    Converte caratteri speciali UTF-8 in varianti ASCII o Latin-1 sicure.
    """
    if not text:
        return ""
    
    # Mappa di sostituzioni per caratteri UTF-8 comuni problematici
    replacements = {
        'â€™': "'",
        'â€"': "—",
        'â€œ': '"',
        'â€\x9d': '"',
        'â€¦': "...",
        '\u2019': "'", # Right single quote
        '\u2018': "'", # Left single quote
        '\u201c': '"', # Left double quote
        '\u201d': '"', # Right double quote
        '\u2013': "-", # En dash
        '\u2014': "—", # Em dash
        '\u2026': "...", # Ellipsis
        '\u00a0': " ", # Non-breaking space
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
        
    # Rimuovi emoji o caratteri non-BMP che jsPDF non gestisce bene
    # Teniamo solo caratteri stampabili standard
    return "".join(c for c in text if ord(c) < 65536)

def call_llm(prompt, system_prompt=None, temperature_override=None, max_tokens_override=None):
    """
    Esegue una chiamata LLM centralizzata rispettando la configurazione salvata nel DB
    e le capacità specifiche del modello selezionato.
    """
    try:
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise Exception("OPENAI_API_KEY non configurata")
            
        # Carica configurazione dal DB
        cfg = get_config('openai_config')
        if not cfg:
            logger.warning("[LLM_UTILS] Configurazione openai_config non trovata, uso defaults")
            cfg = {}
            
        model = cfg.get('model', 'gpt-4o-mini')
        temp = temperature_override if temperature_override is not None else float(cfg.get('temperature', 0.7))
        max_tokens = max_tokens_override if max_tokens_override is not None else int(cfg.get('max_tokens', 1000))
        reasoning_effort = cfg.get('reasoning_effort', 'medium')
        web_search_enabled = cfg.get('web_search_enabled', False)
        
        capabilities = get_model_capabilities(model)
        
        # [TIMEOUT] Estensione timeout a 180s per Responses API
        client = openai.OpenAI(api_key=api_key, timeout=180.0)
        
        # LOG PRE-CHIAMATA
        logger.info(f"[LLM_UTILS] Richiesta LLM - Modello: {model}")
        logger.info(f"[LLM_UTILS] Parametri: max_tokens={max_tokens}, web_search={web_search_enabled}, reasoning={capabilities['reasoning']}")

        # 1. Caso Web Search Abilitata (e supportata dal modello)
        if web_search_enabled and capabilities['web_search']:
            logger.info(f"[LLM_UTILS] Tentativo Web Search con {model} via Responses API")
            
            # Semplificazione: fusioni system e user prompt in un unico input
            combined_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            
            try:
                # [FIX] Rimosso max_completion_tokens (non supportato da Responses.create)
                response = client.responses.create(
                    model=model,
                    tools=[{"type": "web_search_preview"}],
                    input=[{"role": "user", "content": combined_prompt}]
                )
                
                # Estrazione testo (Robusta)
                content = ""
                if hasattr(response, 'output_text') and response.output_text:
                    content = response.output_text
                elif hasattr(response, 'message') and hasattr(response.message, 'content'):
                    content = response.message.content
                else:
                    # Fallback introspezione
                    logger.warning(f"[LLM_UTILS] Struttura Responses inaspettata. Keys: {dir(response)}")
                    content = str(response)
                
                content = clean_text_for_pdf(content or "")
                logger.info(f"[LLM_UTILS] Successo Web Search ({len(content)} chars)")
                if len(content) > 0:
                    logger.info(f"[LLM_UTILS] Preview: {content[:150]}...")
                    return content
                else:
                    logger.warning("[LLM_UTILS] Responses API ha restituito testo vuoto. Procedo con fallback.")
                
            except Exception as e:
                logger.error(f"[LLM_UTILS] Errore Responses API: {e}. Provo Chat Completion standard...")
        
        # 2. Caso Chat Completion Standard (o Fallback)
        api_params = {
            "model": model,
            "messages": []
        }
        
        if system_prompt:
            role = "developer" if capabilities['reasoning'] else "system"
            api_params["messages"].append({"role": role, "content": system_prompt})
            
        api_params["messages"].append({"role": "user", "content": prompt})
        
        if capabilities['reasoning']:
            api_params["max_completion_tokens"] = max_tokens
            if reasoning_effort and reasoning_effort != 'none':
                api_params["reasoning_effort"] = reasoning_effort
        else:
            api_params["max_tokens"] = max_tokens
            api_params["temperature"] = temp
            
        response = client.chat.completions.create(**api_params)
        content = response.choices[0].message.content or ""
        
        content = clean_text_for_pdf(content)
        
        usage = response.usage
        logger.info(f"[LLM_UTILS] Risposta Chat Completion OK ({len(content)} chars). Tokens: T={usage.total_tokens if usage else 'N/A'}")
        logger.info(f"[LLM_UTILS] Contenuto Risposta (primi 200 char):\n{content[:200]}...")
        
        return content

    except Exception as e:
        logger.error(f"[LLM_UTILS] Errore critico richiamando LLM: {e}")
        logger.error(traceback.format_exc() if 'traceback' in globals() else "")
        raise e
