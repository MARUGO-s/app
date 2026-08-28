-- User reference box documents (per-account)
create table if not exists public.user_reference_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_reference_documents_user_updated
  on public.user_reference_documents (user_id, updated_at desc);

alter table public.user_reference_documents
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.user_reference_documents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reference_documents'
      and policyname = 'user_reference_documents_select_own'
  ) then
    create policy user_reference_documents_select_own
      on public.user_reference_documents
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reference_documents'
      and policyname = 'user_reference_documents_insert_own'
  ) then
    create policy user_reference_documents_insert_own
      on public.user_reference_documents
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reference_documents'
      and policyname = 'user_reference_documents_update_own'
  ) then
    create policy user_reference_documents_update_own
      on public.user_reference_documents
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reference_documents'
      and policyname = 'user_reference_documents_delete_own'
  ) then
    create policy user_reference_documents_delete_own
      on public.user_reference_documents
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.set_user_reference_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_user_reference_documents_updated_at on public.user_reference_documents;
create trigger trg_set_user_reference_documents_updated_at
before update on public.user_reference_documents
for each row execute function public.set_user_reference_documents_updated_at();
