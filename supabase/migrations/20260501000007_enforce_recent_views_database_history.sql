-- Persist recipe view history in the database per authenticated user.
-- The client no longer uses localStorage as a fallback for recent views.

BEGIN;

ALTER TABLE public.recent_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recent_views
  ADD COLUMN IF NOT EXISTS viewer_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recent_views_viewer_user_id_fkey'
      AND conrelid = 'public.recent_views'::regclass
  ) THEN
    ALTER TABLE public.recent_views
      ADD CONSTRAINT recent_views_viewer_user_id_fkey
      FOREIGN KEY (viewer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.recent_views
  ALTER COLUMN viewer_user_id SET DEFAULT auth.uid();

-- Old global rows cannot be safely assigned to a specific account.
DELETE FROM public.recent_views
WHERE viewer_user_id IS NULL;

ALTER TABLE public.recent_views
  ALTER COLUMN viewer_user_id SET NOT NULL;

ALTER TABLE public.recent_views
  DROP CONSTRAINT IF EXISTS recent_views_recipe_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS recent_views_user_recipe_unique
  ON public.recent_views (viewer_user_id, recipe_id);

CREATE INDEX IF NOT EXISTS idx_recent_views_user_viewed_at
  ON public.recent_views (viewer_user_id, viewed_at DESC);

DROP POLICY IF EXISTS "Enable access to all users" ON public.recent_views;
DROP POLICY IF EXISTS recent_views_authenticated_access ON public.recent_views;

CREATE POLICY recent_views_authenticated_access
  ON public.recent_views
  FOR ALL
  TO authenticated
  USING (viewer_user_id = (SELECT auth.uid()))
  WITH CHECK (viewer_user_id = (SELECT auth.uid()));

COMMIT;
