
-- Force permissive RLS for recipes
-- 20260207_fix_recipe_rls.sql

BEGIN;

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for recipes" ON recipes;

CREATE POLICY "Public read access for recipes"
ON recipes FOR SELECT
USING (true);

COMMIT;
