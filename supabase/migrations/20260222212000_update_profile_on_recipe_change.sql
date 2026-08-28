-- Migration describing updating profile updated_at when a recipe changes
-- Create a trigger function to update the author's profile
CREATE OR REPLACE FUNCTION public.update_profile_on_recipe_change()
RETURNS trigger AS $$
BEGIN
  -- When a recipe is inserted or updated, update the author's profile 'updated_at'
  UPDATE public.profiles
  SET updated_at = NOW()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Drop trigger if it already exists to be safe
DROP TRIGGER IF EXISTS trigger_update_profile_on_recipe_change ON public.recipes;
-- Create the trigger on the recipes table
CREATE TRIGGER trigger_update_profile_on_recipe_change
  AFTER INSERT OR UPDATE
  ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_on_recipe_change();
-- Note: We are relying on NEW.user_id which is the author of the recipe.;
