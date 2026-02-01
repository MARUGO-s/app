-- Scope inventory data per user_id (app login id)

-- 1) inventory_items
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS user_id TEXT;

UPDATE inventory_items
SET user_id = 'yoshito'
WHERE user_id IS NULL;

ALTER TABLE inventory_items
    ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_user_id ON inventory_items(user_id);

-- 2) inventory_snapshots
ALTER TABLE inventory_snapshots
    ADD COLUMN IF NOT EXISTS user_id TEXT;

UPDATE inventory_snapshots
SET user_id = 'yoshito'
WHERE user_id IS NULL;

ALTER TABLE inventory_snapshots
    ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_user_id ON inventory_snapshots(user_id);

-- 3) ignored_items (make unique per user)
ALTER TABLE ignored_items
    ADD COLUMN IF NOT EXISTS user_id TEXT;

UPDATE ignored_items
SET user_id = 'yoshito'
WHERE user_id IS NULL;

ALTER TABLE ignored_items
    ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
    -- drop old global unique constraint if present
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ignored_items_name_key'
    ) THEN
        ALTER TABLE ignored_items DROP CONSTRAINT ignored_items_name_key;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_items_user_name_unique ON ignored_items(user_id, name);
CREATE INDEX IF NOT EXISTS idx_ignored_items_user_id ON ignored_items(user_id);

-- 4) deleted_inventory_snapshots (trash)
ALTER TABLE deleted_inventory_snapshots
    ADD COLUMN IF NOT EXISTS user_id TEXT;

UPDATE deleted_inventory_snapshots
SET user_id = 'yoshito'
WHERE user_id IS NULL;

ALTER TABLE deleted_inventory_snapshots
    ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deleted_inventory_snapshots_user_id ON deleted_inventory_snapshots(user_id);

