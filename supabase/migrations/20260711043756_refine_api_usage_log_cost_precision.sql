-- AIのトークン課金は円未満になるため、小数6桁を保持する。
-- モデル別の詳しい内訳は既存のmetadata JSONBに保存する。
alter table public.api_usage_logs
  alter column estimated_cost_jpy type numeric(12, 6);
