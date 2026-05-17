-- コース欄のカテゴリー名混同を案A+Bハイブリッドへ初期振り分け

update public.recipes
set course = '仕込み'
where coalesce(trim(course), '') in ('ソース', 'ドレッシング', 'ソース・ドレッシング', '付け合わせ・飾り', '飾り', 'ガーニッシュ')
   or coalesce(trim(category), '') in ('ソース', 'ドレッシング', 'ソース・ドレッシング', '付け合わせ・飾り')
      and coalesce(trim(course), '') in ('', 'ソース', 'ドレッシング');

update public.recipes
set course = '食パン'
where coalesce(trim(course), '') in ('パン', 'Bread', 'bread')
   or (coalesce(trim(category), '') = 'パン' and coalesce(trim(course), '') in ('', 'パン'));

update public.recipes
set course = 'デザート'
where coalesce(trim(course), '') in ('デザート', 'Dessert', 'dessert', 'お菓子')
   or (coalesce(trim(category), '') = 'デザート・お菓子' and coalesce(trim(course), '') in ('', 'デザート', 'Dessert', 'お菓子'));

update public.recipes
set course = 'スープ'
where coalesce(trim(category), '') = 'スープ'
  and coalesce(trim(course), '') in ('', 'スープ');

update public.recipes
set course = '軽食・デリ'
where coalesce(trim(course), '') ilike '%ランチデリ%'
   or coalesce(trim(course), '') ilike '%デリ%';

update public.recipes
set course = 'タパス・小皿'
where coalesce(trim(course), '') ilike '%tapas%'
   or coalesce(trim(course), '') ilike '%タパス%';

update public.recipes
set course = 'プティフール'
where coalesce(trim(course), '') in ('プティフール', 'プティフル');

update public.recipes
set course = 'アミューズ'
where coalesce(trim(course), '') ilike '%hors%'
   or coalesce(trim(course), '') ilike '%アミューズ%';
