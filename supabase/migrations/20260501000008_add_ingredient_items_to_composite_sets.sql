-- Allow saved composite-cost simulations to include standalone ingredients
-- as well as recipe rows.

BEGIN;

ALTER TABLE public.recipe_composite_set_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'recipe';

ALTER TABLE public.recipe_composite_set_items
  ADD COLUMN IF NOT EXISTS ingredient_payload jsonb;

ALTER TABLE public.recipe_composite_set_items
  ALTER COLUMN recipe_id DROP NOT NULL;

UPDATE public.recipe_composite_set_items
SET item_type = 'recipe'
WHERE item_type IS NULL;

ALTER TABLE public.recipe_composite_set_items
  DROP CONSTRAINT IF EXISTS recipe_composite_set_items_item_type_check;

ALTER TABLE public.recipe_composite_set_items
  ADD CONSTRAINT recipe_composite_set_items_item_type_check
  CHECK (
    (
      item_type = 'recipe'
      AND recipe_id IS NOT NULL
    )
    OR
    (
      item_type = 'ingredient'
      AND recipe_id IS NULL
      AND ingredient_payload IS NOT NULL
      AND coalesce(trim(ingredient_payload->>'name'), '') <> ''
    )
  );

CREATE INDEX IF NOT EXISTS idx_recipe_composite_set_items_item_type
  ON public.recipe_composite_set_items (item_type);

COMMIT;
