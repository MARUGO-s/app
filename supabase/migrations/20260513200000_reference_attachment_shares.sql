-- 資料箱: ファイルの「コピー共有」ではなく、元データ＋共有先（参照権限）のみを保持する（レシピのタグ共有に近いモデル）

create table if not exists public.reference_attachment_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.user_reference_documents(id) on delete cascade,
  attachment_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reference_attachment_shares_unique unique (document_id, attachment_id, viewer_user_id)
);

create index if not exists idx_ref_att_shares_owner_doc
  on public.reference_attachment_shares (owner_user_id, document_id);
create index if not exists idx_ref_att_shares_viewer
  on public.reference_attachment_shares (viewer_user_id);

alter table public.reference_attachment_shares enable row level security;
-- ポリシーなし: authenticated からの直接 SELECT/INSERT は不可。RPC (SECURITY DEFINER) のみで操作。

create or replace function public.set_reference_attachment_shares(
  p_document_id uuid,
  p_attachment_id text,
  p_viewer_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att_id text := btrim(coalesce(p_attachment_id, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_reference_documents d
    where d.id = p_document_id
      and d.user_id = auth.uid()
  ) then
    raise exception 'document_not_found_or_forbidden';
  end if;

  if v_att_id = '' then
    raise exception 'attachment_id_required';
  end if;

  delete from public.reference_attachment_shares s
  where s.document_id = p_document_id
    and s.attachment_id = v_att_id
    and s.owner_user_id = auth.uid();

  insert into public.reference_attachment_shares (document_id, attachment_id, owner_user_id, viewer_user_id)
  select p_document_id, v_att_id, auth.uid(), v
  from unnest(coalesce(p_viewer_user_ids, array[]::uuid[])) as u(v)
  where v is not null
    and v <> auth.uid()
    and exists (select 1 from auth.users au where au.id = v)
  on conflict (document_id, attachment_id, viewer_user_id) do nothing;
end;
$$;

grant execute on function public.set_reference_attachment_shares(uuid, text, uuid[]) to authenticated;


create or replace function public.list_reference_shares_owned()
returns table (
  document_id uuid,
  attachment_id text,
  viewer_user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select s.document_id, s.attachment_id, s.viewer_user_id
  from public.reference_attachment_shares s
  where s.owner_user_id = auth.uid();
$$;

grant execute on function public.list_reference_shares_owned() to authenticated;


create or replace function public.list_shared_reference_attachments_for_viewer()
returns table (
  owner_user_id uuid,
  document_id uuid,
  attachment_id text,
  attachment jsonb,
  document_title text,
  shared_at timestamptz
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
    s.owner_user_id,
    s.document_id,
    s.attachment_id,
    att.elem as attachment,
    d.title as document_title,
    s.created_at as shared_at
  from public.reference_attachment_shares s
  join public.user_reference_documents d
    on d.id = s.document_id
   and d.user_id = s.owner_user_id
  cross join lateral (
    select t.x as elem
    from jsonb_array_elements(coalesce(d.attachments, '[]'::jsonb)) as t(x)
    where coalesce(t.x->>'id', '') = s.attachment_id
    limit 1
  ) att
  where s.viewer_user_id = auth.uid();
end;
$$;

grant execute on function public.list_shared_reference_attachments_for_viewer() to authenticated;

-- 旧「相手の user_reference_documents へコピー挿入」方式は廃止（共有は reference_attachment_shares のみ）
drop function if exists public.user_share_reference_documents(uuid[], jsonb);
