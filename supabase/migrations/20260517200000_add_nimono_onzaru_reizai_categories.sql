-- 煮込み料理・温菜・冷菜カテゴリーへの初期振り分け

update public.recipes
set category = '煮込み料理'
where coalesce(trim(category), '') in ('料理', 'その他', '')
  and (
    coalesce(title, '') ~* '(煮込|煮込み|ストゥ|stew|braise|ラグー|ragout|ポトフ|pot.au.feu|カレー|curry|煮物)'
    or coalesce(tags::text, '') ~* '煮込'
  );

update public.recipes
set category = '温菜'
where coalesce(trim(category), '') in ('料理', 'その他')
  and coalesce(title, '') ~* '(温菜|温製|温かい|温め)';

update public.recipes
set category = '冷菜'
where coalesce(trim(category), '') in ('料理', 'その他')
  and coalesce(title, '') ~* '(冷菜|冷製|冷たい|冷やし|冷皿)';
