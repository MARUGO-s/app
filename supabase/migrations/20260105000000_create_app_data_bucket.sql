insert into storage.buckets (id, name, public)
values ('app-data', 'app-data', true)
on conflict (id) do nothing;

-- Set up access policies for the storage bucket
drop policy if exists "Public Access App Data" on storage.objects;
drop policy if exists "Public Upload App Data" on storage.objects;
drop policy if exists "Public Delete App Data" on storage.objects;
drop policy if exists "Public Update App Data" on storage.objects;

create policy "Public Access App Data"
  on storage.objects for select
  using ( bucket_id = 'app-data' );

create policy "Public Upload App Data"
  on storage.objects for insert
  with check ( bucket_id = 'app-data' );

create policy "Public Delete App Data"
  on storage.objects for delete
  using ( bucket_id = 'app-data' );

create policy "Public Update App Data"
  on storage.objects for update
  using ( bucket_id = 'app-data' );
