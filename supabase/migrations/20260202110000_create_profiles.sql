-- App profiles tied to Supabase Auth users

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id text UNIQUE NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  show_master_recipes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile row (after signUp)
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile (preferences)
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_display_id ON profiles(display_id);
