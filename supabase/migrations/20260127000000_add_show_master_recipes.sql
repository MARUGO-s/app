-- Add show_master_recipes column to app_users table
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS show_master_recipes BOOLEAN DEFAULT false;

-- Comment on column
COMMENT ON COLUMN public.app_users.show_master_recipes IS 'Preference to show master recipes (owned by yoshito) for this user';
