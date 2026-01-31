DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_ingredients' AND table_schema = 'public') THEN
        ALTER TABLE recipe_ingredients
        ALTER COLUMN quantity TYPE TEXT;
    ELSE
        RAISE NOTICE 'recipe_ingredients table does not exist yet, skipping this migration';
    END IF;
END $$;