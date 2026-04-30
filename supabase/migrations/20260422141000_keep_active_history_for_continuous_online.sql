-- Keep active-history logging working even for users who stay continuously online.
-- Previous trigger only logged on explicit online transitions, so long-lived sessions
-- could remain "ログイン中" without getting a recent history row.

create or replace function public.log_user_active_presence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_record boolean := false;
begin
  if NEW.is_online is true and NEW.last_seen_at is not null then
    if TG_OP = 'INSERT' then
      should_record := true;
    elsif coalesce(OLD.is_online, false) is false then
      should_record := true;
    elsif OLD.last_seen_at is null then
      should_record := true;
    elsif OLD.last_seen_at < (NEW.last_seen_at - interval '5 minutes') then
      -- Becomes active again after stale heartbeat.
      should_record := true;
    elsif not exists (
      select 1
      from public.user_login_logs l
      where l.user_id = NEW.user_id
        and l.login_at >= (NEW.last_seen_at - interval '12 hours')
    ) then
      -- Continuous online session fallback:
      -- keep at least one activity row when history is stale.
      should_record := true;
    end if;
  end if;

  if should_record then
    -- Deduplicate near-simultaneous auth-login and presence events.
    if not exists (
      select 1
      from public.user_login_logs l
      where l.user_id = NEW.user_id
        and l.login_at >= (NEW.last_seen_at - interval '5 minutes')
    ) then
      insert into public.user_login_logs (user_id, login_at)
      values (NEW.user_id, NEW.last_seen_at);

      -- Keep latest 30 records per user.
      delete from public.user_login_logs
      where user_id = NEW.user_id
        and id in (
          select x.id
          from public.user_login_logs x
          where x.user_id = NEW.user_id
          order by x.login_at desc, x.id desc
          offset 30
        );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists on_user_presence_active_log on public.user_presence;
create trigger on_user_presence_active_log
  after insert or update of is_online, last_seen_at
  on public.user_presence
  for each row
  execute function public.log_user_active_presence();

-- One-time backfill for users already online whose latest active-history row is stale.
insert into public.user_login_logs (user_id, login_at)
select p.user_id, p.last_seen_at
from public.user_presence p
where p.is_online is true
  and p.last_seen_at is not null
  and not exists (
    select 1
    from public.user_login_logs l
    where l.user_id = p.user_id
      and l.login_at >= (p.last_seen_at - interval '12 hours')
  );

-- Keep latest 30 records per user after backfill.
with ranked as (
  select
    l.id,
    row_number() over (
      partition by l.user_id
      order by l.login_at desc, l.id desc
    ) as rn
  from public.user_login_logs l
)
delete from public.user_login_logs d
using ranked r
where d.id = r.id
  and r.rn > 30;
