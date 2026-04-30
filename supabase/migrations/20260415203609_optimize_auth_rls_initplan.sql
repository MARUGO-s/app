-- Optimize RLS policy expressions to avoid per-row auth initializer calls.
-- Keeps authorization semantics while using initplan-friendly patterns:
--   auth.uid() -> (select auth.uid())
--   auth.role() -> (select auth.role())

begin;
-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_select_own_safeguard" on public.profiles;
drop policy if exists "profiles_update_own_safeguard" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert
  with check ((select auth.uid()) = id);
create policy "profiles_select_own_safeguard" on public.profiles
  for select
  using ((select auth.uid()) = id);
create policy "profiles_update_own_safeguard" on public.profiles
  for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- ---------------------------------------------------------------------------
-- inventory scope tables
-- ---------------------------------------------------------------------------
drop policy if exists inventory_items_select_own on public.inventory_items;
drop policy if exists inventory_items_insert_own on public.inventory_items;
drop policy if exists inventory_items_update_own on public.inventory_items;
drop policy if exists inventory_items_delete_own on public.inventory_items;
create policy inventory_items_select_own on public.inventory_items
  for select
  using (user_id = (select auth.uid())::text);
create policy inventory_items_insert_own on public.inventory_items
  for insert
  with check (user_id = (select auth.uid())::text);
create policy inventory_items_update_own on public.inventory_items
  for update
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy inventory_items_delete_own on public.inventory_items
  for delete
  using (user_id = (select auth.uid())::text);
drop policy if exists inventory_snapshots_select_own on public.inventory_snapshots;
drop policy if exists inventory_snapshots_insert_own on public.inventory_snapshots;
drop policy if exists inventory_snapshots_delete_own on public.inventory_snapshots;
create policy inventory_snapshots_select_own on public.inventory_snapshots
  for select
  using (user_id = (select auth.uid())::text);
create policy inventory_snapshots_insert_own on public.inventory_snapshots
  for insert
  with check (user_id = (select auth.uid())::text);
create policy inventory_snapshots_delete_own on public.inventory_snapshots
  for delete
  using (user_id = (select auth.uid())::text);
drop policy if exists ignored_items_select_own on public.ignored_items;
drop policy if exists ignored_items_insert_own on public.ignored_items;
drop policy if exists ignored_items_delete_own on public.ignored_items;
create policy ignored_items_select_own on public.ignored_items
  for select
  using (user_id = (select auth.uid())::text);
create policy ignored_items_insert_own on public.ignored_items
  for insert
  with check (user_id = (select auth.uid())::text);
create policy ignored_items_delete_own on public.ignored_items
  for delete
  using (user_id = (select auth.uid())::text);
drop policy if exists deleted_inventory_snapshots_select_own on public.deleted_inventory_snapshots;
drop policy if exists deleted_inventory_snapshots_insert_own on public.deleted_inventory_snapshots;
drop policy if exists deleted_inventory_snapshots_delete_own on public.deleted_inventory_snapshots;
create policy deleted_inventory_snapshots_select_own on public.deleted_inventory_snapshots
  for select
  using (user_id = (select auth.uid())::text);
create policy deleted_inventory_snapshots_insert_own on public.deleted_inventory_snapshots
  for insert
  with check (user_id = (select auth.uid())::text);
create policy deleted_inventory_snapshots_delete_own on public.deleted_inventory_snapshots
  for delete
  using (user_id = (select auth.uid())::text);
-- ---------------------------------------------------------------------------
-- unit_conversions / csv_unit_overrides / ingredient_vendor_orders
-- ---------------------------------------------------------------------------
drop policy if exists "unit_conversions_select_own" on public.unit_conversions;
drop policy if exists "unit_conversions_insert_own" on public.unit_conversions;
drop policy if exists "unit_conversions_update_own" on public.unit_conversions;
drop policy if exists "unit_conversions_delete_own" on public.unit_conversions;
create policy "unit_conversions_select_own" on public.unit_conversions
  for select
  using (user_id = (select auth.uid())::text);
