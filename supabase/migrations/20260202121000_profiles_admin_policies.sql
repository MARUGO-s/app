-- Admin helper for RLS on profiles (and future tables)

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- Allow admin to read/update all profiles (while keeping "own" access too)
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own_or_admin on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

create policy profiles_update_own_or_admin on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

