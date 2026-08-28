-- Track near-realtime login presence (heartbeat-based)
create table if not exists public.user_presence (
    user_id uuid primary key references auth.users(id) on delete cascade,
    is_online boolean not null default false,
    last_seen_at timestamp with time zone not null default now()
);

create index if not exists idx_user_presence_last_seen_at
    on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;

drop policy if exists "User presence: insert own" on public.user_presence;
create policy "User presence: insert own"
    on public.user_presence
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "User presence: update own" on public.user_presence;
create policy "User presence: update own"
    on public.user_presence
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "User presence: read own" on public.user_presence;
create policy "User presence: read own"
    on public.user_presence
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "User presence: admin read all" on public.user_presence;
create policy "User presence: admin read all"
    on public.user_presence
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

comment on table public.user_presence is 'Heartbeat-based user presence for online indicator';
