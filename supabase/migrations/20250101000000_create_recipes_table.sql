-- Create recipes table for Recipe Keeper app
CREATE TABLE IF NOT EXISTS recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  servings TEXT,
  ingredients JSONB DEFAULT '[]'::jsonb,
  steps JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  image_url TEXT,
  source_url TEXT,
  category TEXT,
  tags TEXT[],
  ai_generated BOOLEAN DEFAULT false,
  groq_generated BOOLEAN DEFAULT false,
  language_code TEXT DEFAULT 'ja',
  original_recipe_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipes_ai_generated ON recipes(ai_generated);

-- Enable RLS (Row Level Security)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous read access
CREATE POLICY "Allow anonymous read access" ON recipes
  FOR SELECT USING (true);

-- Create policy to allow anonymous insert
CREATE POLICY "Allow anonymous insert" ON recipes
  FOR INSERT WITH CHECK (true);

-- Create policy to allow anonymous update
CREATE POLICY "Allow anonymous update" ON recipes
  FOR UPDATE USING (true);

-- Create policy to allow anonymous delete
CREATE POLICY "Allow anonymous delete" ON recipes
  FOR DELETE USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recipes_updated_at 
  BEFORE UPDATE ON recipes 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();


