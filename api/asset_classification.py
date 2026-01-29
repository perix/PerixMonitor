
# Mappa di classificazione asset (Normalizzata in minuscolo)
# Mappiamo le tipologie di asset provenienti dal DB/Excel alle macro-componenti di portafoglio.
ASSET_COMPONENT_MAP = {
    "fondo obblig. governativo": "Obbligazionaria Governativa",
    "fondo obbligazionario": "Obbligazionaria Corporate",
    "etf obbligazionario": "Obbligazionaria Corporate",
    "eltif": "Obbligazionaria Corporate",
    "etc": "Commodity",
    "fondo azionario": "Azionaria",
    "etf azionario": "Azionaria",
    "azioni": "Azionaria",
    "certificato": "Azionaria",
    "multi-asset": "Azionaria",
    "altro": "Altro",
    "liquidità": "Liquidità",
    "cash": "Liquidità",
    "c/c": "Liquidità",
    # Aggiungiamo mappature dirette nel caso in cui il DB contenga già i nomi delle componenti
    "obbligazionaria governativa": "Obbligazionaria Governativa",
    "obbligazionaria corporate": "Obbligazionaria Corporate",
    "azionaria": "Azionaria",
    "commodity": "Commodity",
    "altro": "Altro",
    "liquidità": "Liquidità"
}

def get_component_from_asset_type(asset_type):
    """
    Restituisce la componente di portafoglio basata sulla tipologia di asset.
    Normalizza la stringa per rendere la ricerca case-insensitive.
    """
    if not asset_type:
        return "Altro"
    
    # Normalizzazione: minuscolo e rimozione spazi bianchi ai bordi
    normalized_type = str(asset_type).lower().strip()
    
    # Ricerca nella mappa
    component = ASSET_COMPONENT_MAP.get(normalized_type)
    
    if component:
        return component
        
    # Se non trovato, proviamo a vedere se contiene parole chiave
    if any(k in normalized_type for k in ["btp", "bot", "cct", "ctz", "gov", "stat"]):
        return "Obbligazionaria Governativa"
        
    if any(k in normalized_type for k in ["obblig", "bond", "corp"]):
        return "Obbligazionaria Corporate"
    
    if any(k in normalized_type for k in ["azion", "equity", "stock"]):
        return "Azionaria"
        
    if any(k in normalized_type for k in ["cash", "liquid", "c/c"]):
        return "Liquidità"

    if "commod" in normalized_type or "etc" in normalized_type:
        return "Commodity"

    return "Altro"
