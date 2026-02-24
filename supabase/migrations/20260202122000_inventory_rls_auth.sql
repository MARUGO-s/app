-- Tighten inventory RLS to Supabase Auth (user_id must match auth.uid())

-- inventory_items
drop policy if exists "Allow anonymous access to inventory_items" on public.inventory_items;
create policy inventory_items_select_own on public.inventory_items
  for select
  using (user_id = auth.uid()::text);
create policy inventory_items_insert_own on public.inventory_items
  for insert
  with check (user_id = auth.uid()::text);
create policy inventory_items_update_own on public.inventory_items
  for update
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
create policy inventory_items_delete_own on public.inventory_items
  for delete
  using (user_id = auth.uid()::text);
-- inventory_snapshots
drop policy if exists "Allow anonymous access to inventory_snapshots" on public.inventory_snapshots;
create policy inventory_snapshots_select_own on public.inventory_snapshots
  for select
  using (user_id = auth.uid()::text);
create policy inventory_snapshots_insert_own on public.inventory_snapshots
  for insert
  with check (user_id = auth.uid()::text);
create policy inventory_snapshots_delete_own on public.inventory_snapshots
  for delete
  using (user_id = auth.uid()::text);
-- ignored_items
drop policy if exists "Allow anonymous access to ignored_items" on public.ignored_items;
create policy ignored_items_select_own on public.ignored_items
  for select
  using (user_id = auth.uid()::text);
create policy ignored_items_insert_own on public.ignored_items
  for insert
  with check (user_id = auth.uid()::text);
create policy ignored_items_delete_own on public.ignored_items
  for delete
  using (user_id = auth.uid()::text);
-- deleted_inventory_snapshots (trash)
drop policy if exists "Allow anonymous access to deleted_inventory_snapshots" on public.deleted_inventory_snapshots;
create policy deleted_inventory_snapshots_select_own on public.deleted_inventory_snapshots
  for select
  using (user_id = auth.uid()::text);
create policy deleted_inventory_snapshots_insert_own on public.deleted_inventory_snapshots
  for insert
  with check (user_id = auth.uid()::text);
create policy deleted_inventory_snapshots_delete_own on public.deleted_inventory_snapshots
  for delete
  using (user_id = auth.uid()::text);
