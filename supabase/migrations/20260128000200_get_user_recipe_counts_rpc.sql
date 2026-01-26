-- Function to count recipes per user, running as security definer to bypass RLS
-- and ensure accurate counts regardless of visibility.

create or replace function get_user_recipe_counts()
returns table (user_id text, count bigint)
language plpgsql
security definer
as $$
begin
  return query
  select
    u.id::text,
    (
      select count(*)
      from recipes r
      where
        -- 1. Explicit Ownership
        r.tags @> array['owner:' || u.id]
        
        OR
        
        -- 2. Implicit Ownership (Legacy Master Data) -> Belongs to yoshito (and admin alias)
        (
          (u.id = 'yoshito' or u.id = 'admin')
          AND
          (
             r.tags is null 
             OR 
             NOT EXISTS (
               SELECT 1 
               FROM unnest(r.tags) t 
               WHERE t LIKE 'owner:%'
             )
          )
        )
    ) as count
  from app_users u;
end;
$$;
