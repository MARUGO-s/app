-- 店舗名をカタカナ表記へ統一（recipes / profiles / auth.users メタデータ）
-- アプリ側 STORE_LIST と対応する旧名称 → 新名称マッピング

create temporary table _store_name_katakana_map (
  old_name text not null,
  new_name text not null
) on commit drop;

insert into _store_name_katakana_map (old_name, new_name) values
  ('本部', 'ホンブ'),
  ('MARUGO-D', 'マルゴ ディ'),
  ('marugo-d', 'マルゴ ディ'),
  ('MARUGO-OTTO', 'マルゴ オット'),
  ('marugo-otto', 'マルゴ オット'),
  ('MARUGO-S', 'マルゴ エス'),
  ('marugo-s', 'マルゴ エス'),
  ('元祖どないや新宿三丁目', 'ゲンソドナイヤ シンジュクサンチョウメ'),
  ('鮨こるり', 'スシ コルリ'),
  ('MARUGO', 'マルゴ'),
  ('marugo', 'マルゴ'),
  ('MARUGO2', 'マルゴ ツー'),
  ('marugo2', 'マルゴ ツー'),
  ('MARUGO GRANDE', 'マルゴ グランデ'),
  ('marugo grande', 'マルゴ グランデ'),
  ('MARUGO MARUNOUCHI', 'マルゴ マルノウチ'),
  ('marugo marunouchi', 'マルゴ マルノウチ'),
  ('マルゴ新橋', 'マルゴ シンバシ'),
  ('MARUGO YOTSUYA', 'マルゴ ヨツヤ'),
  ('marugo yotsuya', 'マルゴ ヨツヤ'),
  ('Marugo Yotsuya', 'マルゴ ヨツヤ'),
  ('371BAR', 'サンナナイチ バー'),
  ('371bar', 'サンナナイチ バー'),
  ('三三五五', 'サンサンゴゴ'),
  ('BAR PELOTA', 'バー ペロタ'),
  ('bar pelota', 'バー ペロタ'),
  ('Claudia2', 'クラウディア ツー'),
  ('claudia2', 'クラウディア ツー'),
  ('BISTRO CAVACAVA', 'ビストロ カヴァカヴァ'),
  ('bistro cavacava', 'ビストロ カヴァカヴァ'),
  ('eric''S', 'エリックス'),
  ('eric''s', 'エリックス'),
  ('Eric''S', 'エリックス'),
  ('MITAN', 'ミタン'),
  ('mitan', 'ミタン'),
  ('焼肉マルゴ', 'ヤキニク マルゴ'),
  ('SOBA-JU', 'ソバジュ'),
  ('soba-ju', 'ソバジュ'),
  ('Bar Violet', 'バー バイオレット'),
  ('bar violet', 'バー バイオレット'),
  ('BAR VIOLET', 'バー バイオレット'),
  ('X&C', 'エックスアンドシー'),
  ('x&c', 'エックスアンドシー'),
  ('トラットリア ブリッコラ', 'トラットリア ブリッコラ');

-- recipes.store_name
update public.recipes r
set store_name = m.new_name
from _store_name_katakana_map m
where r.store_name is not null
  and btrim(r.store_name) = btrim(m.old_name);

-- profiles.store_name（店舗配属）
update public.profiles p
set store_name = m.new_name,
    updated_at = now()
from _store_name_katakana_map m
where p.store_name is not null
  and btrim(p.store_name) = btrim(m.old_name);

-- auth.users raw_user_meta_data.store_name（新規登録時のメタデータ）
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('store_name', m.new_name)
from _store_name_katakana_map m
where coalesce(u.raw_user_meta_data ->> 'store_name', '') <> ''
  and btrim(u.raw_user_meta_data ->> 'store_name') = btrim(m.old_name);
