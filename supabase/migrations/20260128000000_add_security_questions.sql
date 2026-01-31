-- Add security question columns to app_users
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS secret_question TEXT,
ADD COLUMN IF NOT EXISTS secret_answer TEXT;

COMMENT ON COLUMN public.app_users.secret_question IS 'Question for password recovery';
COMMENT ON COLUMN public.app_users.secret_answer IS 'Answer for password recovery';
