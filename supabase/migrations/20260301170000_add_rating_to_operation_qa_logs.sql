-- Add rating columns and RPC for Operation QA answers
alter table if exists public.operation_qa_logs
    add column if not exists rating_score smallint,
    add column if not exists rated_at timestamp with time zone;

alter table if exists public.operation_qa_logs
    drop constraint if exists operation_qa_logs_rating_score_check;

alter table if exists public.operation_qa_logs
    add constraint operation_qa_logs_rating_score_check
        check (rating_score is null or rating_score between 1 and 5);

create index if not exists idx_operation_qa_logs_rating_score_created
    on public.operation_qa_logs (rating_score, created_at desc);

create or replace function public.rate_operation_qa_log(
    p_log_id uuid,
    p_rating smallint
)
returns table (
    id uuid,
    rating_score smallint,
    rated_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_is_admin boolean := false;
begin
    if v_uid is null then
        raise exception 'not_authenticated';
    end if;

    if p_log_id is null then
        raise exception 'invalid_log_id';
    end if;

    if p_rating is null or p_rating < 1 or p_rating > 5 then
        raise exception 'invalid_rating';
    end if;

    select exists (
        select 1
        from public.profiles p
        where p.id = v_uid
          and p.role = 'admin'
    ) into v_is_admin;

    return query
    update public.operation_qa_logs l
       set rating_score = p_rating,
           rated_at = now()
     where l.id = p_log_id
       and (l.user_id = v_uid or v_is_admin)
    returning l.id, l.rating_score, l.rated_at;

    if not found then
        raise exception 'not_found_or_forbidden';
    end if;
end;
$$;

revoke all on function public.rate_operation_qa_log(uuid, smallint) from public;
grant execute on function public.rate_operation_qa_log(uuid, smallint) to authenticated;
