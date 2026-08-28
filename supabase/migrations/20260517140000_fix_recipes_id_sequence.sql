-- recipes.id のシーケンスが MAX(id) より小さいと INSERT で 409 (duplicate key) になるため同期
SELECT setval(
  pg_get_serial_sequence('public.recipes', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM public.recipes), 0), 1)
);
