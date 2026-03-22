-- Keep only the latest 30 login logs per user.
-- 1) One-time cleanup for existing data
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

-- 2) Update trigger function so each login keeps only latest 30 records
create or replace function public.log_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.last_sign_in_at is distinct from OLD.last_sign_in_at and NEW.last_sign_in_at is not null then
    insert into public.user_login_logs (user_id, login_at)
    values (NEW.id, NEW.last_sign_in_at);

    -- Delete older logs, keep latest 30 by login_at desc
    delete from public.user_login_logs
    where user_id = NEW.id
      and id in (
        select x.id
        from public.user_login_logs x
        where x.user_id = NEW.id
        order by x.login_at desc, x.id desc
        offset 30
      );
  end if;

  return NEW;
end;
$$;

-- 3) RPC also returns up to 30 rows for consistency
create or replace function public.admin_get_login_logs(p_user_id uuid)
returns table (
  login_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_is_admin boolean;
begin
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) into requester_is_admin;

  if not requester_is_admin then
    raise exception 'insufficient_privilege';
  end if;

  return query
    select l.login_at
    from public.user_login_logs l
    where l.user_id = p_user_id
    order by l.login_at desc
    limit 30;
end;
$$;

grant execute on function public.admin_get_login_logs(uuid) to authenticated;
