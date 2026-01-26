"""
LLM Asset Information Retrieval Module

This module handles fetching asset information from OpenAI LLM
during the ingestion phase when new assets are discovered.
"""

import os
import json
import openai
from logger import logger

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
        prompt_template = default_prompt
        reasoning_effort = None
        global_model = None
        
        try:
            from supabase_client import get_supabase_client
            supabase = get_supabase_client()
            
            # Fetch prompt config
            res_prompt = supabase.table('app_config').select('value').eq('key', 'llm_asset_prompt').single().execute()
            if res_prompt.data and res_prompt.data.get('value') and res_prompt.data['value'].get('prompt'):
                prompt_template = res_prompt.data['value']['prompt']
                # logger.info("LLM ASSET INFO: Using saved prompt from DB")
            
            # Fetch global AI config (model, reasoning_effort)
            res_ai = supabase.table('app_config').select('value').eq('key', 'openai_config').single().execute()
            if res_ai.data and res_ai.data.get('value'):
                ai_config = res_ai.data['value']
                global_model = ai_config.get('model')
                reasoning_effort = ai_config.get('reasoning_effort')
                if reasoning_effort == 'none': # Handle 'none' as None/Omit
                    reasoning_effort = None
                    
        except Exception as e:
            logger.warning(f"LLM ASSET INFO: Could not fetch config from DB: {e}")
        
        # Use provided model override, or global config model, or default
        model_to_use = model or global_model or 'gpt-4o-mini'
        
        # Build final prompt with placeholders
        final_prompt = prompt_template.replace('{isin}', isin).replace('{template}', template)
        
        # Replace {nome_asset} if present
        if '{nome_asset}' in final_prompt:
            name_to_use = asset_name or isin  # Fallback to ISIN if no name provided
            final_prompt = final_prompt.replace('{nome_asset}', name_to_use)

        logger.info(f"LLM ASSET INFO: Request for ISIN: {isin} | Model: {model_to_use} | Effort: {reasoning_effort}")
        
        # Create OpenAI client and make request
        client = openai.OpenAI(api_key=api_key)
        
        # Prepare parameters
        api_params = {
            "model": model_to_use,
            "messages": [{"role": "user", "content": final_prompt}],
            "max_tokens": 4000
        }
        
        # Add reasoning_effort only for supported models (gpt-5 series)
        if model_to_use.startswith('gpt-5') and reasoning_effort:
             # Note: OpenAI API parameter might be strictly validated. 'low', 'medium', 'high' are expected.
             api_params["reasoning_effort"] = reasoning_effort
             # Remove max_tokens? Usually reasoning models use max_completion_tokens, but let's keep max_tokens if supported or alias.
             # For O-series it's max_completion_tokens. For GPT-5 it depends. Assume standard params + reasoning_effort.
             # Note: Using standard chat endpoint.
        else:
             api_params["temperature"] = 0.3  # Temperature supported for non-reasoning models
        
        response = client.chat.completions.create(**api_params)
        
        # Extract the response content
        response_text = response.choices[0].message.content.strip()
        original_response = response_text  # Keep original for text fallback
        
        # Try to parse as JSON
        # Handle potential markdown code blocks
        if response_text.startswith('```'):
            # Remove markdown code blocks
            lines = response_text.split('\n')
            # Find start and end of JSON
            start_idx = 1 if lines[0].startswith('```') else 0
            end_idx = len(lines) - 1 if lines[-1].strip() == '```' else len(lines)
            response_text = '\n'.join(lines[start_idx:end_idx])
        
        # Try to parse JSON
        try:
            metadata = json.loads(response_text)
            
            # Log the response with key fields
            isin_from_response = metadata.get('identifiers', {}).get('isin', 'N/A')
            asset_type = metadata.get('assetType', 'N/A')
            profile_name = metadata.get('profile', {}).get('name', 'N/A')
            
            logger.info(f"LLM ASSET INFO: JSON Response - ISIN: {isin_from_response}, Type: {asset_type}, Name: {profile_name}")
            
            # Return as dict with type indicator
            return {
                "response_type": "json",
                "data": metadata
            }
        except json.JSONDecodeError:
            # JSON parsing failed - treat as text/markdown response
            logger.info(f"LLM ASSET INFO: Text/Markdown response for {isin} (not valid JSON)")
            
            return {
                "response_type": "text",
                "data": original_response
            }
        
    except openai.AuthenticationError:
        logger.error("LLM ASSET INFO: OpenAI authentication failed - invalid API key")
        return None
    except openai.RateLimitError:
        logger.error(f"LLM ASSET INFO: Rate limit exceeded for {isin}")
        return None
    except Exception as e:
        logger.error(f"LLM ASSET INFO: Error fetching info for {isin}: {e}")
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
