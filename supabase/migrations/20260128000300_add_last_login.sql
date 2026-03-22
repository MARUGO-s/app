-- Add last_login_at column to app_users when present.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'app_users'
  ) then
    alter table public.app_users
    add column if not exists last_login_at timestamp with time zone;
  end if;
end $$;
-- Optional: set initial value for existing users (null is fine, means 'never logged in' or 'unknown');
