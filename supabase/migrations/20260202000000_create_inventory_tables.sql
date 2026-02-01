-- Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'g',
    category TEXT,
    threshold NUMERIC DEFAULT 0,
    vendor TEXT,
    price NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create inventory_snapshots table for storing historical inventory data
CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    items JSONB NOT NULL,
    total_value NUMERIC DEFAULT 0,
    snapshot_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ignored_items table for items to be excluded from inventory
CREATE TABLE IF NOT EXISTS ignored_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for anonymous access
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ignored_items ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to manage inventory
CREATE POLICY "Allow anonymous access to inventory_items" ON inventory_items
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to inventory_snapshots" ON inventory_snapshots
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to ignored_items" ON ignored_items
    FOR ALL USING (true) WITH CHECK (true);

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_vendor ON inventory_items(vendor);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_date ON inventory_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ignored_items_name ON ignored_items(name);
