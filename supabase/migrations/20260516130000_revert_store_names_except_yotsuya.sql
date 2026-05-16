-- 全店舗カタカナ化を取り消し、MARUGO YOTSUYA → マルゴ ヨツヤ のみ維持

create temporary table _store_name_revert_map (
  katakana_name text not null,
  original_name text not null
) on commit drop;

insert into _store_name_revert_map (katakana_name, original_name) values
  ('ホンブ', '本部'),
  ('マルゴ ディ', 'MARUGO-D'),
  ('マルゴ オット', 'MARUGO-OTTO'),
  ('マルゴ エス', 'MARUGO-S'),
  ('ゲンソドナイヤ シンジュクサンチョウメ', '元祖どないや新宿三丁目'),
  ('スシ コルリ', '鮨こるり'),
  ('マルゴ', 'MARUGO'),
  ('マルゴ ツー', 'MARUGO2'),
  ('マルゴ グランデ', 'MARUGO GRANDE'),
  ('マルゴ マルノウチ', 'MARUGO MARUNOUCHI'),
  ('マルゴ シンバシ', 'マルゴ新橋'),
  ('サンナナイチ バー', '371BAR'),
  ('サンサンゴゴ', '三三五五'),
  ('バー ペロタ', 'BAR PELOTA'),
  ('クラウディア ツー', 'Claudia2'),
  ('ビストロ カヴァカヴァ', 'BISTRO CAVACAVA'),
  ('エリックス', 'eric''S'),
  ('ミタン', 'MITAN'),
  ('ヤキニク マルゴ', '焼肉マルゴ'),
  ('ソバジュ', 'SOBA-JU'),
  ('バー バイオレット', 'Bar Violet'),
  ('エックスアンドシー', 'X&C');

update public.recipes r
set store_name = m.original_name
from _store_name_revert_map m
where r.store_name is not null
  and btrim(r.store_name) = btrim(m.katakana_name);

update public.profiles p
set store_name = m.original_name,
    updated_at = now()
from _store_name_revert_map m
where p.store_name is not null
  and btrim(p.store_name) = btrim(m.katakana_name);

update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('store_name', m.original_name)
from _store_name_revert_map m
where coalesce(u.raw_user_meta_data ->> 'store_name', '') <> ''
  and btrim(u.raw_user_meta_data ->> 'store_name') = btrim(m.katakana_name);
