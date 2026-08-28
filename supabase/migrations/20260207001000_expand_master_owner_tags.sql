-- Expand master-owner detection to include:
-- - all admin profiles (id/display_id)
-- - explicit legacy display_id owners: yoshito/admin (including their uuid owners)

create or replace function public.get_master_recipe_owner_tags()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with source_profiles as (
    select p.id, p.display_id
    from public.profiles p
    where p.role = 'admin'
       or lower(coalesce(p.display_id, '')) in ('yoshito', 'admin')
  ),
  owner_tags as (
    select ('owner:' || sp.id::text) as owner_tag
    from source_profiles sp
    union
    select ('owner:' || sp.display_id) as owner_tag
    from source_profiles sp
    where sp.display_id is not null
      and btrim(sp.display_id) <> ''
  )
  select coalesce(
    array_agg(distinct t.owner_tag),
    array['owner:yoshito', 'owner:admin']::text[]
  )
  from (
    select owner_tag from owner_tags
    union
    select 'owner:yoshito'
    union
    select 'owner:admin'
  ) t;
$$;
grant execute on function public.get_master_recipe_owner_tags() to authenticated;
