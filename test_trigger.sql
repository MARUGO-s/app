update auth.users set last_sign_in_at = now() where id = (select id from auth.users limit 1);
select * from public.user_login_logs;
