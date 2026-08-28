-- Track per-admin last seen timestamp for user requests
create table if not exists public.user_request_view_states (
    user_id uuid primary key references auth.users(id) on delete cascade,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

alter table public.user_request_view_states enable row level security;

drop policy if exists "User request view states: select own" on public.user_request_view_states;
create policy "User request view states: select own"
    on public.user_request_view_states
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "User request view states: insert own" on public.user_request_view_states;
create policy "User request view states: insert own"
    on public.user_request_view_states
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "User request view states: update own" on public.user_request_view_states;
create policy "User request view states: update own"
    on public.user_request_view_states
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
