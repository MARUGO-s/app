-- Close privilege-escalation paths around profiles and legacy admin RPCs.
--
-- Security invariants after this migration:
--   * browser users cannot write profiles.role, email, store assignment, or ids;
--   * profile creation always gets role='user' from the database default/trigger;
--   * a recipe has exactly one owner tag belonging to the caller;
--   * destructive cross-account RPCs perform their own admin check;
--   * old test/debug RPCs are service-role only.

begin;

-- ---------------------------------------------------------------------------
-- profiles: RLS limits rows; column ACLs limit which fields can be supplied.
-- No direct browser UPDATE is required: preferences and admin assignments use
-- checked RPCs (admin_set_show_master_recipes/admin_set_profile_store_name).
-- ---------------------------------------------------------------------------
revoke all privileges on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, display_id, email, store_name)
  on table public.profiles to authenticated;

drop policy if exists profiles_update_own_safeguard on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_own_or_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert
  to authenticated
  with check (
    (select auth.uid()) = id
    and role = 'user'
    and show_master_recipes is false
    and lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_role_allowed
      check (role in ('user', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_reserved_display_id_admin_only'
  ) then
    alter table public.profiles
      add constraint profiles_reserved_display_id_admin_only
      check (
        role = 'admin'
        or lower(btrim(display_id)) not in ('admin', 'yoshito')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_display_id_not_uuid'
  ) then
    alter table public.profiles
      add constraint profiles_display_id_not_uuid
      check (
        display_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
  end if;
end
$$;

-- Master-recipe visibility is an administrator-granted permission. The old
-- RPC allowed any user to enable it for their own profile.
create or replace function public.admin_set_show_master_recipes(
  target_profile_id uuid,
  enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester_id uuid := auth.uid();
  v_updated_profile public.profiles;
begin
  if v_requester_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_requester_id
      and p.role = 'admin'
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.profiles p
  set show_master_recipes = coalesce(enabled, false),
      updated_at = now()
  where p.id = target_profile_id
  returning p.* into v_updated_profile;

  if v_updated_profile.id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_id, detail)
  values (
    v_requester_id,
    'set_master_recipe_visibility',
    target_profile_id::text,
    jsonb_build_object('enabled', coalesce(enabled, false))
  );

  return v_updated_profile;
end;
$$;

revoke execute on function public.admin_set_show_master_recipes(uuid, boolean)
  from public, anon;
grant execute on function public.admin_set_show_master_recipes(uuid, boolean)
  to authenticated;

-- A caller may not smuggle an additional owner tag (for example owner:admin)
-- alongside their own tag. Legacy display-id ownership remains readable.
create or replace function public.owns_recipe_tags(recipe_tags text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    recipe_tags is not null
    and (
      select count(*)
      from unnest(recipe_tags) as owner_tag
      where owner_tag like 'owner:%'
    ) = 1
    and (
      recipe_tags @> array['owner:' || auth.uid()::text]
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.display_id is not null
          and recipe_tags @> array['owner:' || p.display_id]
      )
    );
$$;

revoke execute on function public.owns_recipe_tags(text[]) from public, anon;
grant execute on function public.owns_recipe_tags(text[]) to authenticated;

-- RLS is the row boundary, while explicit ACLs define which API roles may
-- reach it. Anonymous users have no recipe-table access.
revoke all privileges on table public.recipes from anon;
grant select, insert, update, delete on table public.recipes to authenticated;
revoke all privileges on sequence public.recipes_id_seq from anon;
grant usage, select on sequence public.recipes_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Admin-only bulk copy. The old implementation trusted p_admin_id and never
-- checked the caller, allowing any signed-in account to overwrite every
-- non-admin user's ingredient master.
-- ---------------------------------------------------------------------------
create or replace function public.admin_copy_master_to_all_users(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_user_id uuid;
begin
  if p_admin_id is null then
    raise exception 'admin_source_required' using errcode = '22023';
  end if;

  if not v_is_service_role then
    if v_requester_id is null then
      raise exception 'not_authenticated' using errcode = '28000';
    end if;
    if v_requester_id <> p_admin_id then
      raise exception 'source_must_be_current_admin' using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_admin_id
      and p.role = 'admin'
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  for v_user_id in
    select p.id
    from public.profiles p
    where p.role is distinct from 'admin'
  loop
    insert into public.unit_conversions (
      user_id,
      ingredient_name,
      packet_unit,
      packet_size,
      last_price,
      item_category,
      vendor,
      yield_percent,
      updated_at
    )
    select
      v_user_id::text,
      source.ingredient_name,
      source.packet_unit,
      source.packet_size,
      source.last_price,
      source.item_category,
      source.vendor,
      source.yield_percent,
      now()
    from public.unit_conversions source
    where source.user_id = p_admin_id::text
    on conflict (user_id, ingredient_name)
    do update set
      packet_unit = excluded.packet_unit,
      packet_size = excluded.packet_size,
      last_price = excluded.last_price,
      item_category = excluded.item_category,
      vendor = excluded.vendor,
      yield_percent = excluded.yield_percent,
      updated_at = now();

    insert into public.csv_unit_overrides (
      user_id,
      ingredient_name,
      csv_unit,
      updated_at
    )
    select
      v_user_id::text,
      source.ingredient_name,
      source.csv_unit,
      now()
    from public.csv_unit_overrides source
    where source.user_id = p_admin_id::text
    on conflict (user_id, ingredient_name)
    do update set
      csv_unit = excluded.csv_unit,
      updated_at = now();
  end loop;
end;
$$;

revoke execute on function public.admin_copy_master_to_all_users(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_copy_master_to_all_users(uuid)
  to authenticated, service_role;

-- This aggregate exposes every account's recipe count and is admin-only.
create or replace function public.get_user_recipe_counts()
returns table(user_id text, count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return query
  with users as (
    select
      coalesce(nullif(btrim(p.display_id), ''), p.id::text) as user_id,
      p.id::text as auth_uid,
      lower(coalesce(p.display_id, '')) as display_id_lc
    from public.profiles p
  )
  select
    u.user_id,
    (
      select count(*)
      from public.recipes r
      where
        r.tags @> array['owner:' || u.user_id]
        or r.tags @> array['owner:' || u.auth_uid]
        or (
          u.display_id_lc in ('yoshito', 'admin')
          and not exists (
            select 1
            from unnest(coalesce(r.tags, array[]::text[])) t
            where t like 'owner:%'
          )
        )
    )::bigint as count
  from users u;
end;
$$;

revoke execute on function public.get_user_recipe_counts()
  from public, anon;
grant execute on function public.get_user_recipe_counts()
  to authenticated;

-- Old diagnostics bypass all row policies and are never used by the app.
revoke all privileges on function public.admin_list_profiles_test()
  from public, anon, authenticated;
revoke all privileges on function public.admin_get_login_logs_test(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_list_profiles_test() to service_role;
grant execute on function public.admin_get_login_logs_test(uuid) to service_role;

-- Trigger functions are not public RPCs.
revoke all privileges on function public.handle_new_user()
  from public, anon, authenticated;
revoke all privileges on function public.update_profile_on_recipe_change()
  from public, anon, authenticated;
revoke all privileges on function public.log_user_active_presence()
  from public, anon, authenticated;
revoke all privileges on function public.log_user_login()
  from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.update_profile_on_recipe_change() to service_role;
grant execute on function public.log_user_active_presence() to service_role;
grant execute on function public.log_user_login() to service_role;

-- ---------------------------------------------------------------------------
-- Sharing RPCs: authenticated users need only a stable id and display name,
-- not email addresses, roles, preferences, or timestamps.
-- ---------------------------------------------------------------------------
drop function if exists public.list_profiles_for_reference_share();
create function public.list_profiles_for_reference_share()
returns table(id uuid, display_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  return query
  select p.id, p.display_id
  from public.profiles p
  where p.id <> auth.uid()
  order by p.display_id asc nulls last;
end;
$$;

revoke execute on function public.list_profiles_for_reference_share()
  from public, anon;
grant execute on function public.list_profiles_for_reference_share()
  to authenticated;

revoke execute on function public.list_reference_shares_owned()
  from public, anon;
revoke execute on function public.list_shared_reference_attachments_for_viewer()
  from public, anon;
revoke execute on function public.set_reference_attachment_shares(uuid, text, uuid[])
  from public, anon;
grant execute on function public.list_reference_shares_owned()
  to authenticated;
grant execute on function public.list_shared_reference_attachments_for_viewer()
  to authenticated;
grant execute on function public.set_reference_attachment_shares(uuid, text, uuid[])
  to authenticated;

-- These helpers are only reached by authenticated recipe policies.
revoke execute on function public.can_read_recipe_tags(text[])
  from public, anon;
revoke execute on function public.is_admin_safe()
  from public, anon;
grant execute on function public.can_read_recipe_tags(text[])
  to authenticated;
grant execute on function public.is_admin_safe()
  to authenticated;

-- Resolve mutable search_path warnings and keep AI memory search user-scoped.
alter function public.set_recipe_ai_memories_updated_at()
  set search_path = public, pg_temp;
alter function public.set_user_reference_documents_updated_at()
  set search_path = public, pg_temp;
alter function public.search_recipe_ai_memories(text, text, integer)
  set search_path = public, pg_temp;
revoke execute on function public.search_recipe_ai_memories(text, text, integer)
  from public, anon;
grant execute on function public.search_recipe_ai_memories(text, text, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
