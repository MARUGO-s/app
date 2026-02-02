-- Create high-performance ingredient search RPC function
-- This function enables fast database-level search for ingredients
-- instead of loading all data into memory

CREATE OR REPLACE FUNCTION search_ingredients(
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
    -- Prioritizes exact matches and prefix matches
    RETURN QUERY
    SELECT
        uc.ingredient_name,
        uc.packet_size,
        uc.packet_unit,
        uc.last_price,
        'manual'::TEXT AS source
    FROM unit_conversions uc
    WHERE uc.user_id = auth.uid()
    AND uc.ingredient_name ILIKE search_query || '%'
    ORDER BY
        -- Exact match priority
        CASE WHEN uc.ingredient_name = search_query THEN 0 ELSE 1 END,
        -- Then by name alphabetically
        uc.ingredient_name
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION search_ingredients(TEXT, INT) TO authenticated;
