-- レシピ category を案Aの固定リストへ正規化

update public.recipes
set category = '取り込み'
where coalesce(trim(category), '') in ('URL取り込み', 'PDF取り込み');

update public.recipes
set category = '付け合わせ・飾り'
where coalesce(trim(category), '') in ('飾り', '付け合わせ', 'ガーニッシュ');

update public.recipes
set category = 'デザート・お菓子'
where coalesce(trim(category), '') in ('デザート', 'お菓子', 'スイーツ', '製菓');

update public.recipes
set category = 'ソース・ドレッシング'
where coalesce(trim(category), '') ilike '%ソース%'
  and coalesce(trim(category), '') ilike '%ドレッシング%'
  and coalesce(trim(category), '') not in ('ソース', 'ドレッシング', 'ソース・ドレッシング');

update public.recipes
set category = 'ドレッシング'
where coalesce(trim(category), '') ilike '%ドレッシング%'
   or coalesce(trim(category), '') ilike '%dressing%'
   or coalesce(trim(category), '') ilike '%ヴィネグレット%'
   or coalesce(trim(category), '') ilike '%マヨネーズ%'
and coalesce(trim(category), '') not in ('ドレッシング', 'ソース・ドレッシング');

update public.recipes
set category = 'ソース'
where (
    coalesce(trim(category), '') ilike '%ソース%'
    or coalesce(trim(category), '') ilike '%sauce%'
  )
  and coalesce(trim(category), '') not in ('ソース', 'ドレッシング', 'ソース・ドレッシング');

update public.recipes
set category = 'パン'
where coalesce(trim(category), '') in ('パン', 'Bread', 'bread');

-- タグ内の旧取り込み表記（表示整理）
update public.recipes
set tags = array_replace(tags, 'URL取り込み', '取り込み')
where tags @> array['URL取り込み']::text[];

update public.recipes
set tags = array_replace(tags, 'PDF取り込み', '取り込み')
where tags @> array['PDF取り込み']::text[];
