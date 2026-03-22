-- Insert missing profiles for all existing auth users
-- appending a random string to display_id if it already exists to avoid unique constraint violations
INSERT INTO public.profiles (id, display_id, email, role, show_master_recipes)
SELECT 
    id,
    COALESCE(
        raw_user_meta_data->>'display_id', 
        SPLIT_PART(email, '@', 1), 
        SUBSTRING(id::text FROM 1 FOR 8)
    ) || '_' || SUBSTRING(id::text FROM 1 FOR 4) as display_id,
    email,
    'user' as role,
    false as show_master_recipes
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
