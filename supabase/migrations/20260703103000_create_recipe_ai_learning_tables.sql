create extension if not exists pg_trgm with schema public;

create table if not exists public.recipe_ai_runs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    base_recipe_id bigint references public.recipes(id) on delete set null,
    mode_family text not null,
    run_kind text not null,
    provider text not null default 'groq',
    title text,
    question text,
    recipe_snapshot jsonb not null default '{}'::jsonb,
    proposal_snapshot jsonb not null default '{}'::jsonb,
    answer text,
    agent_messages jsonb not null default '[]'::jsonb,
    sources jsonb not null default '[]'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    constraint recipe_ai_runs_mode_family_check
        check (mode_family in ('product', 'improvement')),
    constraint recipe_ai_runs_run_kind_check
        check (run_kind in ('generate', 'conversation'))
);

create index if not exists idx_recipe_ai_runs_user_created
    on public.recipe_ai_runs (user_id, created_at desc);

create index if not exists idx_recipe_ai_runs_user_mode_kind_created
    on public.recipe_ai_runs (user_id, mode_family, run_kind, created_at desc);

alter table public.recipe_ai_runs enable row level security;

drop policy if exists "Recipe AI runs: insert own" on public.recipe_ai_runs;
create policy "Recipe AI runs: insert own"
    on public.recipe_ai_runs
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Recipe AI runs: select own" on public.recipe_ai_runs;
create policy "Recipe AI runs: select own"
    on public.recipe_ai_runs
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Recipe AI runs: admin can read all" on public.recipe_ai_runs;
create policy "Recipe AI runs: admin can read all"
    on public.recipe_ai_runs
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role = 'admin'
        )
    );

create table if not exists public.recipe_ai_memories (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    source_run_id uuid references public.recipe_ai_runs(id) on delete set null,
    recipe_id bigint references public.recipes(id) on delete set null,
    mode_family text not null,
    memory_type text not null default 'accepted_proposal',
    title text not null,
    summary text not null default '',
    retrieval_text text not null default '',
    tags text[] not null default '{}'::text[],
    proposal_snapshot jsonb not null default '{}'::jsonb,
    final_recipe_snapshot jsonb not null default '{}'::jsonb,
    feedback_snapshot jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    constraint recipe_ai_memories_mode_family_check
        check (mode_family in ('product', 'improvement')),
    constraint recipe_ai_memories_memory_type_check
        check (memory_type in ('accepted_proposal', 'edited_after_ai', 'feedback'))
);

create index if not exists idx_recipe_ai_memories_user_updated
    on public.recipe_ai_memories (user_id, updated_at desc);

create index if not exists idx_recipe_ai_memories_user_mode_updated
    on public.recipe_ai_memories (user_id, mode_family, updated_at desc);

create index if not exists idx_recipe_ai_memories_tags_gin
    on public.recipe_ai_memories using gin (tags);

create index if not exists idx_recipe_ai_memories_retrieval_trgm
    on public.recipe_ai_memories using gin (retrieval_text gin_trgm_ops);

alter table public.recipe_ai_memories enable row level security;

drop policy if exists "Recipe AI memories: insert own" on public.recipe_ai_memories;
create policy "Recipe AI memories: insert own"
    on public.recipe_ai_memories
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Recipe AI memories: select own" on public.recipe_ai_memories;
create policy "Recipe AI memories: select own"
    on public.recipe_ai_memories
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Recipe AI memories: update own" on public.recipe_ai_memories;
create policy "Recipe AI memories: update own"
    on public.recipe_ai_memories
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Recipe AI memories: admin can read all" on public.recipe_ai_memories;
create policy "Recipe AI memories: admin can read all"
    on public.recipe_ai_memories
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role = 'admin'
        )
    );

create or replace function public.set_recipe_ai_memories_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_recipe_ai_memories_updated_at on public.recipe_ai_memories;
create trigger trg_recipe_ai_memories_updated_at
before update on public.recipe_ai_memories
for each row
execute function public.set_recipe_ai_memories_updated_at();

create or replace function public.search_recipe_ai_memories(
    p_query text,
    p_mode_family text default null,
    p_limit integer default 5
)
returns table (
    id uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    title text,
    summary text,
    retrieval_text text,
    mode_family text,
    memory_type text,
    tags text[],
    relevance real,
    proposal_snapshot jsonb,
    final_recipe_snapshot jsonb,
    feedback_snapshot jsonb,
    metadata jsonb
)
language sql
stable
as $$
    with scoped as (
        select
            m.*,
            greatest(
                similarity(lower(coalesce(m.retrieval_text, '')), lower(coalesce(p_query, ''))),
                similarity(lower(coalesce(m.title, '')), lower(coalesce(p_query, '')))
            ) as sim
        from public.recipe_ai_memories m
        where m.user_id = auth.uid()
          and (p_mode_family is null or m.mode_family = p_mode_family)
    )
    select
        s.id,
        s.created_at,
        s.updated_at,
        s.title,
        s.summary,
        s.retrieval_text,
        s.mode_family,
        s.memory_type,
        s.tags,
        s.sim as relevance,
        s.proposal_snapshot,
        s.final_recipe_snapshot,
        s.feedback_snapshot,
        s.metadata
    from scoped s
    where
        coalesce(trim(p_query), '') = ''
        or s.sim >= 0.04
        or lower(coalesce(s.retrieval_text, '')) like '%' || lower(trim(coalesce(p_query, ''))) || '%'
        or lower(coalesce(s.title, '')) like '%' || lower(trim(coalesce(p_query, ''))) || '%'
    order by
        case when coalesce(trim(p_query), '') = '' then 0 else 1 end desc,
        s.sim desc,
        s.updated_at desc
    limit greatest(coalesce(p_limit, 5), 1);
$$;
