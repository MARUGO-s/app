-- Fix search_ingredients RPC function to handle substring matching globally
-- This resolves issues where ingredients were not found if users searched by middle or suffix words.
-- e.g., 'バター' will now match '明治無塩バター'

CREATE OR REPLACE FUNCTION public.search_ingredients(
    search_query TEXT,
    max_results INT DEFAULT 15
)
RETURNS TABLE (
    ingredient_name TEXT,
    packet_size NUMERIC,
    packet_unit TEXT,
    last_price NUMERIC,
    source TEXT
) AS $$
BEGIN
    -- Search in unit_conversions (manual master ingredients) for current user
    -- Prioritizes exact matches, then prefix matches, then substring matches
    RETURN QUERY
    SELECT
        uc.ingredient_name,
        uc.packet_size,
        uc.packet_unit,
        uc.last_price,
        'manual'::TEXT AS source
    FROM public.unit_conversions uc
    WHERE uc.user_id::text = auth.uid()::text
    AND uc.ingredient_name ILIKE '%' || search_query || '%'
    ORDER BY
        -- Exact match priority
        CASE WHEN uc.ingredient_name = search_query THEN 0 ELSE 1 END,
        -- Prefix match priority
        CASE WHEN uc.ingredient_name ILIKE search_query || '%' THEN 0 ELSE 1 END,
        -- Then by name alphabetically
        uc.ingredient_name
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
