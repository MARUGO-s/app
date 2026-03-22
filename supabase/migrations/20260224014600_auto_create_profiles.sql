-- プロファイルを自動作成する関数
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_id, email, role, show_master_recipes)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_id', 
      split_part(new.email, '@', 1), 
      substring(new.id::text from 1 for 8)
    ) || '_' || substring(new.id::text from 1 for 4),
    new.email,
    'user',
    false
  )
  on conflict (id) do nothing;
  
  return new;
end;
$$;
-- auth.usersテーブルにトリガーを設定
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- まだプロファイルが作成されていない既存ユーザーを一括登録（バックフィル）
insert into public.profiles (id, display_id, email, role, show_master_recipes)
select 
    id,
    coalesce(
        raw_user_meta_data->>'display_id', 
        split_part(email, '@', 1), 
        substring(id::text from 1 for 8)
    ) || '_' || substring(id::text from 1 for 4) as display_id,
    email,
    'user' as role,
    false as show_master_recipes
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;
