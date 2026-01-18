create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table app_config enable row level security;

create policy "Enable read access for all users"
on "public"."app_config"
as PERMISSIVE
for SELECT
to public
using (true);

create policy "Enable insert/update for all users"
on "public"."app_config"
as PERMISSIVE
for ALL
to public
using (true)
with check (true);
