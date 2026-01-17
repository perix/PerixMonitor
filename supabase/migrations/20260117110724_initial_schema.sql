-- Create profiles table
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create portfolios table
CREATE TABLE public.portfolios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create assets table (Master Data)
CREATE TABLE public.assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    isin TEXT UNIQUE NOT NULL,
    ticker TEXT,
    name TEXT NOT NULL,
    asset_class TEXT,
    country TEXT,
    sector TEXT,
    rating TEXT,
    issuer TEXT, 
    currency TEXT DEFAULT 'EUR',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets(id) ON DELETE RESTRICT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
    quantity NUMERIC NOT NULL,
    price_eur NUMERIC NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create snapshots table (for Upload History)
CREATE TABLE public.snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'PROCESSED',
    log_summary TEXT
);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can see their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Portfolios: Users can see/edit their own portfolios
CREATE POLICY "Users can view own portfolios" ON public.portfolios
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolios" ON public.portfolios
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolios" ON public.portfolios
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolios" ON public.portfolios
    FOR DELETE USING (auth.uid() = user_id);

-- Assets: Readable by everyone (authenticated), Insertable by authenticated users (during ingestion)
-- Ideally, assets are shared. But for now, let's allow read all.
CREATE POLICY "Authenticated users can view assets" ON public.assets
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert assets" ON public.assets
    FOR INSERT TO authenticated WITH CHECK (true);

-- Transactions: Linked to Portfolio -> User
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (
        exists (
            select 1 from public.portfolios
            where id = transactions.portfolio_id
            and user_id = auth.uid()
        )
    );
CREATE POLICY "Users can insert own transactions" ON public.transactions
    FOR INSERT WITH CHECK (
        exists (
            select 1 from public.portfolios
            where id = transactions.portfolio_id
            and user_id = auth.uid()
        )
    );
-- Add update/delete policies for transactions similarly...

-- Snapshots
CREATE POLICY "Users can view own snapshots" ON public.snapshots
    FOR SELECT USING (
        exists (
            select 1 from public.portfolios
            where id = snapshots.portfolio_id
            and user_id = auth.uid()
        )
    );

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
