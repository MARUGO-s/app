-- Admin RPC helpers
-- 1) List profiles without widening profiles RLS (UI needs a target account picker)
-- 2) Copy ingredient master (unit_conversions + csv_unit_overrides) to another account (one-time copy, no sync)

create or replace function public.admin_list_profiles()
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_admin boolean;
begin
  requester_id := auth.uid();
  if requester_id is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = requester_id
      and p.role = 'admin'
  ) into requester_is_admin;

  if not requester_is_admin then
    raise exception 'insufficient_privilege';
  end if;

  return query
    select p.*
    from public.profiles p
    order by p.created_at desc;
end;
$$;
grant execute on function public.admin_list_profiles() to authenticated;
create or replace function public.admin_copy_ingredient_master(
  target_profile_id uuid,
  overwrite boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_is_admin boolean;

  source_user text;
  target_user text;

  has_item_category boolean;
  has_vendor boolean;
  has_yield_percent boolean;
  csv_table_exists boolean;

  uc_source_total integer := 0;
  cu_source_total integer := 0;
  uc_existing integer := 0;
  cu_existing integer := 0;

  uc_copied integer := 0;
  cu_copied integer := 0;
  uc_updated integer := 0;
  cu_updated integer := 0;
  uc_skipped integer := 0;
  cu_skipped integer := 0;

  sql_uc text;
  sql_cu text;
begin
  requester_id := auth.uid();
  if requester_id is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = requester_id
      and p.role = 'admin'
  ) into requester_is_admin;

  if not requester_is_admin then
    raise exception 'insufficient_privilege';
  end if;

  if target_profile_id is null then
    raise exception 'target required';
  end if;
  if target_profile_id = requester_id then
    raise exception 'cannot_copy_to_self';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_profile_id) then
    raise exception 'profile_not_found';
  end if;

  source_user := requester_id::text;
  target_user := target_profile_id::text;

  -- Detect optional columns (for backward compatibility in environments where migrations are not applied yet).
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'unit_conversions'
      and c.column_name = 'item_category'
  ) into has_item_category;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'unit_conversions'
      and c.column_name = 'vendor'
  ) into has_vendor;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'unit_conversions'
      and c.column_name = 'yield_percent'
  ) into has_yield_percent;

  -- unit_conversions counts
  select count(*) into uc_source_total
  from public.unit_conversions
  where user_id = source_user;

  select count(*) into uc_existing
  from public.unit_conversions d
  join public.unit_conversions s
    on s.user_id = source_user
   and d.user_id = target_user
   and d.ingredient_name = s.ingredient_name;

  -- Copy unit_conversions with dynamic SQL (include optional columns if present)
  sql_uc := 'insert into public.unit_conversions (user_id, ingredient_name, packet_size, packet_unit, last_price';
  if has_item_category then sql_uc := sql_uc || ', item_category'; end if;
  if has_vendor then sql_uc := sql_uc || ', vendor'; end if;
  if has_yield_percent then sql_uc := sql_uc || ', yield_percent'; end if;
  sql_uc := sql_uc || ', updated_at) ' ||
           'select $1, s.ingredient_name, s.packet_size, s.packet_unit, s.last_price';
  if has_item_category then sql_uc := sql_uc || ', s.item_category'; end if;
  if has_vendor then sql_uc := sql_uc || ', s.vendor'; end if;
  if has_yield_percent then sql_uc := sql_uc || ', s.yield_percent'; end if;
  sql_uc := sql_uc || ', now() from public.unit_conversions s where s.user_id = $2 ';

  if not overwrite then
    sql_uc := sql_uc ||
      'and not exists (select 1 from public.unit_conversions d where d.user_id = $1 and d.ingredient_name = s.ingredient_name) ';
  end if;

  sql_uc := sql_uc || 'on conflict (user_id, ingredient_name) ';
  if overwrite then
    sql_uc := sql_uc ||
      'do update set packet_size = excluded.packet_size, ' ||
      'packet_unit = excluded.packet_unit, ' ||
      'last_price = excluded.last_price';
    if has_item_category then sql_uc := sql_uc || ', item_category = excluded.item_category'; end if;
    if has_vendor then sql_uc := sql_uc || ', vendor = excluded.vendor'; end if;
    if has_yield_percent then sql_uc := sql_uc || ', yield_percent = excluded.yield_percent'; end if;
    sql_uc := sql_uc || ', updated_at = excluded.updated_at';
  else
    sql_uc := sql_uc || 'do nothing';
  end if;

  execute sql_uc using target_user, source_user;
  get diagnostics uc_copied = row_count;

  if overwrite then
    uc_updated := uc_existing;
    uc_copied := greatest(uc_source_total - uc_updated, 0);
    uc_skipped := 0;
  else
    uc_updated := 0;
    uc_skipped := greatest(uc_source_total - uc_copied, 0);
  end if;

  -- csv_unit_overrides is optional table
  select to_regclass('public.csv_unit_overrides') is not null into csv_table_exists;
  if csv_table_exists then
    select count(*) into cu_source_total
    from public.csv_unit_overrides
    where user_id = source_user;

    select count(*) into cu_existing
    from public.csv_unit_overrides d
    join public.csv_unit_overrides s
      on s.user_id = source_user
     and d.user_id = target_user
     and d.ingredient_name = s.ingredient_name;

    sql_cu :=
      'insert into public.csv_unit_overrides (user_id, ingredient_name, csv_unit, updated_at) ' ||
      'select $1, s.ingredient_name, s.csv_unit, now() ' ||
      'from public.csv_unit_overrides s ' ||
      'where s.user_id = $2 ';

    if not overwrite then
      sql_cu := sql_cu ||
        'and not exists (select 1 from public.csv_unit_overrides d where d.user_id = $1 and d.ingredient_name = s.ingredient_name) ';
    end if;

    sql_cu := sql_cu || 'on conflict (user_id, ingredient_name) ';
    if overwrite then
      sql_cu := sql_cu || 'do update set csv_unit = excluded.csv_unit, updated_at = excluded.updated_at';
    else
      sql_cu := sql_cu || 'do nothing';
    end if;

    execute sql_cu using target_user, source_user;
    get diagnostics cu_copied = row_count;

    if overwrite then
      cu_updated := cu_existing;
      cu_copied := greatest(cu_source_total - cu_updated, 0);
      cu_skipped := 0;
    else
      cu_updated := 0;
      cu_skipped := greatest(cu_source_total - cu_copied, 0);
    end if;
  end if;

  return jsonb_build_object(
    'source_user_id', source_user,
    'target_user_id', target_user,
    'overwrite', overwrite,
    'unit_conversions', jsonb_build_object(
      'source_total', uc_source_total,
      'copied', uc_copied,
      'updated', uc_updated,
      'skipped', uc_skipped
    ),
    'csv_unit_overrides', jsonb_build_object(
      'source_total', cu_source_total,
      'copied', cu_copied,
      'updated', cu_updated,
      'skipped', cu_skipped
    )
  );
end;
$$;
grant execute on function public.admin_copy_ingredient_master(uuid, boolean) to authenticated;
