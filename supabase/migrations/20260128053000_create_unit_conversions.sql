-- Create unit_conversions table
create table if not exists public.unit_conversions (
  id uuid not null default gen_random_uuid(),
  ingredient_name text not null,
  packet_size numeric not null,
  packet_unit text not null,
  last_price numeric,
  updated_at timestamp with time zone default now(),
  constraint unit_conversions_pkey primary key (id),
  constraint unit_conversions_ingredient_name_key unique (ingredient_name)
);
-- Enable RLS
alter table public.unit_conversions enable row level security;
-- Policies
drop policy if exists "Enable read access for all authenticated users" on public.unit_conversions;
drop policy if exists "Enable insert for all authenticated users" on public.unit_conversions;
drop policy if exists "Enable update for all authenticated users" on public.unit_conversions;
create policy "Enable read access for all authenticated users"
  on public.unit_conversions for select
  using (auth.role() = 'authenticated');
create policy "Enable insert for all authenticated users"
  on public.unit_conversions for insert
  with check (auth.role() = 'authenticated');
create policy "Enable update for all authenticated users"
  on public.unit_conversions for update
  using (auth.role() = 'authenticated');
