-- Dedupe inventory rows that share the same logical key per user.
-- Key: user_id + trimmed name + trimmed vendor (empty/null vendor treated as same).
-- Keep the latest row by updated_at/created_at/id.

-- 1) Normalize textual key fields first.
update public.inventory_items
set
  name = btrim(name),
  vendor = nullif(btrim(vendor), '')
where
  name <> btrim(name)
  or coalesce(vendor, '') <> coalesce(nullif(btrim(vendor), ''), '');

-- 2) Remove duplicates and keep only the latest row in each key group.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        btrim(name),
        coalesce(nullif(btrim(vendor), ''), '')
      order by
        coalesce(updated_at, created_at, now()) desc,
        created_at desc,
        id desc
    ) as rn
  from public.inventory_items
)
delete from public.inventory_items i
using ranked r
where i.id = r.id
  and r.rn > 1;

-- 3) Prevent future duplicates for the same logical key.
create unique index if not exists idx_inventory_items_user_name_vendor_unique_norm
on public.inventory_items (
  user_id,
  btrim(name),
  coalesce(nullif(btrim(vendor), ''), '')
);
