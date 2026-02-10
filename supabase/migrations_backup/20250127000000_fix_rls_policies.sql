-- Fix RLS policies to allow proper recipe access
-- Remove restrictive time-based policies that cause 406 errors

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Recent recipe updates only" ON recipes;
DROP POLICY IF EXISTS "Very recent recipe deletes only" ON recipes;

-- Create more permissive policies for development/testing
CREATE POLICY "Allow anonymous update" ON recipes
  FOR UPDATE 
  USING (true)
  WITH CHECK (
    -- Basic validation only
    char_length(title) <= 200 AND
    char_length(description) <= 1000 AND
    jsonb_array_length(COALESCE(ingredients, '[]'::jsonb)) <= 50 AND
    jsonb_array_length(COALESCE(steps, '[]'::jsonb)) <= 30
  );

CREATE POLICY "Allow anonymous delete" ON recipes
  FOR DELETE 
  USING (true);

-- Ensure read access is always available
DROP POLICY IF EXISTS "Public read access" ON recipes;
CREATE POLICY "Public read access" ON recipes
  FOR SELECT 
  USING (true);
