
-- Force permissive RLS for recipes to fix 0 results issue
BEGIN;

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON recipes;
DROP POLICY IF EXISTS "Public read access for recipes" ON recipes;
DROP POLICY IF EXISTS "Enable read access for all users" ON recipes;

CREATE POLICY "Public read access for recipes"
ON recipes FOR SELECT
USING (true);

COMMIT;