create policy "unit_conversions_insert_own" on public.unit_conversions
  for insert
  with check (user_id = (select auth.uid())::text);
create policy "unit_conversions_update_own" on public.unit_conversions
  for update
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy "unit_conversions_delete_own" on public.unit_conversions
  for delete
  using (user_id = (select auth.uid())::text);
drop policy if exists csv_unit_overrides_select_own_or_admin on public.csv_unit_overrides;
drop policy if exists csv_unit_overrides_insert_own_or_admin on public.csv_unit_overrides;
drop policy if exists csv_unit_overrides_update_own_or_admin on public.csv_unit_overrides;
drop policy if exists csv_unit_overrides_delete_own_or_admin on public.csv_unit_overrides;
create policy csv_unit_overrides_select_own_or_admin
  on public.csv_unit_overrides
  for select
  using (user_id = (select auth.uid())::text or (select public.is_admin()));
create policy csv_unit_overrides_insert_own_or_admin
  on public.csv_unit_overrides
  for insert
  with check (user_id = (select auth.uid())::text or (select public.is_admin()));
create policy csv_unit_overrides_update_own_or_admin
  on public.csv_unit_overrides
  for update
  using (user_id = (select auth.uid())::text or (select public.is_admin()))
  with check (user_id = (select auth.uid())::text or (select public.is_admin()));
create policy csv_unit_overrides_delete_own_or_admin
  on public.csv_unit_overrides
  for delete
  using (user_id = (select auth.uid())::text or (select public.is_admin()));
drop policy if exists ingredient_vendor_orders_select_own_or_admin on public.ingredient_vendor_orders;
drop policy if exists ingredient_vendor_orders_insert_own_or_admin on public.ingredient_vendor_orders;
drop policy if exists ingredient_vendor_orders_update_own_or_admin on public.ingredient_vendor_orders;
drop policy if exists ingredient_vendor_orders_delete_own_or_admin on public.ingredient_vendor_orders;
create policy ingredient_vendor_orders_select_own_or_admin
  on public.ingredient_vendor_orders
  for select
  using (user_id = (select auth.uid())::text or (select public.is_admin()));
create policy ingredient_vendor_orders_insert_own_or_admin
  on public.ingredient_vendor_orders
  for insert
  with check (user_id = (select auth.uid())::text or (select public.is_admin()));
create policy ingredient_vendor_orders_update_own_or_admin
  on public.ingredient_vendor_orders
  for update
  using (user_id = (select auth.uid())::text or (select public.is_admin()))
  with check (user_id = (select auth.uid())::text or (select public.is_admin()));
create policy ingredient_vendor_orders_delete_own_or_admin
  on public.ingredient_vendor_orders
  for delete
  using (user_id = (select auth.uid())::text or (select public.is_admin()));
-- ---------------------------------------------------------------------------
-- meal_plans
-- ---------------------------------------------------------------------------
drop policy if exists meal_plans_select_own on public.meal_plans;
drop policy if exists meal_plans_insert_own on public.meal_plans;
drop policy if exists meal_plans_update_own on public.meal_plans;
drop policy if exists meal_plans_delete_own on public.meal_plans;
create policy meal_plans_select_own
  on public.meal_plans
  for select
  to authenticated
  using (user_id = (select auth.uid())::text);
create policy meal_plans_insert_own
  on public.meal_plans
  for insert
  to authenticated
  with check (user_id = (select auth.uid())::text);
create policy meal_plans_update_own
  on public.meal_plans
  for update
  to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy meal_plans_delete_own
  on public.meal_plans
  for delete
  to authenticated
  using (user_id = (select auth.uid())::text);
-- ---------------------------------------------------------------------------
-- trash tables
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read own trash price csvs" on public.trash_price_csvs;
drop policy if exists "Users can insert own trash price csvs" on public.trash_price_csvs;
drop policy if exists "Users can delete own trash price csvs" on public.trash_price_csvs;
create policy "Users can read own trash price csvs"
  on public.trash_price_csvs
  for select
  using ((select auth.uid()) = user_id);
