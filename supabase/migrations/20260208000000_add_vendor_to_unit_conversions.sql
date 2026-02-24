-- Add vendor (supplier) field to unit_conversions (材料マスター)
-- This allows users to store a preferred vendor even when CSV vendor is missing/unstable.

alter table public.unit_conversions
  add column if not exists vendor text;
