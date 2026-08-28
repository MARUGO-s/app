-- Scope recipe trash per account.
--
-- deleted_recipes previously allowed every authenticated user to read,
-- restore, or hard-delete every deleted recipe. Recipes in this app use
-- owner:* tags for ownership, so mirror that ownership model here and keep
-- admins able to manage all trash.

BEGIN;

ALTER TABLE public.deleted_recipes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deleted_recipes
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_deleted_recipes_tags_gin
  ON public.deleted_recipes USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_deleted_recipes_deleted_by_deleted_at
  ON public.deleted_recipes (deleted_by_user_id, deleted_at DESC);

DROP POLICY IF EXISTS deleted_recipes_select_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_insert_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_update_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_delete_authenticated ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_select_own_or_admin ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_insert_own_or_admin ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_update_own_or_admin ON public.deleted_recipes;
DROP POLICY IF EXISTS deleted_recipes_delete_own_or_admin ON public.deleted_recipes;

CREATE POLICY deleted_recipes_select_own_or_admin
  ON public.deleted_recipes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR deleted_by_user_id = (SELECT auth.uid())
    OR coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || (SELECT auth.uid())::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.display_id IS NOT NULL
        AND coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || p.display_id]
    )
  );

CREATE POLICY deleted_recipes_insert_own_or_admin
  ON public.deleted_recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    OR deleted_by_user_id = (SELECT auth.uid())
    OR coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || (SELECT auth.uid())::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.display_id IS NOT NULL
        AND coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || p.display_id]
    )
  );

CREATE POLICY deleted_recipes_update_own_or_admin
  ON public.deleted_recipes
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR deleted_by_user_id = (SELECT auth.uid())
    OR coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || (SELECT auth.uid())::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.display_id IS NOT NULL
        AND coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || p.display_id]
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    OR deleted_by_user_id = (SELECT auth.uid())
    OR coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || (SELECT auth.uid())::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.display_id IS NOT NULL
        AND coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || p.display_id]
    )
  );

CREATE POLICY deleted_recipes_delete_own_or_admin
  ON public.deleted_recipes
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR deleted_by_user_id = (SELECT auth.uid())
    OR coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || (SELECT auth.uid())::text]
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.display_id IS NOT NULL
        AND coalesce(tags, '{}'::text[]) @> ARRAY['owner:' || p.display_id]
    )
  );

COMMIT;
