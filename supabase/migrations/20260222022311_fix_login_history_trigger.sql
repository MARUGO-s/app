-- Drop the existing restricted trigger
drop trigger if exists on_auth_user_login on auth.users;
-- Recreate it only when the function already exists. On a clean replay the
-- function is introduced by the later login-history migration, which creates
-- this trigger itself.
do $$
begin
  if to_regprocedure('public.log_user_login()') is not null then
    create trigger on_auth_user_login
      after update on auth.users
      for each row
      execute function public.log_user_login();
  end if;
end
$$;
