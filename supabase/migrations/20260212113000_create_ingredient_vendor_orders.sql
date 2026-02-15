-- Persist user-specific vendor sort order for Ingredient Master filter UI

create table if not exists public.ingredient_vendor_orders (
  user_id text not null,
  vendor_name text not null,
  sort_order integer not null default 0,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  constraint ingredient_vendor_orders_pkey primary key (user_id, vendor_name)
);

create index if not exists idx_ingredient_vendor_orders_user_sort
  on public.ingredient_vendor_orders(user_id, sort_order, vendor_name);

alter table public.ingredient_vendor_orders enable row level security;

drop policy if exists ingredient_vendor_orders_select_own_or_admin on public.ingredient_vendor_orders;
create policy ingredient_vendor_orders_select_own_or_admin
  on public.ingredient_vendor_orders
  for select
  using (user_id = auth.uid()::text or public.is_admin());

drop policy if exists ingredient_vendor_orders_insert_own_or_admin on public.ingredient_vendor_orders;
create policy ingredient_vendor_orders_insert_own_or_admin
  on public.ingredient_vendor_orders
  for insert
  with check (user_id = auth.uid()::text or public.is_admin());

drop policy if exists ingredient_vendor_orders_update_own_or_admin on public.ingredient_vendor_orders;
create policy ingredient_vendor_orders_update_own_or_admin
  on public.ingredient_vendor_orders
  for update
  using (user_id = auth.uid()::text or public.is_admin())
  with check (user_id = auth.uid()::text or public.is_admin());

drop policy if exists ingredient_vendor_orders_delete_own_or_admin on public.ingredient_vendor_orders;
create policy ingredient_vendor_orders_delete_own_or_admin
  on public.ingredient_vendor_orders
  for delete
  using (user_id = auth.uid()::text or public.is_admin());

