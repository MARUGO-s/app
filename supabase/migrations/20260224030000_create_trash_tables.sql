-- Create trash tables for bulk deletion with trash bin support

-- 1. Trash for price CSV files (stored in Storage)
CREATE TABLE IF NOT EXISTS public.trash_price_csvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  csv_content text NOT NULL,
  original_path text,
  deleted_at timestamptz DEFAULT now()
);

ALTER TABLE public.trash_price_csvs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own trash price csvs" ON public.trash_price_csvs;
DROP POLICY IF EXISTS "Users can insert own trash price csvs" ON public.trash_price_csvs;
DROP POLICY IF EXISTS "Users can delete own trash price csvs" ON public.trash_price_csvs;

CREATE POLICY "Users can read own trash price csvs"
  ON public.trash_price_csvs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trash price csvs"
  ON public.trash_price_csvs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trash price csvs"
  ON public.trash_price_csvs FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Trash for ingredient master (unit_conversions + csv_unit_overrides snapshot)
CREATE TABLE IF NOT EXISTS public.trash_ingredient_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '一括削除',
  snapshot_unit_conversions jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_csv_unit_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at timestamptz DEFAULT now()
);

ALTER TABLE public.trash_ingredient_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own trash ingredients" ON public.trash_ingredient_master;
DROP POLICY IF EXISTS "Users can insert own trash ingredients" ON public.trash_ingredient_master;
DROP POLICY IF EXISTS "Users can delete own trash ingredients" ON public.trash_ingredient_master;

CREATE POLICY "Users can read own trash ingredients"
  ON public.trash_ingredient_master FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trash ingredients"
  ON public.trash_ingredient_master FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trash ingredients"
  ON public.trash_ingredient_master FOR DELETE
  USING (auth.uid() = user_id);
