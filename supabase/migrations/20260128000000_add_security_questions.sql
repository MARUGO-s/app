-- Add security question columns to app_users when present.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'app_users'
  ) then
    alter table public.app_users
    add column if not exists secret_question text,
    add column if not exists secret_answer text;

    comment on column public.app_users.secret_question is 'Question for password recovery';
    comment on column public.app_users.secret_answer is 'Answer for password recovery';
  end if;
end $$;
