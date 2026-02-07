-- Map legacy inventory user_id (display_id like 'yoshito') to Supabase Auth uid (profiles.id)
-- This allows existing inventory/snapshots to be visible after switching to Supabase Auth.

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    return;
  end if;

  -- inventory_items
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_items'
      and column_name = 'user_id'
  ) then
    update inventory_items i
    set user_id = p.id::text
    from profiles p
    where i.user_id = p.display_id;
  end if;

  -- inventory_snapshots
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_snapshots'
      and column_name = 'user_id'
  ) then
    update inventory_snapshots s
    set user_id = p.id::text
    from profiles p
    where s.user_id = p.display_id;
  end if;

  -- ignored_items
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ignored_items'
      and column_name = 'user_id'
  ) then
    update ignored_items ig
    set user_id = p.id::text
    from profiles p
    where ig.user_id = p.display_id;
  end if;

  -- deleted_inventory_snapshots
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deleted_inventory_snapshots'
      and column_name = 'user_id'
  ) then
    update deleted_inventory_snapshots ds
    set user_id = p.id::text
    from profiles p
    where ds.user_id = p.display_id;
  end if;

  -- unit_conversions (ingredient master)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'unit_conversions'
      and column_name = 'user_id'
  ) then
    update unit_conversions uc
    set user_id = p.id::text
    from profiles p
    where uc.user_id = p.display_id;
  end if;
end $$;
