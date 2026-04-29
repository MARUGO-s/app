-- Security hardening for Supabase Security Advisor findings.
-- Fixes:
--   - rls_disabled_in_public
--   - sensitive_columns_exposed (notably on public.app_users)

begin;
alter table if exists public.api_rate_limits enable row level security;
alter table if exists public.app_users enable row level security;
alter table if exists public.deleted_recipes enable row level security;
-- deleted_recipes is used by authenticated app users.
-- Keep app behavior while removing anonymous/public table access.
do $$
begin
  if to_regclass('public.deleted_recipes') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'deleted_recipes'
        and policyname = 'deleted_recipes_select_authenticated'
    ) then
      create policy deleted_recipes_select_authenticated
        on public.deleted_recipes
        for select
        to authenticated
        using (true);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'deleted_recipes'
        and policyname = 'deleted_recipes_insert_authenticated'
    ) then
      create policy deleted_recipes_insert_authenticated
        on public.deleted_recipes
        for insert
        to authenticated
        with check (true);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'deleted_recipes'
        and policyname = 'deleted_recipes_update_authenticated'
    ) then
      create policy deleted_recipes_update_authenticated
        on public.deleted_recipes
        for update
        to authenticated
        using (true)
        with check (true);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'deleted_recipes'
        and policyname = 'deleted_recipes_delete_authenticated'
    ) then
      create policy deleted_recipes_delete_authenticated
        on public.deleted_recipes
        for delete
        to authenticated
        using (true);
    end if;
  end if;
end
$$;
commit;
