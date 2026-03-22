-- Allow admins to delete user requests
drop policy if exists "User requests: admin can delete all" on public.user_requests;
create policy "User requests: admin can delete all"
    on public.user_requests
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
