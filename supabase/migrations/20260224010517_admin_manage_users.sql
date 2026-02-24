-- 1. admin_set_role
-- Admin user can change role of other users
create or replace function public.admin_set_role(
    p_user_id uuid,
    p_role text
)
returns void
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

    -- Update role in profiles
    update public.profiles
    set role = p_role,
        updated_at = timezone('utc'::text, now())
    where id = p_user_id;
end;
$$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
-- 2. admin_delete_user
-- Admin user can delete other users
create or replace function public.admin_delete_user(
    p_user_id uuid
)
returns void
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

    -- Precaution: Cannot delete yourself
    if requester_id = p_user_id then
        raise exception 'cannot delete yourself';
    end if;

    -- Precaution: Cannot delete pingus0428@gmail.com
    if exists (
        select 1 from public.profiles where id = p_user_id and email = 'pingus0428@gmail.com'
    ) then
        raise exception 'cannot delete super admin';
    end if;

    -- Due to the cascade setup, deleting from auth.users should clean up profiles, identities, etc.
    -- However, direct auth schema manipulation from a security definer function usually requires postgres or supabase_admin.
    -- This requires a specific trick inside Supabase: the function needs enough privilege to touch auth.users.
    -- We assume the invoker is granted needed roles, or we do direct deletion from auth.users.
    
    -- NOTE: Typically, plpgsql in the public schema runs as the creator. If created by postgres, it has permissions.
    delete from auth.users where id = p_user_id;

end;
$$;
grant execute on function public.admin_delete_user(uuid) to authenticated;
