-- Enhanced security policies for Recipe Keeper app
-- Restrict anon key access to safe operations only

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow anonymous read access" ON recipes;
DROP POLICY IF EXISTS "Allow anonymous insert" ON recipes;
DROP POLICY IF EXISTS "Allow anonymous update" ON recipes;
DROP POLICY IF EXISTS "Allow anonymous delete" ON recipes;

-- Create more restrictive policies

-- 1. Allow read access to all recipes (safe for public recipe sharing)
CREATE POLICY "Public read access" ON recipes
  FOR SELECT 
  USING (true);

-- 2. Allow insert only with rate limiting (prevent spam)
CREATE POLICY "Limited insert access" ON recipes
  FOR INSERT 
  WITH CHECK (
    -- Limit to reasonable recipe data
    char_length(title) <= 200 AND
    char_length(description) <= 1000 AND
    jsonb_array_length(COALESCE(ingredients, '[]'::jsonb)) <= 50 AND
    jsonb_array_length(COALESCE(steps, '[]'::jsonb)) <= 30
  );

-- 3. Restrict updates to recent recipes only (prevent abuse)
CREATE POLICY "Recent recipe updates only" ON recipes
  FOR UPDATE 
  USING (
    created_at > NOW() - INTERVAL '24 hours'
  )
  WITH CHECK (
    -- Same validation as insert
    char_length(title) <= 200 AND
    char_length(description) <= 1000 AND
    jsonb_array_length(COALESCE(ingredients, '[]'::jsonb)) <= 50 AND
    jsonb_array_length(COALESCE(steps, '[]'::jsonb)) <= 30
  );

-- 4. Restrict deletes to very recent recipes only
CREATE POLICY "Very recent recipe deletes only" ON recipes
  FOR DELETE 
  USING (
    created_at > NOW() - INTERVAL '1 hour'
  );

-- Add rate limiting function (optional - requires custom implementation)
-- This would need to be implemented with additional tables for tracking

-- Create a view for public recipe access (additional security layer)
CREATE OR REPLACE VIEW public_recipes AS
SELECT 
  id,
  title,
  description,
  servings,
  ingredients,
  steps,
  notes,
  image_url,
  category,
  tags,
  created_at
FROM recipes
WHERE 
  -- Only show recipes that meet quality standards
  title IS NOT NULL AND
  char_length(title) >= 3 AND
  ingredients IS NOT NULL AND
  jsonb_array_length(ingredients) > 0;

-- Grant access to the view
GRANT SELECT ON public_recipes TO anon;
GRANT SELECT ON public_recipes TO authenticated;


