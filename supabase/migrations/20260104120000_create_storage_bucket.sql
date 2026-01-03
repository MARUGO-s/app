insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

-- Set up access policies for the storage bucket
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'recipe-images' );

create policy "Public Upload"
  on storage.objects for insert
  with check ( bucket_id = 'recipe-images' );
