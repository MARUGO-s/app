-- Enable RLS for rate limit tables flagged by Security Advisor.
-- Edge Functions use service_role for these writes, so only service_role is allowed.

DO $$
BEGIN
  IF to_regclass('public.app_rate_limits') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.app_rate_limits ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'app_rate_limits'
        AND policyname = 'service_role_manage_app_rate_limits'
    ) THEN
      EXECUTE 'CREATE POLICY "service_role_manage_app_rate_limits" ON public.app_rate_limits
        FOR ALL TO service_role
        USING (true)
        WITH CHECK (true)';
    END IF;
  END IF;

  IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'api_rate_limits'
        AND policyname = 'service_role_manage_api_rate_limits'
    ) THEN
      EXECUTE 'CREATE POLICY "service_role_manage_api_rate_limits" ON public.api_rate_limits
        FOR ALL TO service_role
        USING (true)
        WITH CHECK (true)';
    END IF;
  END IF;
END $$;