create policy "Users can insert own trash price csvs"
  on public.trash_price_csvs
  for insert
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own trash price csvs"
  on public.trash_price_csvs
  for delete
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can read own trash ingredients" on public.trash_ingredient_master;
drop policy if exists "Users can insert own trash ingredients" on public.trash_ingredient_master;
drop policy if exists "Users can delete own trash ingredients" on public.trash_ingredient_master;
create policy "Users can read own trash ingredients"
  on public.trash_ingredient_master
  for select
  using ((select auth.uid()) = user_id);
create policy "Users can insert own trash ingredients"
  on public.trash_ingredient_master
  for insert
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own trash ingredients"
  on public.trash_ingredient_master
  for delete
  using ((select auth.uid()) = user_id);
-- ---------------------------------------------------------------------------
-- account_backups
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read own backups" on public.account_backups;
drop policy if exists "Admins can read all backups" on public.account_backups;
drop policy if exists "Service role can upsert backups" on public.account_backups;
drop policy if exists "Admins can upsert backups" on public.account_backups;
create policy "Users can read own backups"
  on public.account_backups
  for select
  using ((select auth.uid()) = user_id);
create policy "Admins can read all backups"
  on public.account_backups
  for select
  using (
    exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );
create policy "Service role can upsert backups"
  on public.account_backups
  for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
create policy "Admins can upsert backups"
  on public.account_backups
  for all
  using (
    exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );
-- ---------------------------------------------------------------------------
-- logs / requests / presence
-- ---------------------------------------------------------------------------
drop policy if exists "管理者のみ閲覧可能" on public.api_usage_logs;
create policy "管理者のみ閲覧可能"
  on public.api_usage_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );
drop policy if exists "管理者のみ全操作可能" on public.deploy_logs;
create policy "管理者のみ全操作可能"
  on public.deploy_logs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );
drop policy if exists "Admins can view all login logs" on public.user_login_logs;
create policy "Admins can view all login logs"
  on public.user_login_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );
drop policy if exists "Operation QA logs: insert own" on public.operation_qa_logs;
drop policy if exists "Operation QA logs: admin can read all" on public.operation_qa_logs;
drop policy if exists "Operation QA logs: admin can delete all" on public.operation_qa_logs;
create policy "Operation QA logs: insert own"
  on public.operation_qa_logs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Operation QA logs: admin can read all"
  on public.operation_qa_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
create policy "Operation QA logs: admin can delete all"
  on public.operation_qa_logs
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
drop policy if exists "User requests: insert own" on public.user_requests;
drop policy if exists "User requests: select own" on public.user_requests;
drop policy if exists "User requests: admin can read all" on public.user_requests;
drop policy if exists "User requests: admin can update all" on public.user_requests;
drop policy if exists "User requests: admin can delete all" on public.user_requests;
create policy "User requests: insert own"
  on public.user_requests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "User requests: select own"
  on public.user_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "User requests: admin can read all"
  on public.user_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
create policy "User requests: admin can update all"
  on public.user_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
create policy "User requests: admin can delete all"
  on public.user_requests
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
drop policy if exists "User request view states: select own" on public.user_request_view_states;
drop policy if exists "User request view states: insert own" on public.user_request_view_states;
drop policy if exists "User request view states: update own" on public.user_request_view_states;
create policy "User request view states: select own"
  on public.user_request_view_states
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "User request view states: insert own"
  on public.user_request_view_states
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "User request view states: update own"
  on public.user_request_view_states
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "User presence: insert own" on public.user_presence;
drop policy if exists "User presence: update own" on public.user_presence;
drop policy if exists "User presence: read own" on public.user_presence;
drop policy if exists "User presence: admin read all" on public.user_presence;
create policy "User presence: insert own"
  on public.user_presence
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "User presence: update own"
  on public.user_presence
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "User presence: read own"
  on public.user_presence
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "User presence: admin read all"
  on public.user_presence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
