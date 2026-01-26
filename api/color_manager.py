import random
from logger import logger
from supabase_client import get_supabase_client

# Curated palette for high contrast and aesthetics (Dark Mode optimized)
PALETTE = [
    '#0ea5e9', # Sky Blue
    '#22c55e', # Green
    '#eab308', # Yellow
    '#f97316', # Orange
    '#a855f7', # Purple
    '#ec4899', # Pink
    '#6366f1', # Indigo
    '#14b8a6', # Teal
    '#ef4444', # Red
    '#8b5cf6', # Violet
    '#f59e0b', # Amber
    '#10b981', # Emerald
    '#3b82f6', # Blue
    '#d946ef', # Fuchsia
    '#f43f5e', # Rose
    '#84cc16', # Lime
]

def get_assigned_colors(portfolio_id):
    """Fetch all currently assigned colors for a portfolio."""
    supabase = get_supabase_client()
    try:
        res = supabase.table('portfolio_asset_settings').select('color').eq('portfolio_id', portfolio_id).execute()
        return {row['color'] for row in res.data}
    except Exception as e:
        logger.error(f"Failed to fetch assigned colors: {e}")
        return set()

def assign_colors(portfolio_id, asset_ids):
    """
    Assigns unique colors to the given asset_ids for the portfolio.
    Skips assets that already have a color assigned.
    """
    if not asset_ids:
        return

    supabase = get_supabase_client()
    
    try:
        # 1. Check which assets already have colors
        res_existing = supabase.table('portfolio_asset_settings')\
            .select('asset_id, color')\
            .eq('portfolio_id', portfolio_id)\
            .in_('asset_id', list(asset_ids))\
            .execute()
            
        existing_map = {row['asset_id']: row['color'] for row in res_existing.data}
        
        assets_needing_color = [aid for aid in asset_ids if aid not in existing_map]
        
        if not assets_needing_color:
            return # Nothing to do

        # 2. Get all currently used colors in this portfolio to avoid duplicates
        used_colors = get_assigned_colors(portfolio_id)
        
        new_settings = []
        
        for asset_id in assets_needing_color:
            # Find a color not in used_colors
            available_palette = [c for c in PALETTE if c not in used_colors]
            
            if available_palette:
                # Deterministic or random? Random is fine for distribution.
                # Let's pick the first available to keep palette order consistency if possible
                chosen_color = available_palette[0]
            else:
                # If we exhausted the palette, generate a random bright color
                # Fallback generator
                import secrets
                while True:
                    # Generate random hex color
                    rand_color = '#' + secrets.token_hex(3)
                    if rand_color not in used_colors:
                        chosen_color = rand_color
                        break
            
            used_colors.add(chosen_color)
            new_settings.append({
                "portfolio_id": portfolio_id,
                "asset_id": asset_id,
                "color": chosen_color
            })
            
        if new_settings:
            supabase.table('portfolio_asset_settings').insert(new_settings).execute()
            logger.info(f"Assigned colors for {len(new_settings)} assets in portfolio {portfolio_id}")

    except Exception as e:
        logger.error(f"Error determining colors: {e}")
        # Non-blocking, just log
