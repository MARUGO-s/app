-- Create app_users table to match production schema
CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    password TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    show_master_recipes BOOLEAN DEFAULT false,
    secret_question TEXT,
    secret_answer TEXT,
    last_login_at TIMESTAMP WITH TIME ZONE
);
-- Add comments
COMMENT ON TABLE app_users IS 'Application users table synced from production';
