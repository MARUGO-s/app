-- Create deleted_inventory_snapshots table (trash for inventory snapshots)
CREATE TABLE IF NOT EXISTS deleted_inventory_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    original_id UUID NOT NULL,
    title TEXT NOT NULL,
    items JSONB NOT NULL,
    total_value NUMERIC DEFAULT 0,
    snapshot_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
-- RLS
ALTER TABLE deleted_inventory_snapshots ENABLE ROW LEVEL SECURITY;
-- Allow anonymous users (same policy style as inventory tables)
DROP POLICY IF EXISTS "Allow anonymous access to deleted_inventory_snapshots" ON deleted_inventory_snapshots;
CREATE POLICY "Allow anonymous access to deleted_inventory_snapshots" ON deleted_inventory_snapshots
    FOR ALL USING (true) WITH CHECK (true);
-- Indices
CREATE INDEX IF NOT EXISTS idx_deleted_inventory_snapshots_deleted_at ON deleted_inventory_snapshots(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_inventory_snapshots_snapshot_date ON deleted_inventory_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_inventory_snapshots_original_id ON deleted_inventory_snapshots(original_id);
