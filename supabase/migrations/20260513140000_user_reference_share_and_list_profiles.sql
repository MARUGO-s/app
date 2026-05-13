-- 資料箱: 一般ユーザーも自分の資料を他ユーザーへ共有できるようにする
-- 1) 共有先一覧（自分以外の全プロフィール）— profiles の RLS を広げずに取得
-- 2) 共有実行 — 呼び出し元が所有する行の添付のみを相手 user_id の行として挿入（SECURITY DEFINER）

create or replace function public.list_profiles_for_reference_share()
returns table (
  id uuid,
  display_id text,
  email text,
  store_name text,
  role text,
  show_master_recipes boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    p.id,
    p.display_id,
    p.email,
    p.store_name,
    p.role,
    p.show_master_recipes,
    p.created_at,
    p.updated_at
  from public.profiles p
  where p.id <> auth.uid()
  order by p.display_id asc nulls last, p.created_at desc;
end;
$$;

grant execute on function public.list_profiles_for_reference_share() to authenticated;


create or replace function public.user_share_reference_documents(
  p_target_user_ids uuid[],
  p_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inserted bigint := 0;
  it jsonb;
  item_doc_id uuid;
  item_att_id text;
  item_title text;
  src public.user_reference_documents%rowtype;
  v_att jsonb;
  v_copy jsonb;
  v_title text;
  t_uid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_target_user_ids is null or cardinality(p_target_user_ids) = 0 then
    raise exception 'targets required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required';
  end if;

  foreach t_uid in array p_target_user_ids
  loop
    if t_uid is null then
      raise exception 'invalid_target_user';
    end if;
    if t_uid = uid then
      raise exception 'cannot_share_to_self';
    end if;
    if not exists (select 1 from auth.users au where au.id = t_uid) then
      raise exception 'invalid_target_user';
    end if;
  end loop;

  for it in
    select arr.el from jsonb_array_elements(p_items) as arr(el)
  loop
    begin
      item_doc_id := (it->>'document_id')::uuid;
    exception when others then
      raise exception 'invalid_document_id';
    end;

    item_att_id := nullif(trim(it->>'attachment_id'), '');
    if item_doc_id is null or coalesce(item_att_id, '') = '' then
      raise exception 'invalid_item';
    end if;

    item_title := nullif(trim(it->>'title'), '');

    select * into src
    from public.user_reference_documents
    where id = item_doc_id
      and user_id = uid;

    if not found then
      raise exception 'document_not_found_or_forbidden';
    end if;

    select att.el into v_att
    from jsonb_array_elements(coalesce(src.attachments, '[]'::jsonb)) as att(el)
    where coalesce(att.el->>'id', '') = item_att_id
    limit 1;

    if v_att is null then
      raise exception 'attachment_not_found';
    end if;

    v_copy := jsonb_set(
      jsonb_set(
        v_att,
        '{id}',
        to_jsonb(gen_random_uuid()::text),
        true
      ),
      '{addedAt}',
      to_jsonb(to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      true
    );

    v_title := coalesce(
      item_title,
      nullif(trim(v_att->>'name'), ''),
      nullif(trim(src.title), ''),
      '共有ファイル'
    );

    foreach t_uid in array p_target_user_ids
    loop
      if t_uid is null or t_uid = uid then
        continue;
      end if;

      insert into public.user_reference_documents (user_id, title, body, attachments)
      values (
        t_uid,
        left(v_title, 2000),
        coalesce(src.body, ''),
        jsonb_build_array(v_copy)
      );

      inserted := inserted + 1;
    end loop;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.user_share_reference_documents(uuid[], jsonb) to authenticated;
