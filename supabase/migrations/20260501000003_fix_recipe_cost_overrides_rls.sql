-- recipe_category_cost_overrides の RLS を修正
-- INSERT/UPDATE/DELETE が USING(true) になっており、誰でも他人のデータを操作できた

BEGIN;

-- 既存の permissive ポリシーを削除
DROP POLICY IF EXISTS "recipe_category_cost_overrides_select_all" ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_select_authenticated" ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_delete_authenticated" ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_insert_authenticated"  ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_update_authenticated"  ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_delete_own_or_admin" ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_insert_own_or_admin" ON public.recipe_category_cost_overrides;
DROP POLICY IF EXISTS "recipe_category_cost_overrides_update_own_or_admin" ON public.recipe_category_cost_overrides;

-- SELECT: コスト参照データはログイン済みユーザーにのみ公開
CREATE POLICY "recipe_category_cost_overrides_select_authenticated"
ON public.recipe_category_cost_overrides
FOR SELECT TO authenticated
USING (true);

-- INSERT: 対応レシピのオーナーまたは管理者のみ
CREATE POLICY "recipe_category_cost_overrides_insert_own_or_admin"
ON public.recipe_category_cost_overrides
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND (
              r.tags @> ARRAY['owner:' || auth.uid()::text]
              OR EXISTS (
                  SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid()
                    AND p.display_id IS NOT NULL
                    AND r.tags @> ARRAY['owner:' || p.display_id]
              )
          )
    )
);

-- UPDATE: 対応レシピのオーナーまたは管理者のみ
CREATE POLICY "recipe_category_cost_overrides_update_own_or_admin"
ON public.recipe_category_cost_overrides
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND (
              r.tags @> ARRAY['owner:' || auth.uid()::text]
              OR EXISTS (
                  SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid()
                    AND p.display_id IS NOT NULL
                    AND r.tags @> ARRAY['owner:' || p.display_id]
              )
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND (
              r.tags @> ARRAY['owner:' || auth.uid()::text]
              OR EXISTS (
                  SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid()
                    AND p.display_id IS NOT NULL
                    AND r.tags @> ARRAY['owner:' || p.display_id]
              )
          )
    )
);

-- DELETE: 対応レシピのオーナーまたは管理者のみ
CREATE POLICY "recipe_category_cost_overrides_delete_own_or_admin"
ON public.recipe_category_cost_overrides
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND (
              r.tags @> ARRAY['owner:' || auth.uid()::text]
              OR EXISTS (
                  SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid()
                    AND p.display_id IS NOT NULL
                    AND r.tags @> ARRAY['owner:' || p.display_id]
              )
          )
    )
);

COMMIT;
