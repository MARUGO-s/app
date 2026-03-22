-- Migration: Track user login history

-- 1. Create table to store login logs
create table if not exists public.user_login_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references auth.users(id) on delete cascade on update cascade,
    login_at timestamp with time zone not null default now()
);
-- Index for faster queries per user (sorted by recent)
create index if not exists idx_user_login_logs_user_id ON public.user_login_logs (user_id, login_at desc);
-- RLS: Only admins can view logs
alter table public.user_login_logs enable row level security;
create policy "Admins can view all login logs" on public.user_login_logs
    for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.role = 'admin'
        )
    );
-- 2. Create trigger function to record logins
-- This listens to updates on auth.users.last_sign_in_at
create or replace function public.log_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- If last_sign_in_at changed and is not null, log it
    if NEW.last_sign_in_at is distinct from OLD.last_sign_in_at and NEW.last_sign_in_at is not null then
        insert into public.user_login_logs (user_id, login_at)
        values (NEW.id, NEW.last_sign_in_at);
    end if;
    return NEW;
end;
$$;
-- Attach trigger to auth.users
drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
    after update of last_sign_in_at on auth.users
    for each row
    execute function public.log_user_login();
-- 3. Create Admin RPC to fetch logs
create or replace function public.admin_get_login_logs(p_user_id uuid)
returns table (
    login_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
    requester_is_admin boolean;
begin
    -- Verify requester is admin
    select exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
    ) into requester_is_admin;

    if not requester_is_admin then
        raise exception 'insufficient_privilege';
    end if;

    return query
        select l.login_at
        from public.user_login_logs l
        where l.user_id = p_user_id
        order by l.login_at desc;
end;
$$;
grant execute on function public.admin_get_login_logs(uuid) to authenticated;
-- 4. Update admin_list_profiles to include last_sign_in_at from auth.users
-- Drop existing implementation of admin_list_profiles to redefine return type
drop function if exists public.admin_list_profiles();
create or replace function public.admin_list_profiles()
-- Return table with profile fields + last_sign_in_at
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
        p.avatar_url,
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
