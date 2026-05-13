-- 旧「共有＝相手の user_reference_documents にコピー挿入」で作られた行の片付け
-- 管理者（profiles.role = 'admin'）の user_reference_documents は一切削除しない。
-- 一般ユーザー側では、添付が1件だけかつ、その data が管理者の資料箱内のいずれかの添付と完全一致する行を削除する
-- （旧 RPC は id / addedAt 以外は元添付を複製するため、この一致は共有コピーとみなせる）。

delete from public.user_reference_documents u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.user_id
    and p.role = 'admin'
)
and jsonb_array_length(coalesce(u.attachments, '[]'::jsonb)) = 1
and exists (
  select 1
  from public.user_reference_documents a
  inner join public.profiles ap on ap.id = a.user_id and ap.role = 'admin'
  cross join lateral jsonb_array_elements(coalesce(u.attachments, '[]'::jsonb)) as ue(elem)
  cross join lateral jsonb_array_elements(coalesce(a.attachments, '[]'::jsonb)) as ae(elem)
  where coalesce(ue.elem->>'data', '') <> ''
    and ue.elem->>'data' is not distinct from ae.elem->>'data'
);
