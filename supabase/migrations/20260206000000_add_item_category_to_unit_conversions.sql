alter table public.unit_conversions
  add column if not exists item_category text;

update public.unit_conversions
set item_category = 'food'
where item_category is null
   or btrim(item_category) = ''
   or item_category = 'food_alcohol';

alter table public.unit_conversions
  alter column item_category set default 'food';

alter table public.unit_conversions
  alter column item_category set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'unit_conversions_item_category_check'
  ) then
    alter table public.unit_conversions
      drop constraint unit_conversions_item_category_check;
  end if;
end $$;

alter table public.unit_conversions
  add constraint unit_conversions_item_category_check
  check (item_category in ('food', 'alcohol', 'soft_drink', 'supplies'));

create index if not exists idx_unit_conversions_user_item_category
  on public.unit_conversions(user_id, item_category);
