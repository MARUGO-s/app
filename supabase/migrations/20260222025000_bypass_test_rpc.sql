-- Create a copy of the RPC that skips auth for testing
create or replace function public.admin_list_profiles_test()
returns table (
    id uuid,
    display_id text,
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
begin
  return query
    select 
        p.id,
        p.display_id,
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
create or replace function public.admin_get_login_logs_test(p_user_id uuid)
returns table (
    login_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
        select l.login_at
        from public.user_login_logs l
        where l.user_id = p_user_id
        order by l.login_at desc;
end;
$$;
grant execute on function public.admin_list_profiles_test() to anon, authenticated;
grant execute on function public.admin_get_login_logs_test(uuid) to anon, authenticated;
-- Force postgREST schematic reload
NOTIFY pgrst, 'reload schema';
