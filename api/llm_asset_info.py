"""
LLM Asset Information Retrieval Module

This module handles fetching asset information from OpenAI LLM
during the ingestion phase when new assets are discovered.
"""

import os
import json
import openai
from logger import logger
from llm_utils import call_llm

# Path to the DescrAsset.json template
DESCR_ASSET_TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__), 
    '..', 
    '0. Requirements', 
    'DescrAsset.json'
)

def load_descr_asset_template() -> str:
    """Load the DescrAsset.json template file."""
    try:
        with open(DESCR_ASSET_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logger.error(f"LLM ASSET INFO: Failed to load DescrAsset.json template: {e}")
        return None


def fetch_asset_info_from_llm(isin: str, model: str = None, asset_name: str = None) -> dict:
    """
    Fetch asset information from LLM for a given ISIN.
    
    Args:
        isin: The ISIN code of the asset
        model: Optional model override. If None, uses gpt-4o-mini as default.
        asset_name: Optional asset name for {nome_asset} placeholder
        
    Returns:
        dict: Parsed JSON with asset metadata, or None if failed
    """
    try:
        # Load template
        template = load_descr_asset_template()
        if not template:
            return None
        
        # Get API key from environment
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            logger.error("LLM ASSET INFO: No OPENAI_API_KEY configured")
            return None
        
        # Try to fetch global config (model, prompt, reasoning_effort) from DB
        prompt_template = "Analizza questo asset finanziario: {isin}" # Default fallback
        reasoning_effort = 'medium' # Default for GPT-5 Mini
        global_model = 'gpt-5-mini' # Default Model
        web_search_enabled = False # Default Flag
        max_tokens = 1000 # Default
        
        try:
            from db_helper import get_config
            
            # Fetch prompt config
            prompt_config = get_config('llm_asset_prompt')
            if prompt_config and prompt_config.get('prompt'):
                prompt_template = prompt_config['prompt']
            
            # Fetch global AI config (model, reasoning_effort)
            ai_config = get_config('openai_config')

            if ai_config:
                global_model = ai_config.get('model') or global_model
                reasoning_effort = ai_config.get('reasoning_effort') or reasoning_effort
                web_search_enabled = ai_config.get('web_search_enabled', False)
                max_tokens = ai_config.get('max_tokens', 1000)
                
                if reasoning_effort == 'none': 
                    reasoning_effort = None
                    
        except Exception as e:
            logger.warning(f"LLM ASSET INFO: Could not fetch config from DB: {e}")
        
        # Use provided model override, or global config model
        model_to_use = model or global_model
        
        # Build final prompt with placeholders
        final_prompt = prompt_template.replace('{isin}', isin).replace('{template}', template)
        
        # Replace {nome_asset} if present
        if '{nome_asset}' in final_prompt:
            name_to_use = asset_name or isin  # Fallback to ISIN if no name provided
            final_prompt = final_prompt.replace('{nome_asset}', name_to_use)

        # Chiamata centralizzata
        response_text = call_llm(final_prompt, temperature_override=0.1)
        
        if not response_text:
            return None
            
        original_response = response_text
        
        # Try to parse as JSON (Handle markdown blocks)
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            start_idx = 1 if lines[0].startswith('```') else 0
            end_idx = len(lines) - 1 if lines[-1].strip() == '```' else len(lines)
            response_text = '\n'.join(lines[start_idx:end_idx])
        
        # Parsing
        try:
            metadata = json.loads(response_text)
            
            # Log success details
            parsed_isin = metadata.get('identifiers', {}).get('isin', 'N/A')
            parsed_type = metadata.get('assetType', 'N/A')
            logger.info(f"LLM RESPONSE [ISIN: {isin}] - Parsed Valid JSON. AssetType: {parsed_type}, MatchISIN: {parsed_isin == isin}")
            
            return {
                "response_type": "json",
                "data": metadata
            }
        except json.JSONDecodeError:
            logger.warning(f"LLM RESPONSE [ISIN: {isin}] - Failed to parse JSON. Returning raw text.")
            return {
                "response_type": "text",
                "data": original_response
            }
                
        except openai.APIStatusError as e:
            logger.error(f"LLM API ERROR [ISIN: {isin}] - Status: {e.status_code}")
            logger.error(f"  > Message: {e.message}")
            return None

    except openai.AuthenticationError:
        logger.error("LLM ASSET INFO: OpenAI authentication failed - invalid API key")
        return None
    except openai.RateLimitError:
        logger.error(f"LLM ASSET INFO: Rate limit exceeded for {isin}")
        return None
    except Exception as e:
        logger.error(f"LLM ASSET INFO: General Error fetching info for {isin}: {e}")
        return None


def fetch_asset_info_batch(isins: list, model: str = None) -> dict:
    """
    Fetch asset information for multiple ISINs.
    
    Args:
        isins: List of ISIN codes
        model: Optional model override
        
    Returns:
        dict: Mapping of ISIN -> metadata dict
    """
    results = {}
    for isin in isins:
        metadata = fetch_asset_info_from_llm(isin, model)
        if metadata:
            results[isin] = metadata
    return results
