-- Fix RLS policies for unit_conversions table to allow anonymous access
-- Drop existing policies
drop policy if exists "Enable read access for all authenticated users" on public.unit_conversions;
drop policy if exists "Enable insert for all authenticated users" on public.unit_conversions;
drop policy if exists "Enable update for all authenticated users" on public.unit_conversions;
drop policy if exists "Enable read access for all users" on public.unit_conversions;
drop policy if exists "Enable insert for all users" on public.unit_conversions;
drop policy if exists "Enable update for all users" on public.unit_conversions;
drop policy if exists "Enable delete for all users" on public.unit_conversions;
-- Create new policies for anonymous access
create policy "Enable read access for all users"
  on public.unit_conversions for select
  using (true);
create policy "Enable insert for all users"
  on public.unit_conversions for insert
  with check (true);
create policy "Enable update for all users"
  on public.unit_conversions for update
  using (true);
create policy "Enable delete for all users"
  on public.unit_conversions for delete
  using (true);
