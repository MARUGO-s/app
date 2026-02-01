-- Create table for storing monthly inventory snapshots
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL, -- e.g. "2026年2月"
  snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_value NUMERIC DEFAULT 0,
  items JSONB NOT NULL, -- The entire array of items with quantities and prices at that moment
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Policy to allow anonymous access (since we are in simplified auth mode)
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON inventory_snapshots FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON inventory_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON inventory_snapshots FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON inventory_snapshots FOR DELETE USING (true);
