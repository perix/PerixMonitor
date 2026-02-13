"""
Database Helper Module for Direct HTTP Access to Supabase.

This module provides functions that bypass supabase-py limitations
with opaque tokens (sb_...) used in local development.

Works for both:
- Local: Opaque tokens (sb_...)
- Production: JWT tokens (eyJ...)
"""

import os
import requests
import json
try:
    from api.logger import logger
except ImportError:
    from logger import logger

def get_supabase_credentials():
    """Returns (url, service_key) tuple."""
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return url, key

def get_config(key: str, default=None):
    """
    Retrieves a value from app_config table by key.
    Returns the 'value' field or default if not found.
    """
    url, service_key = get_supabase_credentials()
    if not url or not service_key:
        return default
    
    try:
        rest_url = f"{url}/rest/v1/app_config"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(
            f"{rest_url}?key=eq.{key}&select=value",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0 and data[0].get('value') is not None:
                return data[0]['value']
        
        return default
        
    except Exception as e:
        logger.error(f"DB_HELPER get_config error for key '{key}': {e}")
        return default

def set_config(key: str, value: dict) -> bool:
    """
    Upserts a value into app_config table.
    Returns True on success, False on failure.
    """
    url, service_key = get_supabase_credentials()
    if not url or not service_key:
        logger.error("DB_HELPER set_config: Missing credentials")
        return False
    
    try:
        rest_url = f"{url}/rest/v1/app_config"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation"
        }
        
        response = requests.post(
            rest_url,
            headers=headers,
            json={"key": key, "value": value},
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            return True
        else:
            logger.error(f"DB_HELPER set_config error: HTTP {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"DB_HELPER set_config error for key '{key}': {e}")
        return False

def query_table(table: str, select: str = "*", filters: dict = None) -> list:
    """
    Generic query function for any table.
    filters: dict of {column: value} for eq filters
    Returns list of results or empty list on error.
    """
    url, service_key = get_supabase_credentials()
    if not url or not service_key:
        return []
    
    try:
        rest_url = f"{url}/rest/v1/{table}"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        
        # Build query params
        params = f"?select={select}"
        if filters:
            for col, val in filters.items():
                params += f"&{col}=eq.{val}"
        
        response = requests.get(
            f"{rest_url}{params}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"DB_HELPER query_table error: HTTP {response.status_code}")
            return []
            
    except Exception as e:
        logger.error(f"DB_HELPER query_table error for '{table}': {e}")
        return []

def upsert_table(table: str, data: dict, on_conflict: str = None) -> bool:
    """
    Generic upsert function for any table.
    Returns True on success, False on failure.
    """
    url, service_key = get_supabase_credentials()
    if not url or not service_key:
        return False
    
    try:
        rest_url = f"{url}/rest/v1/{table}"
        if on_conflict:
            rest_url += f"?on_conflict={on_conflict}"
            
        prefer = "resolution=merge-duplicates,return=representation"
        
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": prefer
        }
        
        response = requests.post(
            rest_url,
            headers=headers,
            json=data,
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            return True
        else:
            logger.error(f"DB_HELPER upsert_table error: HTTP {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"DB_HELPER upsert_table error for '{table}': {e}")
        return False

def execute_request(endpoint: str, method: str = 'GET', params: dict = None, body: dict = None, headers: dict = None) -> requests.Response:
    """
    Executes a direct HTTP request to Supabase REST API.
    
    Args:
        endpoint: The REST endpoint (e.g. "table_name" or "rpc/func")
        method: HTTP method (GET, POST, PATCH, DELETE)
        params: Query parameters string or dict. If string, append directly.
        body: JSON body for POST/PATCH
        headers: Additional headers (merged with auth headers)
        
    Returns:
        requests.Response object or None on auth failure
    """
    url, service_key = get_supabase_credentials()
    if not url or not service_key:
        logger.error("DB_HELPER: Missing credentials for execute_request")
        return None

    try:
        full_url = f"{url}/rest/v1/{endpoint}"
        
        # Base headers
        req_headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }
        if headers:
            req_headers.update(headers)
            
        return requests.request(
            method=method,
            url=full_url,
            params=params,
            json=body,
            headers=req_headers,
            timeout=20
        )
    except Exception as e:
        logger.error(f"DB_HELPER execute_request error [{method} {endpoint}]: {e}")
        return None

def update_table(table: str, data: dict, filters: dict) -> bool:
    """
    Generic update function.
    filters: dict of {column: value} for eq filters (required to target rows)
    """
    if not filters:
         logger.error("DB_HELPER update_table: No filters provided (safety check)")
         return False
         
    try:
        # Build query params for filters
        params = {}
        for col, val in filters.items():
            params[f"{col}"] = f"eq.{val}"
            
        resp = execute_request(table, 'PATCH', params=params, body=data, headers={"Prefer": "return=representation"})
        
        if resp and resp.status_code in [200, 204]:
            return True
        elif resp:
            logger.error(f"DB_HELPER update_table fail: {resp.status_code} - {resp.text}")
        return False
    except Exception as e:
        logger.error(f"DB_HELPER update_table error: {e}")
        return False

    except Exception as e:
        logger.error(f"DB_HELPER delete_table error: {e}")
        return False

def delete_table(table: str, filters: dict) -> bool:
    """
    Generic delete function.
    filters: dict of {column: value} for filters. 
    Keys can include operators like 'id.gt' or just 'id' (implies eq).
    """
    if not filters:
         logger.error("DB_HELPER delete_table: No filters provided (safety check)")
         return False
    
    url, service_key = get_supabase_credentials()
    if not url or not service_key:
        logger.error(f"DB_HELPER delete_table: Missing credentials for {table}")
        print(f"DB_HELPER FAIL: Missing credentials for {table}") 
        return False
        
    try:
        params = {}
        for key, val in filters.items():
            # Support "id.gt": "val" -> id=gt.val
            if "." in key:
                 col, op = key.split('.', 1)
                 params[col] = f"{op}.{val}"
            else:
                 params[key] = f"eq.{val}"
        
        # Log attempt
        # logger.info(f"DB_HELPER: Deleting from {table} with params {params}")

        resp = execute_request(table, 'DELETE', params=params)
        
        if resp and resp.status_code in [200, 204]:
            return True
        elif resp is not None:
             err_msg = f"DB_HELPER delete_table fail: {resp.status_code} - {resp.text}"
             logger.error(err_msg)
             print(err_msg) # Force stdout
        else:
             logger.error("DB_HELPER delete_table: No response from execute_request")
        
        return False
    except Exception as e:
        logger.error(f"DB_HELPER delete_table error: {e}")
        import traceback
        traceback.print_exc()
        return False
