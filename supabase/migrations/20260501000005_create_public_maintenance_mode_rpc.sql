-- Public maintenance-mode reader.
-- The app must know whether maintenance is ON before a user logs in.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_maintenance_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT f.enabled
      FROM public.app_feature_flags f
      WHERE f.feature_key = 'maintenance_mode'
      LIMIT 1
    ),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_maintenance_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_maintenance_mode() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
