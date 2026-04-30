-- Add yield_percent (歩留まり/可食率) to unit_conversions (材料マスター)
-- Used to calculate recipe cost for edible portion: edible cost = purchase cost / (yield_percent/100).

alter table public.unit_conversions
  add column if not exists yield_percent numeric;
update public.unit_conversions
set yield_percent = 100
where yield_percent is null;
alter table public.unit_conversions
  alter column yield_percent set default 100;
alter table public.unit_conversions
  alter column yield_percent set not null;
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'unit_conversions_yield_percent_check'
  ) then
    alter table public.unit_conversions
      drop constraint unit_conversions_yield_percent_check;
  end if;
end $$;
alter table public.unit_conversions
  add constraint unit_conversions_yield_percent_check
  check (yield_percent > 0 and yield_percent <= 100);
