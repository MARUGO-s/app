-- Consolidate permissive policies on public.account_backups
-- Goal: remove "Multiple Permissive Policies" warnings for the table.

begin;
-- Remove legacy / overlapping policies
drop policy if exists "Users can read own backups" on public.account_backups;
drop policy if exists "Admins can read all backups" on public.account_backups;
drop policy if exists "Service role can upsert backups" on public.account_backups;
drop policy if exists "Admins can upsert backups" on public.account_backups;
drop policy if exists account_backups_select_user_or_admin on public.account_backups;
drop policy if exists account_backups_all_admin on public.account_backups;
drop policy if exists account_backups_all_service_role on public.account_backups;
-- 1) Authenticated users: single SELECT policy
--    - own rows OR admin can read all
create policy account_backups_select_user_or_admin
  on public.account_backups
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
-- 2) Authenticated admins: single ALL policy for write operations
create policy account_backups_all_admin
  on public.account_backups
  for all
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
-- 3) Service role: dedicated ALL policy
create policy account_backups_all_service_role
  on public.account_backups
  for all
  to service_role
  using (true)
  with check (true);
commit;
