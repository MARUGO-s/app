-- Check and display current table structure
-- This is a safe migration that only queries existing structure

DO $$
DECLARE
    column_info RECORD;
BEGIN
    -- Display current columns in recipes table
    RAISE NOTICE 'Current columns in recipes table:';
    
    FOR column_info IN 
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'recipes' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
    LOOP
        RAISE NOTICE 'Column: %, Type: %, Nullable: %, Default: %', 
            column_info.column_name, 
            column_info.data_type, 
            column_info.is_nullable, 
            column_info.column_default;
    END LOOP;
    
    -- Check if table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipes' AND table_schema = 'public') THEN
        RAISE NOTICE 'recipes table does not exist!';
    END IF;
END $$;


