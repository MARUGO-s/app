-- 管理者が全ユーザーのapp-dataストレージを削除できるポリシーを追加
-- profiles.role = 'admin'のユーザーはapp-dataバケット内の任意のオブジェクトを削除できる

drop policy if exists "Admins can delete any file in app-data" on storage.objects;
create policy "Admins can delete any file in app-data"
  on storage.objects for delete
  using (
    bucket_id = 'app-data'
    AND exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- 管理者が自分のファイルをアップロードできるポリシーを追加（既存の場合はスキップ）
drop policy if exists "Admins can upload files to app-data" on storage.objects;
create policy "Admins can upload files to app-data"
  on storage.objects for insert
  with check (
    bucket_id = 'app-data'
    AND exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- 通常ユーザーが自分のフォルダにファイルをアップロード/削除できるポリシー
drop policy if exists "Users can manage own files in app-data" on storage.objects;
create policy "Users can manage own files in app-data"
  on storage.objects for all
  using (
    bucket_id = 'app-data'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'app-data'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
