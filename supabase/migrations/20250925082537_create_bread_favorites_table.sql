CREATE TABLE public.bread_favorites (
    bread_recipe_id uuid NOT NULL,
    client_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bread_favorites_pkey PRIMARY KEY (bread_recipe_id, client_id),
    CONSTRAINT bread_favorites_bread_recipe_id_fkey FOREIGN KEY (bread_recipe_id) REFERENCES public.bread_recipes(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.bread_favorites IS 'パン用レシピのお気に入りを保存するテーブル';
