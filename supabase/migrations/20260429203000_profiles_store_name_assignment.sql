alter table public.profiles
  add column if not exists store_name text;

update public.profiles p
set store_name = nullif(btrim(au.raw_user_meta_data ->> 'store_name'), '')
from auth.users au
where au.id = p.id
  and coalesce(btrim(p.store_name), '') = ''
  and coalesce(btrim(au.raw_user_meta_data ->> 'store_name'), '') <> '';

drop function if exists public.admin_list_profiles();
create or replace function public.admin_list_profiles()
returns table (
    id uuid,
    display_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    role text,
    email text,
    store_name text,
    show_master_recipes boolean,
    last_sign_in_at timestamp with time zone,
    last_active_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_admin boolean;
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

  return query
    select
      p.id,
      p.display_id,
      p.created_at,
      p.updated_at,
      p.role,
      p.email,
      p.store_name,
      p.show_master_recipes,
      au.last_sign_in_at,
      latest_log.last_active_at
    from public.profiles p
    left join auth.users au
      on au.id = p.id
    left join lateral (
      select max(l.login_at) as last_active_at
      from public.user_login_logs l
      where l.user_id = p.id
    ) latest_log on true
    order by p.created_at desc;
end;
$$;

grant execute on function public.admin_list_profiles() to authenticated;

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
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_admin boolean;
  normalized_store_name text;
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

  if target_profile_id is null then
    raise exception 'profile_not_found';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_profile_id
  ) then
    raise exception 'profile_not_found';
  end if;

  normalized_store_name := nullif(btrim(new_store_name), '');

  update public.profiles p
  set store_name = normalized_store_name,
      updated_at = now()
  where p.id = target_profile_id;

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
    where p.id = target_profile_id
    limit 1;
end;
$$;

grant execute on function public.admin_set_profile_store_name(uuid, text) to authenticated;

notify pgrst, 'reload schema';
