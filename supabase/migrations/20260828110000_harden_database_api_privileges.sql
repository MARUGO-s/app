-- Make API table privileges explicit and remove PostgreSQL privileges that
-- bypass or sit outside row-level security (TRUNCATE/TRIGGER/REFERENCES).

begin;

-- This legacy table is not used by the current client. Treat it as an
-- administrator-maintained global master instead of a shared user-writable
-- table.
drop policy if exists material_costs_select_authenticated
  on public.material_costs;
drop policy if exists material_costs_insert_authenticated
  on public.material_costs;
drop policy if exists material_costs_update_authenticated
  on public.material_costs;
drop policy if exists material_costs_delete_authenticated
  on public.material_costs;
drop policy if exists material_costs_admin_all
  on public.material_costs;

create policy material_costs_admin_all
  on public.material_costs
  for all
  to authenticated
  using (public.is_admin_safe())
  with check (public.is_admin_safe());

-- Cost overrides are visible only when the parent recipe is visible. This
-- prevents private recipe cost data leaking through a separately queried
-- child table.
drop policy if exists recipe_category_cost_overrides_select_authenticated
  on public.recipe_category_cost_overrides;
create policy recipe_category_cost_overrides_select_visible_recipe
  on public.recipe_category_cost_overrides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_category_cost_overrides.recipe_id
        and public.can_read_recipe_tags(r.tags)
    )
  );

-- Rebuild API grants from the RLS policies. Profiles is handled separately so
-- its column-level INSERT restriction cannot be widened accidentally.
do $$
declare
  table_record record;
  privilege_record record;
begin
  for table_record in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated, service_role',
      table_record.table_name
    );
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      table_record.table_name
    );
  end loop;

  for privilege_record in
    select
      p.tablename,
      bool_or(p.cmd in ('SELECT', 'ALL')) as can_select,
      bool_or(p.cmd in ('INSERT', 'ALL')) as can_insert,
      bool_or(p.cmd in ('UPDATE', 'ALL')) as can_update,
      bool_or(p.cmd in ('DELETE', 'ALL')) as can_delete
    from pg_policies p
    where p.schemaname = 'public'
      and p.roles && array['authenticated', 'public']::name[]
    group by p.tablename
  loop
    if privilege_record.can_select then
      execute format(
        'grant select on table public.%I to authenticated',
        privilege_record.tablename
      );
    end if;
    if privilege_record.can_insert
       and privilege_record.tablename <> 'profiles' then
      execute format(
        'grant insert on table public.%I to authenticated',
        privilege_record.tablename
      );
    end if;
    if privilege_record.can_update then
      execute format(
        'grant update on table public.%I to authenticated',
        privilege_record.tablename
      );
    end if;
    if privilege_record.can_delete then
      execute format(
        'grant delete on table public.%I to authenticated',
        privilege_record.tablename
      );
    end if;
  end loop;
end
$$;

grant select on table public.profiles to authenticated;
grant insert (id, display_id, email, store_name)
  on table public.profiles to authenticated;

revoke all privileges on all sequences in schema public
  from anon, authenticated, service_role;
grant usage on all sequences in schema public to authenticated;
grant usage, select, update on all sequences in schema public to service_role;

-- Maintenance and trigger helpers are not public RPCs.
revoke execute on function public.cleanup_old_api_usage_logs()
  from public, anon, authenticated;
revoke execute on function public.cleanup_old_rate_limits()
  from public, anon, authenticated;
revoke execute on function public.set_recipe_ai_memories_updated_at()
  from public, anon, authenticated;
revoke execute on function public.set_user_reference_documents_updated_at()
  from public, anon, authenticated;
revoke execute on function public.update_updated_at_column()
  from public, anon, authenticated;
grant execute on function public.cleanup_old_api_usage_logs() to service_role;
grant execute on function public.cleanup_old_rate_limits() to service_role;

-- Bound a SECURITY DEFINER search helper so a caller cannot request an
-- unbounded result set.
create or replace function public.search_ingredients(
  search_query text,
  max_results integer default 15
)
returns table(
  ingredient_name text,
  packet_size numeric,
  packet_unit text,
  last_price numeric,
  source text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if search_query is null or char_length(search_query) > 200 then
    raise exception 'invalid_search_query' using errcode = '22023';
  end if;

  return query
  select
    uc.ingredient_name,
    uc.packet_size,
    uc.packet_unit,
    uc.last_price,
    'manual'::text as source
  from public.unit_conversions uc
  where uc.user_id::text = auth.uid()::text
    and uc.ingredient_name ilike '%' || search_query || '%'
  order by
    case when uc.ingredient_name = search_query then 0 else 1 end,
    case when uc.ingredient_name ilike search_query || '%' then 0 else 1 end,
    uc.ingredient_name
  limit least(greatest(coalesce(max_results, 15), 1), 100);
end;
$$;

revoke execute on function public.search_ingredients(text, integer)
  from public, anon;
grant execute on function public.search_ingredients(text, integer)
  to authenticated;

-- Share only an attachment that actually belongs to the caller's document,
-- and cap fan-out per call.
create or replace function public.set_reference_attachment_shares(
  p_document_id uuid,
  p_attachment_id text,
  p_viewer_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_att_id text := btrim(coalesce(p_attachment_id, ''));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if cardinality(coalesce(p_viewer_user_ids, array[]::uuid[])) > 100 then
    raise exception 'too_many_viewers' using errcode = '22023';
  end if;
  if v_att_id = '' or char_length(v_att_id) > 200 then
    raise exception 'invalid_attachment_id' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.user_reference_documents d
    cross join lateral jsonb_array_elements(
      coalesce(d.attachments, '[]'::jsonb)
    ) attachment(value)
    where d.id = p_document_id
      and d.user_id = auth.uid()
      and coalesce(attachment.value ->> 'id', '') = v_att_id
  ) then
    raise exception 'attachment_not_found_or_forbidden' using errcode = '42501';
  end if;

  delete from public.reference_attachment_shares s
  where s.document_id = p_document_id
    and s.attachment_id = v_att_id
    and s.owner_user_id = auth.uid();

  insert into public.reference_attachment_shares (
    document_id,
    attachment_id,
    owner_user_id,
    viewer_user_id
  )
  select p_document_id, v_att_id, auth.uid(), viewer_id
  from unnest(coalesce(p_viewer_user_ids, array[]::uuid[])) viewer(viewer_id)
  where viewer_id is not null
    and viewer_id <> auth.uid()
    and exists (
      select 1 from auth.users au where au.id = viewer_id
    )
  on conflict (document_id, attachment_id, viewer_user_id) do nothing;
end;
$$;

revoke execute on function public.set_reference_attachment_shares(uuid, text, uuid[])
  from public, anon;
grant execute on function public.set_reference_attachment_shares(uuid, text, uuid[])
  to authenticated;

notify pgrst, 'reload schema';

commit;
