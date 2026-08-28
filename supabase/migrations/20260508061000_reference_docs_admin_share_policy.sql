-- Allow admin users to insert shared files for other users
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reference_documents'
      and policyname = 'user_reference_documents_insert_admin_share'
  ) then
    create policy user_reference_documents_insert_admin_share
      on public.user_reference_documents
      for insert
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and lower(coalesce(p.role, '')) = 'admin'
        )
      );
  end if;
end $$;
