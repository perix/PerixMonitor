create table if not exists asset_notes (
  id uuid default gen_random_uuid() primary key,
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  asset_id uuid references public.assets(id) on delete cascade not null,
  note text,
  updated_at timestamp with time zone default now(),
  unique(portfolio_id, asset_id)
);

alter table asset_notes enable row level security;

create policy "Users can view own asset notes" on asset_notes
  for select using (
    exists (
      select 1 from public.portfolios
      where id = asset_notes.portfolio_id
      and user_id = auth.uid()
    )
  );

create policy "Users can insert own asset notes" on asset_notes
  for insert with check (
    exists (
      select 1 from public.portfolios
      where id = asset_notes.portfolio_id
      and user_id = auth.uid()
    )
  );

create policy "Users can update own asset notes" on asset_notes
  for update using (
    exists (
      select 1 from public.portfolios
      where id = asset_notes.portfolio_id
      and user_id = auth.uid()
    )
  );
