-- Performance optimization: Add missing database indexes
-- These indexes improve query performance for frequently accessed patterns

-- Index for tags filtering (recipes often filtered by tags)
CREATE INDEX IF NOT EXISTS idx_recipes_tags ON recipes USING GIN(tags);
-- Index for recipe_sources foreign key lookup
-- Used when fetching recipes with source URLs
CREATE INDEX IF NOT EXISTS idx_recipe_sources_recipe_id ON recipe_sources(recipe_id);
-- Indexes for recent_views (view history tracking)
-- Used when fetching user's recent recipe views
CREATE INDEX IF NOT EXISTS idx_recent_views_recipe_id ON recent_views(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recent_views_viewed_at ON recent_views(viewed_at DESC);
