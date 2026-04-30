-- Add show_master_recipes column to app_users table when present.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'app_users'
  ) then
    alter table public.app_users
    add column if not exists show_master_recipes boolean default false;

    comment on column public.app_users.show_master_recipes is
      'Preference to show master recipes (owned by yoshito) for this user';
  end if;
end $$;
