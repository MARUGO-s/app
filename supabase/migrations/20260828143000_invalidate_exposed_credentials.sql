-- Incident response for authentication data that existed in public Git history.
--
-- This deliberately invalidates every password-based login and every active
-- Supabase Auth session. Users must complete the password recovery flow before
-- signing in again. The migration is safe to replay against an empty local DB.

begin;

update auth.users
set
  encrypted_password = extensions.crypt(
    encode(extensions.gen_random_bytes(32), 'hex'),
    extensions.gen_salt('bf', 12)
  ),
  updated_at = now()
where deleted_at is null
  and encrypted_password is not null
  and encrypted_password <> '';

delete from auth.refresh_tokens;
delete from auth.sessions;

commit;
