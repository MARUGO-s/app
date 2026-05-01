-- Admin audit log table.
-- Records who performed which admin action and when, for compliance and incident investigation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    action      TEXT        NOT NULL,           -- e.g. 'set_role', 'delete_user', 'reset_password'
    target_id   TEXT,                           -- affected user ID (or other resource ID)
    detail      JSONB,                          -- optional payload (new_role, etc.)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs.
CREATE POLICY "admin_audit_logs_select_admin"
ON public.admin_audit_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Inserts go through the service-role RPC only; no direct insert from client.
-- (The RPC below is SECURITY DEFINER so it bypasses this policy.)
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_logs FROM authenticated;

-- Index for lookups by admin or target.
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_id_idx  ON public.admin_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_id_idx ON public.admin_audit_logs (target_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);

-- RPC for server-side audit log insertion (called from Edge Functions / service role).
CREATE OR REPLACE FUNCTION public.admin_write_audit_log(
    p_admin_id  UUID,
    p_action    TEXT,
    p_target_id TEXT DEFAULT NULL,
    p_detail    JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.admin_audit_logs (admin_id, action, target_id, detail)
    VALUES (p_admin_id, p_action, p_target_id, p_detail);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_write_audit_log(UUID, TEXT, TEXT, JSONB)
    TO service_role;

COMMIT;
