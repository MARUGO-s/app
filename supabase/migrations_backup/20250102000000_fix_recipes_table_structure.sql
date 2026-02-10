-- Fix recipes table structure by adding missing columns
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS groq_generated BOOLEAN DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT 'ja';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS original_recipe_data JSONB;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_recipes_ai_generated ON recipes(ai_generated);

-- Ensure RLS policies exist
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Allow anonymous read access" ON recipes;
  DROP POLICY IF EXISTS "Allow anonymous insert" ON recipes;
  DROP POLICY IF EXISTS "Allow anonymous update" ON recipes;
  DROP POLICY IF EXISTS "Allow anonymous delete" ON recipes;
  
  -- Create new policies
  CREATE POLICY "Allow anonymous read access" ON recipes
    FOR SELECT USING (true);
    
  CREATE POLICY "Allow anonymous insert" ON recipes
    FOR INSERT WITH CHECK (true);
    
  CREATE POLICY "Allow anonymous update" ON recipes
    FOR UPDATE USING (true);
    
  CREATE POLICY "Allow anonymous delete" ON recipes
    FOR DELETE USING (true);
END $$;


