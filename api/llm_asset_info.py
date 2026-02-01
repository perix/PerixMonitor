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
        prompt_template = "Analizza questo asset finanziario: {isin}" # Default fallback
        reasoning_effort = 'medium' # Default for GPT-5 Mini
        global_model = 'gpt-5-mini' # Default Model
        web_search_enabled = False # Default Flag
        max_tokens = 1000 # Default
        
        try:
            from supabase_client import get_supabase_client
            supabase = get_supabase_client()
            
            # Fetch prompt config
            res_prompt = supabase.table('app_config').select('value').eq('key', 'llm_asset_prompt').single().execute()
            if res_prompt.data and res_prompt.data.get('value') and res_prompt.data['value'].get('prompt'):
                prompt_template = res_prompt.data['value']['prompt']
            
            # Fetch global AI config (model, reasoning_effort)
            res_ai = supabase.table('app_config').select('value').eq('key', 'openai_config').single().execute()
            if res_ai.data and res_ai.data.get('value'):
                ai_config = res_ai.data['value']
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

        # Create OpenAI client
        client = openai.OpenAI(api_key=api_key)
        
        # Prepare parameters
        api_params = {
            "model": model_to_use,
            "messages": [{"role": "user", "content": final_prompt}]
        }
        
        # [MODIFIED] Reasoning Effort Support
        # Logic: If reasoning_effort is set (and not None/none), we use it. 
        # API requires temperature to NOT be present if reasoning_effort is used (for some models like o1).
        # We assume 'gpt-5' or 'o1' class models use reasoning.
        is_reasoning_model = model_to_use.startswith('gpt-5') or model_to_use.startswith('o')
        
        if is_reasoning_model and reasoning_effort:
             api_params["reasoning_effort"] = reasoning_effort
             # Max Tokens handling for reasoning models often uses max_completion_tokens
             api_params["max_completion_tokens"] = int(max_tokens)
        else:
             # Standard models
             api_params["temperature"] = 0.3
             api_params["max_tokens"] = int(max_tokens)
        
        # DETAILED LOGGING - PRE-FLIGHT
        logger.info(f"LLM REQUEST [ISIN: {isin}]")
        logger.info(f"  > Model: {model_to_use}")
        logger.info(f"  > Params: Reasoning={reasoning_effort if is_reasoning_model else 'N/A'}, WebSearch={web_search_enabled}")
        logger.info(f"  > Prompt Length: {len(final_prompt)} chars")

        # Send Request
        try:
            if web_search_enabled:
                 logger.info("LLM ASSET INFO: Using Native Responses API for Web Search")
                 response = client.responses.create(
                    model=model_to_use,
                    tools=[{"type": "web_search_preview"}],
                    input=[{"role": "user", "content": final_prompt}]
                 )
                 
                 # Extract content from Responses API object
                 if hasattr(response, 'output_text'):
                    response_text = response.output_text
                 elif hasattr(response, 'message'):
                    response_text = response.message.content
                 else:
                    response_text = str(response)
                 
                 original_response = response_text
                 finish_reason = "stop (responses-api)" # Placeholder
                 usage = None 
            else:
                 # Standard Chat Completion
                 response = client.chat.completions.create(**api_params)
                
                 # DETAILED LOGGING - POST-FLIGHT
                 usage = response.usage
                 finish_reason = response.choices[0].finish_reason
                 
                 msg = response.choices[0].message
                 response_text = msg.content
                 
                 if response_text is None:
                     if msg.tool_calls:
                         tool_call = msg.tool_calls[0]
                         logger.warning(f"LLM tried to use tool: {tool_call.function.name} with args: {tool_call.function.arguments}")
                         response_text = json.dumps({
                            "assetType": "Unknown (Tool Call)",
                            "description": f"Model attempted to use tool: {tool_call.function.name}",
                            "identifiers": {"isin": isin}
                         }) 
                     else:
                         logger.warning("LLM returned NO content and NO tool calls.")
                         return None
                 
                 original_response = response_text
            
            logger.info(f"LLM RESPONSE [ISIN: {isin}]")
            logger.info(f"  > Finish Reason: {finish_reason}")
            if usage:
                 logger.info(f"  > Tokens: In={usage.prompt_tokens}, Out={usage.completion_tokens}, Total={usage.total_tokens}")
            
            # Try to parse as JSON (Handle markdown blocks)
            # Standard parsing logic continues below...
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
                logger.info(f"  > Parsed Valid JSON. AssetType: {parsed_type}, MatchISIN: {parsed_isin == isin}")
                
                return {
                    "response_type": "json",
                    "data": metadata
                }
            except json.JSONDecodeError:
                logger.warning(f"  > Failed to parse JSON. Returning raw text (Length: {len(original_response)})")
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
