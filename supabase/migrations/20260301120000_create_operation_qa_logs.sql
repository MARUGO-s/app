-- Operation Assistant: Q&A conversation logs
create table if not exists public.operation_qa_logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    user_email text,
    user_role text,
    current_view text,
    answer_mode text,
    question text not null,
    answer text not null,
    ai_used boolean not null default false,
    ai_attempted boolean not null default false,
    answer_source text not null default 'local',
    ai_model text,
    ai_status text,
    input_tokens integer,
    output_tokens integer,
    estimated_cost_jpy numeric(12, 6),
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_operation_qa_logs_created_at
    on public.operation_qa_logs (created_at desc);

create index if not exists idx_operation_qa_logs_user_created
    on public.operation_qa_logs (user_id, created_at desc);

create index if not exists idx_operation_qa_logs_ai_used_created
    on public.operation_qa_logs (ai_used, created_at desc);

alter table public.operation_qa_logs enable row level security;

drop policy if exists "Operation QA logs: insert own" on public.operation_qa_logs;
create policy "Operation QA logs: insert own"
    on public.operation_qa_logs
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Operation QA logs: admin can read all" on public.operation_qa_logs;
create policy "Operation QA logs: admin can read all"
    on public.operation_qa_logs
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
