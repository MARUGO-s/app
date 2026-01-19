-- Add order_index column to recipes table
ALTER TABLE recipes ADD COLUMN order_index bigint;

-- Create an index for performance
CREATE INDEX idx_recipes_order_index ON recipes (order_index);

-- Optional: Initial population (order by created_at desc initially or similar)
-- But effectively new items will be added. We can leave it null or auto-update.
-- Let's just default to a large number or 0? 
-- Better to just leave it nullable. Apps should handle nulls (e.g. treat as 0 or max).
