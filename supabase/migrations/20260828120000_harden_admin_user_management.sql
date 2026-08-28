-- Make role changes and account deletion identity-based, auditable, and safe.
-- No email/display-id allowlist is permitted to confer or preserve privilege.

begin;

-- Audit records must survive account deletion. Keeping a foreign key with
-- ON DELETE SET NULL on a NOT NULL column made legitimate deletion fail and
-- encouraged client-side, non-atomic audit logging.
alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_admin_id_fkey;

comment on column public.admin_audit_logs.admin_id is
  'Immutable UUID of the administrator at the time of the action; intentionally not a foreign key so audit history survives account deletion.';

create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester_id uuid := auth.uid();
  v_old_role text;
  v_new_role text := lower(btrim(coalesce(p_role, '')));
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
  if p_user_id is null or v_new_role not in ('user', 'admin') then
    raise exception 'invalid_role_or_target' using errcode = '22023';
  end if;
  if p_user_id = v_requester_id then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;

  select p.role
  into v_old_role
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles p
  set role = v_new_role,
      updated_at = now()
  where p.id = p_user_id;

  insert into public.admin_audit_logs (admin_id, action, target_id, detail)
  values (
    v_requester_id,
    'set_role',
    p_user_id::text,
    jsonb_build_object('old_role', v_old_role, 'new_role', v_new_role)
  );
end;
$$;

revoke execute on function public.admin_set_role(uuid, text)
  from public, anon;
grant execute on function public.admin_set_role(uuid, text)
  to authenticated;

create or replace function public.admin_delete_user(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester_id uuid := auth.uid();
  v_target_role text;
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
  if p_user_id is null then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  if p_user_id = v_requester_id then
    raise exception 'cannot_delete_yourself' using errcode = '42501';
  end if;

  select p.role
  into v_target_role
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_id, detail)
  values (
    v_requester_id,
    'delete_user',
    p_user_id::text,
    jsonb_build_object('deleted_role', v_target_role)
  );

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'auth_user_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_delete_user(uuid)
  from public, anon;
grant execute on function public.admin_delete_user(uuid)
  to authenticated;

-- Keep store assignment within the same server-enforced length advertised by
-- the UI, and write the audit record in the same transaction as the change.
create or replace function public.admin_set_profile_store_name(
  target_profile_id uuid,
  new_store_name text
)
returns table (
  id uuid,
  display_id text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  role text,
  email text,
  store_name text,
  show_master_recipes boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requester_id uuid := auth.uid();
  v_normalized_store_name text := nullif(btrim(new_store_name), '');
  v_old_store_name text;
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
  if target_profile_id is null
     or char_length(coalesce(v_normalized_store_name, '')) > 100 then
    raise exception 'invalid_store_assignment' using errcode = '22023';
  end if;

  select p.store_name
  into v_old_store_name
  from public.profiles p
  where p.id = target_profile_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles p
  set store_name = v_normalized_store_name,
      updated_at = now()
  where p.id = target_profile_id;

  insert into public.admin_audit_logs (admin_id, action, target_id, detail)
  values (
    v_requester_id,
    'set_store_name',
    target_profile_id::text,
    jsonb_build_object(
      'old_store_name', v_old_store_name,
      'new_store_name', v_normalized_store_name
    )
  );

  return query
  select
    p.id,
    p.display_id,
    p.created_at,
    p.updated_at,
    p.role,
    p.email,
    p.store_name,
    p.show_master_recipes
  from public.profiles p
  where p.id = target_profile_id;
end;
$$;

revoke execute on function public.admin_set_profile_store_name(uuid, text)
  from public, anon;
grant execute on function public.admin_set_profile_store_name(uuid, text)
  to authenticated;

-- Legacy password/security-question storage is no longer part of the app.
-- Seal it from browser API roles until the historical data is removed under a
-- separately approved credential-incident procedure.
revoke all privileges on table public.app_users from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
