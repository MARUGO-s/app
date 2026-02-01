-- Fix RLS policies for unit_conversions table
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.unit_conversions;
DROP POLICY IF EXISTS "Enable insert for all authenticated users" ON public.unit_conversions;
DROP POLICY IF EXISTS "Enable update for all authenticated users" ON public.unit_conversions;

CREATE POLICY "Enable read access for all users"
  ON public.unit_conversions FOR SELECT
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON public.unit_conversions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON public.unit_conversions FOR UPDATE
  USING (true);

CREATE POLICY "Enable delete for all users"
  ON public.unit_conversions FOR DELETE
  USING (true);
