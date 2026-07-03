alter table public.deleted_recipes
  add column if not exists course text,
  add column if not exists category text,
  add column if not exists country text,
  add column if not exists store_name text,
  add column if not exists source_url text;
