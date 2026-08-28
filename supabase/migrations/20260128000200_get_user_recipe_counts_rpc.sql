-- Function to count recipes per user, running as security definer to bypass RLS
-- and ensure accurate counts regardless of visibility.

create or replace function get_user_recipe_counts()
returns table (user_id text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    return;
  end if;

  return query
  with users as (
    select
      coalesce(nullif(btrim(display_id), ''), id::text) as user_id,
      id::text as auth_uid,
      lower(coalesce(display_id, '')) as display_id_lc
    from profiles
  )
  select
    u.user_id,
    (
      select count(*)
      from recipes r
      where
        r.tags @> array['owner:' || u.user_id]
        or r.tags @> array['owner:' || u.auth_uid]
        or (
          u.display_id_lc in ('yoshito', 'admin')
          and (
            r.tags is null
            or not exists (
              select 1
              from unnest(r.tags) t
              where t like 'owner:%'
            )
          )
        )
    )::bigint as count
  from users u;
end;
$$;
