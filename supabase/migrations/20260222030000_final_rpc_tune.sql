-- Final fix to ensure admin_list_profiles correctly returns last_sign_in_at without cache issues

drop function if exists public.admin_list_profiles();
-- Using a simpler explicit column list and ensuring we don't return unexpected columns
create or replace function public.admin_list_profiles()
returns table (
    id uuid,
    display_id text,
    avatar_url text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    role text,
    email text,
    show_master_recipes boolean,
    last_sign_in_at timestamp with time zone
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
        null::text as avatar_url, -- Restore the avatar_url just as a null column so frontend doesn't crash if it expects it
        p.created_at,
        p.updated_at,
        p.role,
        p.email,
        p.show_master_recipes,
        au.last_sign_in_at
    from public.profiles p
    left join auth.users au on au.id = p.id
    order by p.created_at desc;
end;
$$;
grant execute on function public.admin_list_profiles() to authenticated;
-- Also explicitly rebuild the cache
NOTIFY pgrst, 'reload schema';
