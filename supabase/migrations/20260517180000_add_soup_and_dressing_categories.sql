-- スープ・ドレッシング単体カテゴリーへの振り分け

update public.recipes
set category = 'スープ'
where coalesce(trim(category), '') not in ('スープ', 'ソース', 'ドレッシング', 'ソース・ドレッシング')
  and (
    coalesce(title, '') ~* '(スープ|soup|ポタージュ|potage|ビスク|bisque|コンソメ|consomme|ブイヨン|bouillon|汁)'
    or coalesce(category, '') ~* '(スープ|soup|ポタージュ|ビスク|コンソメ|ブイヨン)'
  );

update public.recipes
set category = 'ドレッシング'
where coalesce(trim(category), '') not in ('ドレッシング', 'ソース・ドレッシング')
  and coalesce(trim(category), '') not ilike '%ソース%'
  and (
    coalesce(title, '') ~* '(ドレッシング|dressing|ヴィネグレット|vinaigrette|マヨネーズ|mayonnaise)'
    or coalesce(category, '') ~* '(ドレッシング|dressing|ヴィネグレット|vinaigrette)'
  );
