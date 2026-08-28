-- User requests: feature requests and bug reports
create table if not exists public.user_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    user_email text,
    user_role text,
    request_type text not null default 'feature',
    status text not null default 'open',
    title text not null,
    description text not null,
    current_view text,
    page_path text,
    metadata jsonb not null default '{}'::jsonb,
    constraint user_requests_request_type_check
        check (request_type in ('feature', 'bug', 'improvement', 'other')),
    constraint user_requests_status_check
        check (status in ('open', 'reviewing', 'planned', 'resolved', 'closed')),
    constraint user_requests_title_check
        check (char_length(title) between 1 and 200),
    constraint user_requests_description_check
        check (char_length(description) between 1 and 20000)
);

create index if not exists idx_user_requests_created_at
    on public.user_requests (created_at desc);

create index if not exists idx_user_requests_user_created
    on public.user_requests (user_id, created_at desc);

create index if not exists idx_user_requests_type_status_created
    on public.user_requests (request_type, status, created_at desc);

alter table public.user_requests enable row level security;

drop policy if exists "User requests: insert own" on public.user_requests;
create policy "User requests: insert own"
    on public.user_requests
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "User requests: select own" on public.user_requests;
create policy "User requests: select own"
    on public.user_requests
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "User requests: admin can read all" on public.user_requests;
create policy "User requests: admin can read all"
    on public.user_requests
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

drop policy if exists "User requests: admin can update all" on public.user_requests;
create policy "User requests: admin can update all"
    on public.user_requests
    for update
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role = 'admin'
        )
    )
    with check (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role = 'admin'
        )
    );