-- ---------------------------------------------------------------------------
-- recently hardened tables (replace direct auth.uid() calls)
-- ---------------------------------------------------------------------------
drop policy if exists deleted_recipes_select_authenticated on public.deleted_recipes;
drop policy if exists deleted_recipes_insert_authenticated on public.deleted_recipes;
drop policy if exists deleted_recipes_update_authenticated on public.deleted_recipes;
drop policy if exists deleted_recipes_delete_authenticated on public.deleted_recipes;
create policy deleted_recipes_select_authenticated
  on public.deleted_recipes
  for select
  to authenticated
  using ((select auth.uid()) is not null);
create policy deleted_recipes_insert_authenticated
  on public.deleted_recipes
  for insert
  to authenticated
  with check ((select auth.uid()) is not null);
create policy deleted_recipes_update_authenticated
  on public.deleted_recipes
  for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
create policy deleted_recipes_delete_authenticated
  on public.deleted_recipes
  for delete
  to authenticated
  using ((select auth.uid()) is not null);
drop policy if exists material_costs_select_authenticated on public.material_costs;
drop policy if exists material_costs_insert_authenticated on public.material_costs;
drop policy if exists material_costs_update_authenticated on public.material_costs;
drop policy if exists material_costs_delete_authenticated on public.material_costs;
create policy material_costs_select_authenticated
  on public.material_costs
  for select
  to authenticated
  using ((select auth.uid()) is not null);
create policy material_costs_insert_authenticated
  on public.material_costs
  for insert
  to authenticated
  with check ((select auth.uid()) is not null);
create policy material_costs_update_authenticated
  on public.material_costs
  for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
create policy material_costs_delete_authenticated
  on public.material_costs
  for delete
  to authenticated
  using ((select auth.uid()) is not null);
drop policy if exists recent_views_authenticated_access on public.recent_views;
create policy recent_views_authenticated_access
  on public.recent_views
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
drop policy if exists recipe_sources_authenticated_access on public.recipe_sources;
create policy recipe_sources_authenticated_access
  on public.recipe_sources
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);
drop policy if exists "recipes_select_all" on public.recipes;
drop policy if exists "recipes_insert_authenticated" on public.recipes;
drop policy if exists "recipes_update_authenticated" on public.recipes;
drop policy if exists "recipes_delete_authenticated" on public.recipes;
create policy "recipes_select_all"
  on public.recipes
  for select
  to authenticated
  using ((select auth.uid()) is not null);
create policy "recipes_insert_authenticated"
  on public.recipes
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and char_length(title) <= 200
    and char_length(coalesce(description, '')) <= 1000
    and jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );
create policy "recipes_update_authenticated"
  on public.recipes
  for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check (
    (select auth.uid()) is not null
    and char_length(title) <= 200
    and char_length(coalesce(description, '')) <= 1000
    and jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
  );
create policy "recipes_delete_authenticated"
  on public.recipes
  for delete
  to authenticated
  using ((select auth.uid()) is not null);
-- ---------------------------------------------------------------------------
-- storage.objects policies
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can delete any file in app-data" on storage.objects;
drop policy if exists "Admins can upload files to app-data" on storage.objects;
drop policy if exists "Users can manage own files in app-data" on storage.objects;
drop policy if exists "Authenticated read recipe-images" on storage.objects;
drop policy if exists "Admins can read files in app-data" on storage.objects;
create policy "Admins can delete any file in app-data"
  on storage.objects
  for delete
  using (
    bucket_id = 'app-data'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );
create policy "Admins can upload files to app-data"
  on storage.objects
  for insert
  with check (
    bucket_id = 'app-data'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );
create policy "Users can manage own files in app-data"
  on storage.objects
  for all
  using (
    bucket_id = 'app-data'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'app-data'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Authenticated read recipe-images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (select auth.uid()) is not null
  );
create policy "Admins can read files in app-data"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'app-data'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );
commit;
