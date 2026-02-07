-- Add email to profiles for admin UI display (password is NOT retrievable)

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    alter table public.profiles
      add column if not exists email text;

    -- Backfill from auth.users when available (runs in migration context)
    update public.profiles p
    set email = u.email
    from auth.users u
    where u.id = p.id
      and (p.email is null or p.email = '');

    create index if not exists idx_profiles_email on public.profiles(email);
  end if;
end $$;
