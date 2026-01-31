-- Add last_login_at column to app_users
alter table app_users 
add column if not exists last_login_at timestamp with time zone;

-- Optional: set initial value for existing users (null is fine, means 'never logged in' or 'unknown')
