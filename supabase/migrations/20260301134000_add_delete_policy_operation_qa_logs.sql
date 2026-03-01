-- Allow admins to delete operation QA logs
drop policy if exists "Operation QA logs: admin can delete all" on public.operation_qa_logs;
create policy "Operation QA logs: admin can delete all"
    on public.operation_qa_logs
    for delete
    to authenticated
    using (
        exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role = 'admin'
        )
    );
