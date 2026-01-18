-- Create dividends table with unique constraint for upsert
create table if not exists dividends (
    id uuid primary key default gen_random_uuid(),
    portfolio_id uuid references portfolios(id) on delete cascade not null,
    asset_id uuid references assets(id) on delete cascade not null, -- Removed not null check for safety? No, must belong to asset.
    amount_eur numeric not null,
    date date not null,
    created_at timestamptz default now(),
    
    unique (portfolio_id, asset_id, date)
);

-- Create table specifically for historical MWRR and Net Worth metrics per asset
-- This allows granular plotting of "How did this asset perform over time in this portfolio?"
create table if not exists asset_metrics_history (
    id uuid primary key default gen_random_uuid(),
    portfolio_id uuid references portfolios(id) on delete cascade not null,
    asset_id uuid references assets(id) on delete cascade not null,
    date date not null,
    
    total_value_eur numeric default 0,
    invested_capital_eur numeric default 0,
    mwrr_percent numeric default 0, -- Money Weighted Rate of Return (XIRR) at this point in time
    
    created_at timestamptz default now(),
    
    unique (portfolio_id, asset_id, date)
);
