-- Protect operational documents and make image uploads account-scoped.
--
-- app-data contains price CSVs, delivery PDFs, parsed JSON, and stock data. It
-- must never be publicly readable or writable. recipe-images remains public
-- for stable image URLs, but only authenticated users may write and every new
-- browser upload must live below the caller's UUID folder.

begin;

update storage.buckets
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'application/json',
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
      'text/comma-separated-values',
      'application/octet-stream'
    ]::text[]
where id = 'app-data';

update storage.buckets
set public = true,
    file_size_limit = 12582912,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'recipe-images';

-- Remove every legacy policy that granted public or overly broad access.
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Public Upload" on storage.objects;
drop policy if exists "Public Access App Data" on storage.objects;
drop policy if exists "Public Upload App Data" on storage.objects;
drop policy if exists "Public Delete App Data" on storage.objects;
drop policy if exists "Public Update App Data" on storage.objects;
drop policy if exists "Allow public read access to app-data" on storage.objects;
drop policy if exists "Admins can delete any file in app-data" on storage.objects;
drop policy if exists "Admins can upload files to app-data" on storage.objects;
drop policy if exists "Admins can read files in app-data" on storage.objects;
drop policy if exists "Users can manage own files in app-data" on storage.objects;
drop policy if exists "Authenticated read recipe-images" on storage.objects;
drop policy if exists "Admins can manage all files in app-data" on storage.objects;
drop policy if exists "Users can manage own app-data" on storage.objects;
drop policy if exists "Admins can manage all recipe-images" on storage.objects;
drop policy if exists "Users can manage own recipe-images" on storage.objects;

create policy "Admins can manage all files in app-data"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'app-data'
    and public.is_admin_safe()
  )
  with check (
    bucket_id = 'app-data'
    and public.is_admin_safe()
  );

create policy "Users can manage own app-data"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'app-data'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'app-data'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Authenticated read recipe-images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (select auth.uid()) is not null
  );

create policy "Admins can manage all recipe-images"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and public.is_admin_safe()
  )
  with check (
    bucket_id = 'recipe-images'
    and public.is_admin_safe()
  );

create policy "Users can manage own recipe-images"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
