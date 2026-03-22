-- Ensure app-data bucket exists
insert into storage.buckets (id, name, public)
values ('app-data', 'app-data', true)
on conflict (id) do nothing;
-- Allow public read access to app-data for cost calculation
drop policy if exists "Allow public read access to app-data" on storage.objects;
create policy "Allow public read access to app-data"
  on storage.objects for select
  using ( bucket_id = 'app-data' );
-- Allow authenticated users to upload/update (e.g. admin or users if they need to)
-- Currently restricting write to authenticated for safety, or public if needed.
-- For now, read is the requirement for cost calculation.;
