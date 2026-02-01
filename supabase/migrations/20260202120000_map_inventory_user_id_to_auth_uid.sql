-- Map legacy inventory user_id (display_id like 'yoshito') to Supabase Auth uid (profiles.id)
-- This allows existing inventory/snapshots to be visible after switching to Supabase Auth.

-- inventory_items
UPDATE inventory_items i
SET user_id = p.id::text
FROM profiles p
WHERE i.user_id = p.display_id;

-- inventory_snapshots
UPDATE inventory_snapshots s
SET user_id = p.id::text
FROM profiles p
WHERE s.user_id = p.display_id;

-- ignored_items
UPDATE ignored_items ig
SET user_id = p.id::text
FROM profiles p
WHERE ig.user_id = p.display_id;

-- deleted_inventory_snapshots
UPDATE deleted_inventory_snapshots ds
SET user_id = p.id::text
FROM profiles p
WHERE ds.user_id = p.display_id;

-- unit_conversions (ingredient master)
UPDATE unit_conversions uc
SET user_id = p.id::text
FROM profiles p
WHERE uc.user_id = p.display_id;

