-- Atomic rate limit check-and-increment function.
-- Replaces the SELECT-then-UPDATE two-step pattern in rate-limiter.ts which
-- had a TOCTOU race condition: two concurrent requests could both read
-- request_count < max_requests, then both increment, exceeding the limit.
--
-- This function uses INSERT ... ON CONFLICT DO UPDATE RETURNING so the check
-- and increment happen in a single atomic statement under PostgreSQL's row lock.
-- Window start is snapped to a fixed grid so ON CONFLICT reliably hits the
-- existing row rather than inserting a duplicate.

CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
    p_user_id      TEXT,
    p_endpoint     TEXT,
    p_max_requests INTEGER,
    p_window_minutes INTEGER
)
RETURNS TABLE (
    allowed         BOOLEAN,
    request_count   INTEGER,
    window_start    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start  TIMESTAMPTZ;
    v_count         INTEGER;
BEGIN
    -- Snap now() to a fixed-width bucket so every request in the same window
    -- hits the same window_start value, enabling ON CONFLICT to work correctly.
    v_window_start := to_timestamp(
        floor(extract(epoch from now()) / (p_window_minutes * 60))
        * (p_window_minutes * 60)
    );

    -- Atomic upsert: first request in the window inserts count=1;
    -- subsequent requests increment atomically under the row lock.
    INSERT INTO api_rate_limits (user_id, endpoint, request_count, window_start, updated_at)
    VALUES (p_user_id, p_endpoint, 1, v_window_start, now())
    ON CONFLICT (user_id, endpoint, window_start)
    DO UPDATE SET
        request_count = api_rate_limits.request_count + 1,
        updated_at    = now()
    RETURNING api_rate_limits.request_count
    INTO v_count;

    RETURN QUERY
        SELECT
            v_count <= p_max_requests,
            v_count,
            v_window_start;
END;
$$;

-- Grant execute to authenticated users (the Edge Function runs as the caller).
GRANT EXECUTE ON FUNCTION check_and_increment_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated;
