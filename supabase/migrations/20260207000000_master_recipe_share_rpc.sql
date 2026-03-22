-- Resolve master recipe sharing without widening profiles RLS.
-- 1) Allow admin to set show_master_recipes for other users via RPC.
-- 2) Expose master owner tags (admin ids/display_ids) via RPC for filtering.

create or replace function public.admin_set_show_master_recipes(
  target_profile_id uuid,
  enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_admin boolean;
  updated_profile public.profiles;
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

  if not requester_is_admin and requester_id <> target_profile_id then
    raise exception 'insufficient_privilege';
  end if;

  update public.profiles p
     set show_master_recipes = enabled,
         updated_at = now()
   where p.id = target_profile_id
   returning p.* into updated_profile;

  if updated_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  return updated_profile;
end;
$$;
grant execute on function public.admin_set_show_master_recipes(uuid, boolean) to authenticated;
create or replace function public.get_master_recipe_owner_tags()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with admin_tags as (
    select ('owner:' || p.id::text) as owner_tag
    from public.profiles p
    where p.role = 'admin'
    union
    select ('owner:' || p.display_id) as owner_tag
    from public.profiles p
    where p.role = 'admin'
      and p.display_id is not null
      and btrim(p.display_id) <> ''
  )
  select coalesce(
    array_agg(distinct t.owner_tag),
    array['owner:yoshito', 'owner:admin']::text[]
  )
  from (
    select owner_tag from admin_tags
    union
    select 'owner:yoshito'
    union
    select 'owner:admin'
  ) t;
$$;
grant execute on function public.get_master_recipe_owner_tags() to authenticated;
