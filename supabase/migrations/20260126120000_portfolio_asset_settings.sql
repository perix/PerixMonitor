-- Create portfolio_asset_settings table
CREATE TABLE public.portfolio_asset_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(portfolio_id, asset_id),
    UNIQUE(portfolio_id, color) 
);

-- RLS Policies
ALTER TABLE public.portfolio_asset_settings ENABLE ROW LEVEL SECURITY;

-- Users can view settings if they own the portfolio
CREATE POLICY "Users can view own portfolio settings" ON public.portfolio_asset_settings
    FOR SELECT USING (
        exists (
            select 1 from public.portfolios
            where id = portfolio_asset_settings.portfolio_id
            and user_id = auth.uid()
        )
    );

-- Users can insert settings if they own the portfolio
CREATE POLICY "Users can insert own portfolio settings" ON public.portfolio_asset_settings
    FOR INSERT WITH CHECK (
        exists (
            select 1 from public.portfolios
            where id = portfolio_asset_settings.portfolio_id
            and user_id = auth.uid()
        )
    );
    
-- Users can update settings if they own the portfolio
CREATE POLICY "Users can update own portfolio settings" ON public.portfolio_asset_settings
    FOR UPDATE USING (
        exists (
            select 1 from public.portfolios
            where id = portfolio_asset_settings.portfolio_id
            and user_id = auth.uid()
        )
    );
