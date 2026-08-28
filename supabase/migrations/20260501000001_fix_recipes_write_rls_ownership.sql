-- Fix recipes UPDATE/DELETE to require ownership.
--
-- The previous policies used USING(true), meaning any authenticated user
-- could update or delete any other user's recipe directly via the API,
-- bypassing the client-side owner check in recipeService.js.
--
-- New rules:
--   - Admins (role='admin' in profiles) can update/delete any recipe.
--   - Regular users can only update/delete recipes they own
--     (tag must contain 'owner:<auth.uid()>' or 'owner:<display_id>').

BEGIN;

-- UPDATE: restrict to owner or admin
DROP POLICY IF EXISTS "recipes_update_authenticated" ON public.recipes;
DROP POLICY IF EXISTS "recipes_update_own_or_admin"  ON public.recipes;

CREATE POLICY "recipes_update_own_or_admin"
ON public.recipes
FOR UPDATE
TO authenticated
USING (
    -- Admins can update any recipe
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    -- Owner match by UUID
    tags @> ARRAY['owner:' || auth.uid()::text]
    OR
    -- Owner match by display_id (for legacy recipes tagged with display_id)
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND display_id IS NOT NULL
          AND tags @> ARRAY['owner:' || display_id]
    )
)
WITH CHECK (
    char_length(title) <= 200
    AND char_length(coalesce(description, '')) <= 1000
    AND jsonb_array_length(coalesce(ingredients, '[]'::jsonb)) <= 200
);

-- DELETE: restrict to owner or admin
DROP POLICY IF EXISTS "recipes_delete_authenticated" ON public.recipes;
DROP POLICY IF EXISTS "recipes_delete_own_or_admin"  ON public.recipes;

CREATE POLICY "recipes_delete_own_or_admin"
ON public.recipes
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    tags @> ARRAY['owner:' || auth.uid()::text]
    OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND display_id IS NOT NULL
          AND tags @> ARRAY['owner:' || display_id]
    )
);

COMMIT;
