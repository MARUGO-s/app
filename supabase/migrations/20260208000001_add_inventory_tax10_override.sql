-- Allow overriding auto tax rule (8%/10%) per inventory item.
-- When tax10_override is false, UI may apply item_category-based tax (8%/10%) automatically.
-- When true, UI uses inventory_items.tax10 as the effective tax rate.

alter table public.inventory_items
  add column if not exists tax10_override boolean default false;
