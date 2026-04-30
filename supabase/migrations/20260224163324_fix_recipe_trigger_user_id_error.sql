-- Fix for trigger_update_profile_on_recipe_change
-- The previous version attempted to use NEW.user_id which does not exist on the recipes table.
-- We now extract the owner ID from the tags array.

CREATE OR REPLACE FUNCTION public.update_profile_on_recipe_change()
RETURNS trigger AS $$
DECLARE
  v_owner_id text;
BEGIN
  -- Extract owner ID from tags array (e.g. 'owner:uuid')
  SELECT substring(t from '^owner:(.*)$')
  INTO v_owner_id
  FROM unnest(NEW.tags) AS t
  WHERE t LIKE 'owner:%'
  LIMIT 1;

  -- If found, update the author's profile 'updated_at'
  IF v_owner_id IS NOT NULL THEN
    UPDATE public.profiles
    SET updated_at = NOW()
    WHERE id::text = v_owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Re-apply trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trigger_update_profile_on_recipe_change ON public.recipes;
CREATE TRIGGER trigger_update_profile_on_recipe_change
  AFTER INSERT OR UPDATE
  ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_on_recipe_change();
