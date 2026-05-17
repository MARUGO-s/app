-- タイトル・カテゴリーにテリーヌ系の表記があるレシピを「テリーヌ」へ（任意の初期振り分け）

update public.recipes
set category = 'テリーヌ'
where coalesce(trim(category), '') not in ('テリーヌ', 'デザート・お菓子')
  and (
    coalesce(title, '') ilike '%テリーヌ%'
    or coalesce(title, '') ilike '%terrine%'
    or coalesce(title, '') ilike '%パテ%'
    or coalesce(title, '') ilike '%リエット%'
    or coalesce(category, '') ilike '%テリーヌ%'
    or coalesce(category, '') ilike '%terrine%'
  );
