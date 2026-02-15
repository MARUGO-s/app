-- Global feature flags controllable by admins.
-- Used for cross-account switches such as voice input enable/disable.

create table if not exists public.app_feature_flags (
  feature_key text primary key,
  enabled boolean not null default false,
  updated_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.app_feature_flags (feature_key, enabled)
values ('voice_input_enabled', false)
on conflict (feature_key) do nothing;

alter table public.app_feature_flags enable row level security;

drop policy if exists app_feature_flags_select_authenticated on public.app_feature_flags;
create policy app_feature_flags_select_authenticated
  on public.app_feature_flags
  for select
  to authenticated
  using (true);

-- Direct writes are admin-only.
drop policy if exists app_feature_flags_insert_admin on public.app_feature_flags;
create policy app_feature_flags_insert_admin
  on public.app_feature_flags
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists app_feature_flags_update_admin on public.app_feature_flags;
create policy app_feature_flags_update_admin
  on public.app_feature_flags
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists app_feature_flags_delete_admin on public.app_feature_flags;
create policy app_feature_flags_delete_admin
  on public.app_feature_flags
  for delete
  to authenticated
  using (public.is_admin());

create or replace function public.get_feature_flag(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  v_enabled boolean;
begin
  requester_id := auth.uid();
  if requester_id is null then
    raise exception 'not authenticated';
  end if;

  select f.enabled
    into v_enabled
    from public.app_feature_flags f
   where f.feature_key = p_key
   limit 1;

  return coalesce(v_enabled, false);
end;
$$;

grant execute on function public.get_feature_flag(text) to authenticated;

create or replace function public.admin_set_feature_flag(p_key text, p_enabled boolean)
returns public.app_feature_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_admin boolean;
  out_row public.app_feature_flags;
begin
  requester_id := auth.uid();
  if requester_id is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1
      from public.profiles p
     where p.id = requester_id
       and p.role = 'admin'
  ) into requester_is_admin;

  if not requester_is_admin then
    raise exception 'insufficient_privilege';
  end if;

  insert into public.app_feature_flags (feature_key, enabled, updated_by, updated_at)
  values (p_key, coalesce(p_enabled, false), requester_id, now())
  on conflict (feature_key)
  do update set
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into out_row;

  return out_row;
end;
$$;

grant execute on function public.admin_set_feature_flag(text, boolean) to authenticated;
