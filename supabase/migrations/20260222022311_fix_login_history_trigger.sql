-- Drop the existing restricted trigger
drop trigger if exists on_auth_user_login on auth.users;
-- Recreate it to fire on ANY update to auth.users
-- The function logic already handles checking if last_sign_in_at actually changed
create trigger on_auth_user_login
    after update on auth.users
    for each row
    execute function public.log_user_login();
