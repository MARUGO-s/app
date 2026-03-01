const e=`import { supabase } from '../supabase'
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';

const withTimeout = async (promise, ms, label) => {
    let t = null;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            t = setTimeout(() => reject(new Error(\`\${label || 'operation'} timed out after \${ms}ms\`)), ms);
        });
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (t) clearTimeout(t);
    }
};

const parseTextArrayMaybe = (value) => {
    if (Array.isArray(value)) return value.map(v => String(v)).filter(Boolean);
    if (typeof value !== 'string') return [];
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith('{') && raw.endsWith('}')) {
        const body = raw.slice(1, -1);
        if (!body) return [];
        return body
            .split(',')
            .map(v => v.trim().replace(/^"(.*)"$/, '$1'))
            .filter(Boolean);
    }
    return [];
};

const normalizeRpcTagArray = (payload) => {
    if (payload == null) return [];

    if (Array.isArray(payload)) {
        if (payload.every(v => typeof v === 'string')) return payload.filter(Boolean);
        if (payload.length === 1 && payload[0] && typeof payload[0] === 'object') {
            const firstObj = payload[0];
            const firstVal = Object.values(firstObj)[0];
            return parseTextArrayMaybe(firstVal);
        }
        return [];
    }

    if (typeof payload === 'object') {
        const firstVal = Object.values(payload)[0];
        return parseTextArrayMaybe(firstVal);
    }

    return parseTextArrayMaybe(payload);
};

const normalizeRecipeTags = (rawTags) => {
    if (Array.isArray(rawTags)) return rawTags.map(v => String(v)).filter(Boolean);
    if (typeof rawTags === 'string') {
        const trimmed = rawTags.trim();
        if (!trimmed) return [];
        // Handle Postgres text[] string format first.
        const pgArray = parseTextArrayMaybe(trimmed);
        if (pgArray.length > 0) return pgArray;
        // Fallback for legacy comma-separated string tags.
        return trimmed.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
};

const shouldUseLocalRecipeFallback = (error) => {
    if (!error) return false;

    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || '').toLowerCase();
    const details = String(error.details || '').toLowerCase();

    // Permission/RLS/schema errors should be surfaced to user, not masked by local fallback.
    if (
        code === '42501' ||
        code.startsWith('PGRST') ||
        message.includes('row-level security') ||
        message.includes('permission denied') ||
        message.includes('violates row-level security') ||
        message.includes('invalid input syntax') ||
        message.includes('column') ||
        details.includes('row-level security')
    ) {
        return false;
    }

    // Only fallback for transient/offline/timeout style failures.
    return (
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('load failed')
    );
};

const RECIPE_LIST_CACHE_KEY = 'recipe_list_cache';
const RECIPE_LIST_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

const saveRecipeListCache = (recipes, userId) => {
    try {
        // Save minimal data for list display (strip heavy fields)
        const minimal = (recipes || []).map(r => ({
            id: r.id,
            title: r.title,
            description: r.description,
            image: r.image,
            servings: r.servings,
            course: r.course,
            category: r.category,
            storeName: r.storeName,
            store_name: r.store_name,
            tags: r.tags,
            created_at: r.created_at,
            updated_at: r.updated_at,
            type: r.type,
            sourceUrl: r.sourceUrl,
        }));
        localStorage.setItem(RECIPE_LIST_CACHE_KEY, JSON.stringify({
            userId,
            updatedAt: Date.now(),
            recipes: minimal,
        }));
    } catch {
        // Storage full or not available – ignore
    }
};

const loadRecipeListCache = (userId) => {
    try {
        const raw = localStorage.getItem(RECIPE_LIST_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Must belong to same user and not be too old
        if (parsed.userId !== userId) return null;
        if (Date.now() - parsed.updatedAt > RECIPE_LIST_CACHE_MAX_AGE) return null;
        return parsed.recipes || null;
    } catch {
        return null;
    }
};

export const recipeService = {
    // Cache for detected query pattern (avoid repeated fallback attempts)
    _queryPattern: null,
    _queryPatternCache: new Map(),
    _showMasterPrefCache: new Map(), // userId -> { value: boolean, updatedAt: number }
    _masterOwnerTagsCache: { value: new Set(['owner:yoshito', 'owner:admin']), updatedAt: 0 },

    /**
     * Return cached recipe list from localStorage (synchronous, instant).
     * Returns null if no valid cache exists.
     */
    getCachedRecipes(userId) {
        return loadRecipeListCache(userId);
    },

    saveCachedRecipes(recipes, userId) {
        saveRecipeListCache(recipes, userId);
    },

    async _resolveShowMasterPreference(currentUser, timeoutMs = 15000) {
        const fallback = currentUser?.showMasterRecipes === true;
        const userId = currentUser?.id;
        if (!userId) return fallback;

        const cached = this._showMasterPrefCache.get(userId);
        const now = Date.now();
        // If auth-context value changed locally, prioritize it immediately.
        if (cached && cached.value !== fallback) {
            this._showMasterPrefCache.set(userId, { value: fallback, updatedAt: now });
            return fallback;
        }
        // 30 sec cache to reduce extra profile queries
        if (cached && now - cached.updatedAt < 30000) {
            return cached.value;
        }

        try {
            const { data, error } = await withTimeout(
                supabase
                    .from('profiles')
                    .select('show_master_recipes')
                    .eq('id', userId)
                    .single(),
                Math.min(3000, timeoutMs / 3),
                'profiles.select(show_master_recipes)'
            );
            if (error) throw error;
            const value = data?.show_master_recipes === true;
            this._showMasterPrefCache.set(userId, { value, updatedAt: now });
            return value;
        } catch {
            // Fallback to in-memory auth state if profile fetch fails.
            this._showMasterPrefCache.set(userId, { value: fallback, updatedAt: now });
            return fallback;
        }
    },

    async _resolveMasterOwnerTags(timeoutMs = 15000) {
        const now = Date.now();
        if (this._masterOwnerTagsCache?.value && now - this._masterOwnerTagsCache.updatedAt < 30000) {
            return this._masterOwnerTagsCache.value;
        }

        try {
            const { data, error } = await withTimeout(
                supabase.rpc('get_master_recipe_owner_tags'),
                Math.min(3000, timeoutMs / 3),
                'rpc.get_master_recipe_owner_tags'
            );
            if (error) throw error;
            const tags = normalizeRpcTagArray(data);
            const nextSet = new Set(tags.length > 0 ? tags : ['owner:yoshito', 'owner:admin']);
            this._masterOwnerTagsCache = { value: nextSet, updatedAt: now };
            return nextSet;
        } catch {
            const fallback = this._masterOwnerTagsCache?.value || new Set(['owner:yoshito', 'owner:admin']);
            this._masterOwnerTagsCache = { value: fallback, updatedAt: now };
            return fallback;
        }
    },

    async fetchRecipes(currentUser, {
        timeoutMs = 15000,
        includeIngredients = true,
        includeSources = true,
        offset = 0,
        limit = null,
        skipCacheSave = false,
        returnMeta = false,
    } = {}) {
        if (!currentUser) {
            console.warn("fetchRecipes: No currentUser, returning empty list.");
            return [];
        }

        const isAdmin = currentUser.role === 'admin';
        // Kick off preference fetch early (in parallel with recipes.select) to reduce perceived latency.
        const showMasterPromise = isAdmin
            ? Promise.resolve(false)
            : this._resolveShowMasterPreference(currentUser, timeoutMs);

        const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
        const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : null;
        let rawFetchedCount = 0;

        let allRecipes = [];

        const tryList = async (selectSpec, { withOrderIndex, queryTimeoutMs }) => {
            let q = supabase
                .from('recipes')
                .select(selectSpec);

            if (withOrderIndex) {
                q = q
                    .order('order_index', { ascending: true, nullsFirst: true })
                    .order('created_at', { ascending: false });
            } else {
                q = q.order('created_at', { ascending: false });
            }

            if (safeLimit != null) {
                q = q.range(safeOffset, safeOffset + safeLimit - 1);
            }

            const { data, error } = await withTimeout(q, queryTimeoutMs, 'recipes.select(list)');
            if (error) throw error;
            rawFetchedCount = Array.isArray(data) ? data.length : 0;
            return (data || []).map(fromDbFormat);
        };

        // Deprecated ingredients->0; it causes 400 if ingredients is not jsonb or null in a way Supabase dislikes.
        // We will just fetch 'ingredients' (jsonb) and parse it client-side if needed, but for list view we don't really need deep inspection yet.
        const listSelectV1 = includeIngredients
            ? \`id,title,description,image,servings,course,category,store_name,ingredients,tags,created_at,updated_at,order_index\${includeSources ? ',recipe_sources(url)' : ''}\`
            : \`id,title,description,image,servings,course,category,store_name,tags,created_at,updated_at,order_index\${includeSources ? ',recipe_sources(url)' : ''}\`;
        const listSelectV2 = includeIngredients
            ? \`id,title,description,image,servings,course,category,store_name,ingredients,tags,created_at,updated_at\${includeSources ? ',recipe_sources(url)' : ''}\`
            : \`id,title,description,image,servings,course,category,store_name,tags,created_at,updated_at\${includeSources ? ',recipe_sources(url)' : ''}\`;
        const listSelectV3 = includeIngredients
            ? 'id,title,description,image,servings,course,category,store_name,ingredients,tags,created_at,updated_at'
            : 'id,title,description,image,servings,course,category,store_name,tags,created_at,updated_at';
        const listSelectV4 = includeIngredients
            ? 'id,title,description,image,servings,course,category,store_name,ingredients,tags,created_at'
            : 'id,title,description,image,servings,course,category,store_name,tags,created_at';

        let lastError = null;

        // OPTIMIZATION: Use cached query pattern if available
        const cacheKey = \`recipe_query_pattern:\${includeIngredients ? 'ing' : 'noing'}:\${includeSources ? 'src' : 'nosrc'}\`;
        const cachedPattern = this._queryPatternCache.get(cacheKey);

        const cachedTryTimeoutMs = Math.max(2500, timeoutMs);

        if (cachedPattern) {
            // Skip directly to known-working query pattern
            try {
                allRecipes = await tryList(cachedPattern.spec, {
                    withOrderIndex: cachedPattern.withOrderIndex,
                    queryTimeoutMs: cachedTryTimeoutMs,
                });
            } catch (err) {
                // If cached pattern fails, fall back to detection
                console.warn('Cached query pattern failed, re-detecting...', err);
                this._queryPatternCache.delete(cacheKey);
                lastError = err;
            }
        } else {
            const selectSpecs = includeIngredients
                ? [listSelectV1, listSelectV2, listSelectV3, listSelectV4]
                : [listSelectV1, listSelectV2, listSelectV4];
            const perTryTimeoutMs = Math.max(2500, Math.round(timeoutMs / selectSpecs.length));

            // First time: detect schema by trying queries in order
            // Use Promise.all with catch to try all in parallel, but faster
            try {
                allRecipes = await tryList(listSelectV1, { withOrderIndex: true, queryTimeoutMs: perTryTimeoutMs });
                // Cache this pattern for future use
                this._queryPatternCache.set(cacheKey, { spec: listSelectV1, withOrderIndex: true });
            } catch (e1) {
                lastError = e1;
                try {
                    allRecipes = await tryList(listSelectV2, { withOrderIndex: false, queryTimeoutMs: perTryTimeoutMs });
                    this._queryPatternCache.set(cacheKey, { spec: listSelectV2, withOrderIndex: false });
                } catch (e2) {
                    lastError = e2;
                    try {
                        allRecipes = await tryList(listSelectV3, { withOrderIndex: false, queryTimeoutMs: perTryTimeoutMs });
                        this._queryPatternCache.set(cacheKey, { spec: listSelectV3, withOrderIndex: false });
                    } catch (e3) {
                        lastError = e3;
                        try {
                            allRecipes = await tryList(listSelectV4, { withOrderIndex: false, queryTimeoutMs: perTryTimeoutMs });
                            this._queryPatternCache.set(cacheKey, { spec: listSelectV4, withOrderIndex: false });
                        } catch (e4) {
                            lastError = e4;
                            allRecipes = [];
                        }
                    }
                }
            }
        }

        if (allRecipes.length === 0 && lastError) {
            // If Supabase failed and we have no local fallback data, propagate error so UI can show a message.
            try {
                const localData = localStorage.getItem('local_recipes');
                if (localData) {
                    const localRecipes = JSON.parse(localData).map(r => typeof fromDbFormat === 'function' ? fromDbFormat(r) : r);
                    allRecipes = safeLimit != null
                        ? localRecipes.slice(safeOffset, safeOffset + safeLimit)
                        : localRecipes;
                    rawFetchedCount = allRecipes.length;
                } else {
                    throw lastError;
                }
            } catch {
                // Keep lastError to help callers show a useful message.
                throw lastError;
            }
        }

        // 3. Apply Filtering Logic (App-side RLS)
        if (isAdmin) {
            if (!skipCacheSave) {
                saveRecipeListCache(allRecipes, currentUser.id);
            }
            if (returnMeta) {
                return {
                    recipes: allRecipes,
                    hasMoreRaw: safeLimit != null ? rawFetchedCount === safeLimit : false,
                };
            }
            return allRecipes;
        }

        const userIds = [String(currentUser.id)];
        if (currentUser.displayId) userIds.push(String(currentUser.displayId));

        // Resolve from latest profile value (with short cache) to avoid stale auth-context state.
        const showMaster = await showMasterPromise;
        const masterOwnerTags = showMaster
            ? await this._resolveMasterOwnerTags(timeoutMs)
            : new Set();

        const filtered = allRecipes.filter(recipe => {
            const tags = normalizeRecipeTags(recipe.tags);
            const ownerTags = tags.filter(t => t && t.startsWith('owner:'));

            // If NO owner tag, treat as legacy/shared and allow showing.
            // (RLS is permissive in this project; hiding legacy items here can make the UI look empty.)
            if (ownerTags.length === 0) {
                return true;
            }

            // Check if recipe is owned by a Master/Admin
            const isMaster = ownerTags.some(tag => masterOwnerTags.has(tag));

            // If "Master Sharing" is enabled for this user, they can see Master recipes.
            if (showMaster && isMaster) {
                return true;
            }

            // Otherwise, it MUST match the current user OR have 'public' tag
            const isOwner = ownerTags.some(ownerTag => userIds.some(id => ownerTag === \`owner:\${id}\`));
            const isPublic = tags.includes('public');

            if (isOwner || isPublic) {
                return true;
            }

            //console.log(\`Hidden. Owner: \${ownerTag}, User: \${currentUser.id}\`);
            return false;
        });

        if (!skipCacheSave) {
            saveRecipeListCache(filtered, currentUser.id);
        }
        if (returnMeta) {
            return {
                recipes: filtered,
                hasMoreRaw: safeLimit != null ? rawFetchedCount === safeLimit : false,
            };
        }
        return filtered;
    },

    // Helper to standardise filtering (can be used internally if needed)
    _filterRecipesInApp(allRecipes, currentUser) {
        // ... (kept for compatibility if referenced elsewhere, but logic is inline above for clarity)
        return this.fetchRecipes(currentUser);
    },

    async uploadImage(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = \`\${Date.now()}-\${Math.random().toString(36).substring(7)}.\${fileExt}\`;
        const filePath = \`\${fileName}\`;

        const { error } = await supabase.storage
            .from('recipe-images')
            .upload(filePath, file);

        if (error) throw error;

        const { data } = supabase.storage
            .from('recipe-images')
            .getPublicUrl(filePath);

        return data.publicUrl;
    },

    async getRecipe(id) {
        try {
            const { data, error } = await withTimeout(
                supabase
                    .from('recipes')
                    .select('*, recipe_sources(url)')
                    .eq('id', id)
                    .single(),
                15000,
                'recipes.select(detail)'
            );

            if (error) throw error;
            return fromDbFormat(data);
        } catch (error) {
            console.warn("Supabase getRecipe failed, falling back to LocalStorage:", error);
            const localData = localStorage.getItem('local_recipes');
            if (localData) {
                const recipes = JSON.parse(localData);
                const found = recipes.find(r => r.id == id);
                if (found) return fromDbFormat(found);
            }
            throw error;
        }
    },

    async createRecipe(recipe, currentUser) {
        console.log("createRecipe called with user:", currentUser);
        const { id: _ID, created_at: _CREATED_AT, sourceUrl, ...recipeData } = recipe

        // Handle image upload if a File object is provided
        if (recipeData.image instanceof File) {
            recipeData.image = await this.uploadImage(recipeData.image);
        }

        // Add Owner Tag
        if (currentUser) {
            const tags = recipeData.tags || [];
            // Remove any existing owner tags to be safe (though create shouldn't have them)
            const cleanTags = tags.filter(t => !t.startsWith('owner:'));
            recipeData.tags = [...cleanTags, \`owner:\${currentUser.id}\`];
            console.log("Added owner tag. New tags:", recipeData.tags);
        } else {
            console.warn("createRecipe: No currentUser provided! Recipe will be public.");
        }

        const payload = toDbFormat(recipeData)

        try {
            const { data, error } = await supabase
                .from('recipes')
                .insert([payload])
                .select()
                .single()

            if (error) throw error

            // Handle Source URL
            if (sourceUrl) {
                const { error: sourceError } = await supabase
                    .from('recipe_sources')
                    .insert([{
                        recipe_id: data.id,
                        url: sourceUrl
                    }]);

                if (sourceError) console.error("Failed to save source URL:", sourceError);
            }

            return fromDbFormat({ ...data, recipe_sources: sourceUrl ? [{ url: sourceUrl }] : [] })

        } catch (error) {
            if (!shouldUseLocalRecipeFallback(error)) {
                throw error;
            }

            console.warn("Supabase create failed (network/transient), using LocalStorage fallback:", error);

            const newId = Date.now();
            const newRecipe = {
                ...recipeData,
                id: newId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                // Ensure tags exist
                tags: recipeData.tags || []
            };

            // Ensure payload format matches what fetchRecipes expects (snake_case likely stored in local)
            // But we can store it in whatever format, as long as fetchRecipes handles it. 
            // Let's store it as the DB would (snake_case) to be consistent.
            const dbLike = toDbFormat(newRecipe);
            dbLike.id = newId; // toDbFormat might clean id? make sure it's there.
            dbLike.created_at = newRecipe.created_at;

            console.log("Saving to LocalStorage:", dbLike);

            // LocalStorage Save
            try {
                const localData = localStorage.getItem('local_recipes');
                const recipes = localData ? JSON.parse(localData) : [];
                recipes.push(dbLike);
                localStorage.setItem('local_recipes', JSON.stringify(recipes));
                console.log("Saved to LocalStorage success. Total recipes:", recipes.length);
            } catch (e) {
                console.error("Failed to save to LocalStorage:", e);
                throw error; // If both fail, throw original
            }

            return fromDbFormat(dbLike);
        }
    },

    async updateRecipe(recipe) {
        // Update doesn't change owner usually, preserving existing tags including owner
        const { id: _ID, created_at: _CREATED_AT, sourceUrl, ...recipeData } = recipe

        // Handle image upload if a File object is provided
        if (recipeData.image instanceof File) {
            recipeData.image = await this.uploadImage(recipeData.image);
        }

        const payload = toDbFormat(recipeData);

        // IMPORTANT:
        // List-view recipe objects often do NOT include steps (and sometimes other heavy fields).
        // If we blindly send \`steps: []\`, we will overwrite the stored steps.
        // Only update fields that are explicitly provided by the caller.
        if (recipeData.steps === undefined) delete payload.steps;

        // Avoid wiping tags when doing partial updates.
        if (recipeData.tags === undefined) delete payload.tags;

        // Avoid wiping ingredients/meta when doing partial updates.
        const shouldUpdateIngredients =
            recipeData.ingredients !== undefined ||
            recipeData.type !== undefined ||
            recipeData.ingredientGroups !== undefined ||
            recipeData.flours !== undefined ||
            recipeData.breadIngredients !== undefined ||
            recipeData.stepGroups !== undefined;
        if (!shouldUpdateIngredients) delete payload.ingredients;

        try {
            const { data, error } = await supabase
                .from('recipes')
                .update(payload)
                .eq('id', recipe.id)
                .select()
                .single()

            if (error) throw error

            // Handle Source URL Update
            if (sourceUrl !== undefined) {
                await supabase.from('recipe_sources').delete().eq('recipe_id', recipe.id);
                if (sourceUrl) {
                    const { error: sourceError } = await supabase
                        .from('recipe_sources')
                        .insert([{
                            recipe_id: recipe.id,
                            url: sourceUrl
                        }]);
                    if (sourceError) console.error("Failed to update source URL:", sourceError);
                }
            }

            return fromDbFormat({ ...data, recipe_sources: sourceUrl ? [{ url: sourceUrl }] : [] })

        } catch (error) {
            if (!shouldUseLocalRecipeFallback(error)) {
                throw error;
            }

            console.warn("Supabase update failed (network/transient), using LocalStorage fallback:", error);

            const localData = localStorage.getItem('local_recipes');
            if (localData) {
                let recipes = JSON.parse(localData);
                const index = recipes.findIndex(r => r.id == recipe.id);

                if (index !== -1) {
                    // Update
                    const updated = {
                        ...recipes[index],
                        ...payload,
                        updated_at: new Date().toISOString()
                    };
                    recipes[index] = updated;
                    localStorage.setItem('local_recipes', JSON.stringify(recipes));
                    return fromDbFormat(updated);
                }
            }
            throw error;
        }
    },

    async duplicateRecipe(recipe, currentUser) {
        // 1. Prepare copy data
        const { id: _id, created_at: _createdAt, updated_at: _updatedAt, image, ...recipeData } = recipe;

        // Append " (Copy)" to title to distinguish
        recipeData.title = \`\${recipeData.title} (コピー)\`;

        // Handle image duplication (reuse URL or copy file)
        let newImageUrl = null;
        if (image) {
            try {
                const fileName = image.split('/').pop();
                const newFileName = \`copy-\${Date.now()}-\${fileName}\`;

                const { error: copyError } = await supabase.storage
                    .from('recipe-images')
                    .copy(fileName, newFileName);

                if (!copyError) {
                    const { data } = supabase.storage
                        .from('recipe-images')
                        .getPublicUrl(newFileName);
                    newImageUrl = data.publicUrl;
                } else {
                    console.warn("Image copy failed, using original URL:", copyError);
                    newImageUrl = image;
                }
            } catch (e) {
                console.warn("Image copy logic error:", e);
                newImageUrl = image;
            }
        }

        recipeData.image = newImageUrl;

        // 2. Insert as new recipe (will add owner tag in createRecipe)
        return await this.createRecipe(recipeData, currentUser);
    },

    async fetchDeletedRecipes() {
        const { data, error } = await supabase
            .from('deleted_recipes')
            .select('*')
            .order('deleted_at', { ascending: false })

        if (error) throw error
        return data.map(fromDeletedDbFormat)
    },

    async getDeletedCount() {
        const { count, error } = await supabase
            .from('deleted_recipes')
            .select('*', { count: 'exact', head: true })

        if (error) throw error
        return count
    },

    async deleteRecipe(id) {
        try {
            // 1. Get the recipe to be deleted
            const { data: recipe, error: fetchError } = await supabase
                .from('recipes')
                .select('*')
                .eq('id', id)
                .single()

            if (fetchError) throw fetchError

            // 2. Insert into deleted_recipes
            const { error: insertError } = await supabase
                .from('deleted_recipes')
                .insert([{
                    original_id: recipe.id,
                    title: recipe.title,
                    description: recipe.description,
                    image: recipe.image,
                    prep_time: recipe.prep_time,
                    cook_time: recipe.cook_time,
                    servings: recipe.servings,
                    tags: recipe.tags,
                    ingredients: recipe.ingredients,
                    steps: recipe.steps,
                    created_at: recipe.created_at
                }])

            if (insertError) throw insertError

            // 3. Delete from recipes
            const { error: deleteError } = await supabase
                .from('recipes')
                .delete()
                .eq('id', id)

            if (deleteError) throw deleteError
            return true

        } catch (error) {
            console.warn("Supabase delete failed, using LocalStorage fallback:", error);
            const localData = localStorage.getItem('local_recipes');
            if (localData) {
                let recipes = JSON.parse(localData);
                const initialLength = recipes.length;
                recipes = recipes.filter(r => r.id != id);
                if (recipes.length < initialLength) {
                    localStorage.setItem('local_recipes', JSON.stringify(recipes));
                    return true;
                }
            }
            throw error;
        }
    },

    async restoreRecipe(id) { // id in deleted_recipes
        // 1. Get from deleted_recipes
        const { data: deletedRecipe, error: fetchError } = await supabase
            .from('deleted_recipes')
            .select('*')
            .eq('id', id)
            .single()

        if (fetchError) throw fetchError

        // 2. Insert back into recipes (new ID will be generated, or we could force the old one if we disabled identity generation, but easier to just create new)
        // We will prioritize "original_id" if we want, but let's just make a new insert to be safe.
        // Actually, let's treat it as a new insert to be safe.
        const { error: insertError } = await supabase
            .from('recipes')
            .insert([{
                title: deletedRecipe.title,
                description: deletedRecipe.description,
                image: deletedRecipe.image,
                prep_time: deletedRecipe.prep_time,
                cook_time: deletedRecipe.cook_time,
                servings: deletedRecipe.servings,
                tags: deletedRecipe.tags,
                ingredients: deletedRecipe.ingredients,
                steps: deletedRecipe.steps,
                created_at: deletedRecipe.created_at
            }])

        if (insertError) throw insertError

        // 3. Delete from deleted_recipes
        const { error: deleteError } = await supabase
            .from('deleted_recipes')
            .delete()
            .eq('id', id)

        if (deleteError) throw deleteError
        return true
    },

    async hardDeleteRecipe(id) {
        const { error } = await supabase
            .from('deleted_recipes')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    },

    async fetchRecentRecipes() {
        const { data, error } = await supabase
            .from('recent_views')
            .select('recipe_id')
            .order('viewed_at', { ascending: false })
            .limit(20);

        if (error) throw error;
        return data.map(item => item.recipe_id);
    },

    async addToHistory(recipeId) {
        // Upsert logic: if recipe_id exists, update viewed_at
        const { error } = await supabase
            .from('recent_views')
            .upsert({
                recipe_id: recipeId,
                viewed_at: new Date().toISOString()
            }, { onConflict: 'recipe_id' });

        if (error) throw error;
        return true;
    },

    async updateOrder(items) {
        // items: [{ id, order_index }]
        // Supabase upsert can work for bulk updates if we carefully construct it,
        // but simple loop is safer for partial updates to avoid overwriting other fields with nulls
        // if upsert behaves like REPLACE.
        // Actually, let's use a loop for safety. High volume is not expected.

        const updates = items.map(item =>
            supabase
                .from('recipes')
                .update({ order_index: item.order_index })
                .eq('id', item.id)
        );

        await Promise.all(updates);
    },

    async exportAllRecipes(currentUser) {
        // Fetch all data for backup
        // We reuse fetchRecipes to get the clean frontend format
        return await this.fetchRecipes(currentUser);
    },

    async importRecipes(recipes) {
        if (!Array.isArray(recipes)) throw new Error("Invalid backup format");

        let successCount = 0;
        let errors = [];

        for (const recipe of recipes) {
            try {
                await this.createRecipe(recipe);
                successCount++;
            } catch (e) {
                console.error("Import failed for recipe:", recipe.title, e);
                errors.push({ title: recipe.title, error: e.message });
            }
        }

        return { success: true, count: successCount, errors };
    },

    async updateRecipeCosts(priceMap) {
        // user: currentUser not strictly needed if we assume admin context in DataManagement,
        // but ideally should be passed if we want to filter updates?
        // For now, update ALL recipes since costs are global.

        // 1. Fetch ALL recipes (bypass RLS filtering usually done in fetchRecipes by using raw query)
        // Actually, we should probably only update recipes the user has access to, or all if admin?
        // Let's rely on fetchRecipes logic but with admin-like context?
        // Or just raw Select.
        const { data: allRecipes, error } = await supabase
            .from('recipes')
            .select('*');

        if (error) throw error;

        let updatedCount = 0;
        const updates = [];

        for (const rawRecipe of allRecipes) {
            const recipe = fromDbFormat(rawRecipe);
            let hasChanges = false;

            // Helper to update an ingredient list
            const updateList = (list) => {
                return list.map(ing => {
                    if (!ing.name) return ing;
                    const priceData = priceMap.get(normalizeIngredientKey(ing.name));

                    if (priceData) {
                        // Found a matching price!
                        // Calculate new Cost
                        // Logic must match RecipeForm logic:
                        // Normal: Cost = (usage / unit_size) * price ?? No, CSV price is usually "per unit" (e.g. per kg, per pack)
                        // Actually, the app seems to expect unit conversion or direct calculation?
                        // Let's look at Bread form logic: item.cost = (qty/1000 * purchaseCost) 
                        // This implies purchaseCost is "Price per Kg" or similar unit.
                        // And CSV import saves "price".

                        // Let's assume the CSV price IS the "purchaseCost" (仕入れ単価).
                        // And we update that.

                        if (ing.purchaseCost !== priceData.price) {
                            hasChanges = true;

                            // Update Purchase Cost
                            const newIng = { ...ing, purchaseCost: priceData.price };

                            // Update Calculated Cost (Simple Proportional)
                            // We need to know HOW cost was calculated initially.
                            // If we don't have the formula, we can assume Bread Logic for Bread,
                            // and "Qty * UnitPrice" for Normal?

                            // Heuristic:
                            // If it's Bread: cost = (qty / 1000) * price (assuming price is per kg, qty is g)
                            // If it's Normal: cost = ??? 
                            // In RecipeFormIngredients: cost = purchaseCost * (quantity / ???)
                            // Actually, in the current simple implementation, many users input cost manually.
                            // BUT if we are automating, we must calculate.

                            // Re-calculation logic:
                            // If we have a Quantity and a New Price.
                            // Bread: Qty is grams. Price is likely per Kg (standard baking).
                            if (recipe.type === 'bread') {
                                // Bread logic: cost = (qty / 1000) * price
                                const qty = parseFloat(newIng.quantity) || 0;
                                newIng.cost = Math.round((qty / 1000) * newIng.purchaseCost);
                            } else {
                                // Normal logic:
                                // Very tricky without unit conversion.
                                // However, if the user previously had \`purchaseCost: 100, cost: 50\`, and Qty: 50.
                                // Then ratio was 0.5.
                                // If new purchaseCost: 200 => cost: 100.
                                // Let's try to preserve the ratio? 
                                // cost = purchaseCost * (oldCost / oldPurchaseCost)

                                if (ing.cost && ing.purchaseCost) {
                                    const ratio = ing.cost / ing.purchaseCost;
                                    newIng.cost = Math.round(newIng.purchaseCost * ratio);
                                } else {
                                    // Fallback: If no previous cost but we have price now.
                                    // Can't reliably calculate without knowing units (e.g. 1 tbsp vs 1 litre bottle).
                                    // So maybe just update purchaseCost and leave cost alone?
                                    // No, user wants cost updated.
                                    // Let's only update cost if we can deduce logic, otherwise specific instructions might be needed.
                                    // For now, let's update purchaseCost. 
                                }
                            }
                            return newIng;
                        }
                    }
                    return ing;
                });
            };

            if (recipe.type === 'bread') {
                const newFlours = updateList(recipe.flours || []);
                const newOthers = updateList(recipe.breadIngredients || []);

                if (hasChanges) {
                    recipe.flours = newFlours;
                    recipe.breadIngredients = newOthers;
                }
            } else {
                const newIngredients = updateList(recipe.ingredients || []);
                if (hasChanges) {
                    recipe.ingredients = newIngredients;
                }
            }

            if (hasChanges) {
                // Prepare update payload
                const payload = toDbFormat(recipe);
                // We need to call update.
                updates.push(
                    supabase.from('recipes').update(payload).eq('id', recipe.id)
                );
                updatedCount++;
            }
        }

        if (updates.length > 0) {
            await Promise.all(updates);
        }

        return updatedCount;
    }
}

// Helpers to map between frontend (camelCase) and DB (snake_case)
const toDbFormat = (recipe) => {
    let ingredientsToSave = recipe.ingredients || [];

    // Consolidate Meta
    const metaItem = {
        _meta: true,
        type: recipe.type || 'normal'
    };

    if (recipe.ingredientGroups && recipe.ingredientGroups.length > 0) {
        metaItem.groups = recipe.ingredientGroups;
    }

    if (recipe.stepGroups && recipe.stepGroups.length > 0) {
        // Calculate step counts per group to allow reconstruction
        // Expecting recipe.stepGroups to be [{id, name}] 
        // AND recipe.steps to be flattened array.
        // BUT we need to know how many steps in each group.
        // Problem: recipe.stepGroups passed from Form only has {id, name}.
        // The Form passed flattened steps strings.
        // The Form logic I wrote:
        // finalSteps = stepSections.flatMap(...) -> objects {text, groupId}
        // So recipe.steps coming in HAS groupId! 
        // Excellent.

        const stepsWithGroups = recipe.steps || [];
        const groupCounts = recipe.stepGroups.map(g => ({
            ...g,
            count: stepsWithGroups.filter(s => s.groupId === g.id).length
        }));
        metaItem.stepGroups = groupCounts;
    }

    // PACKING INGREDIENTS
    if (recipe.type === 'bread') {
        const packedFlours = (recipe.flours || []).map(f => ({ ...f, _group: 'flour' }));
        const packedOthers = (recipe.breadIngredients || []).map(i => ({ ...i, _group: 'other' }));
        ingredientsToSave = [metaItem, ...packedFlours, ...packedOthers];
    } else {
        // Normal
        // Ensure meta is first
        // If meta was already added in previous logic, remove it? 
        // No, current logic constructs new list.
        ingredientsToSave = [metaItem, ...ingredientsToSave];
    }

    // STEPS: Save as plain strings
    // If steps are objects (which they should be now), map to text.
    const stepsToSave = (recipe.steps || []).map(s => (typeof s === 'string' ? s : s.text));

    // Explicitly whitelist columns to avoid sending unknown fields
    return {
        title: recipe.title,
        description: recipe.description,
        image: recipe.image,
        servings: recipe.servings,
        course: recipe.course,
        category: recipe.category,
        store_name: recipe.storeName, // Map camelCase to snake_case
        ingredients: ingredientsToSave,
        steps: stepsToSave,
        tags: recipe.tags || []
    }
}

const fromDbFormat = (recipe) => {
    const rawIngs = recipe.ingredients || [];
    let type = 'normal';
    let flours = [];
    let breadIngredients = [];
    let ingredientGroups = [];
    let stepGroups = [];
    let cleanIngredients = rawIngs;
    const normalizedTags = normalizeRecipeTags(recipe.tags);

    // UNPACKING STRATEGY:
    // Prefer packed full ingredients data when available (detail fetch).
    const hasPackedMetaInIngredients =
        Array.isArray(rawIngs) &&
        rawIngs.length > 0 &&
        rawIngs[0] &&
        typeof rawIngs[0] === 'object' &&
        rawIngs[0]._meta;

    if (hasPackedMetaInIngredients) {
        const meta = rawIngs[0];
        type = meta.type || 'normal';

        if (meta.groups) {
            ingredientGroups = meta.groups;
        }

        if (meta.stepGroups) {
            stepGroups = meta.stepGroups;
        }

        // Filter out meta
        const dataItems = rawIngs.slice(1);

        if (type === 'bread') {
            flours = dataItems
                .filter(i => i._group === 'flour')
                .map((item) => {
                    const { _group, ...rest } = item;
                    return rest;
                });
            breadIngredients = dataItems
                .filter(i => i._group === 'other')
                .map((item) => {
                    const { _group, ...rest } = item;
                    return rest;
                });
            // For standard views, we might want a combined list
            cleanIngredients = [...flours, ...breadIngredients];
        } else {
            cleanIngredients = dataItems;
        }
    } else if (recipe.ingredients_meta) {
        // Lightweight metadata fallback (some list queries may provide only ingredients_meta).
        // Do not wipe real ingredients if they are present.
        type = recipe.ingredients_meta.type || 'normal';
        if (Array.isArray(recipe.ingredients_meta.groups)) {
            ingredientGroups = recipe.ingredients_meta.groups;
        }
        if (Array.isArray(recipe.ingredients_meta.stepGroups)) {
            stepGroups = recipe.ingredients_meta.stepGroups;
        }
        cleanIngredients = Array.isArray(rawIngs) ? rawIngs : [];
    }

    // Reconstruct Steps with Group IDs if stepGroups have counts
    let stepsWithIds = recipe.steps || [];
    if (stepGroups.length > 0 && Array.isArray(stepsWithIds)) {
        let currentIndex = 0;
        stepsWithIds = stepsWithIds.map(text => ({ text })); // wrap first

        // Assign groupIds
        const newSteps = [];
        stepGroups.forEach(group => {
            const count = group.count || 0;
            for (let i = 0; i < count; i++) {
                if (currentIndex < stepsWithIds.length) {
                    newSteps.push({
                        ...stepsWithIds[currentIndex],
                        text: stepsWithIds[currentIndex].text, // ensure text property
                        groupId: group.id
                    });
                    currentIndex++;
                }
            }
        });

        // Add remaining as orphans (shouldn't happen if logic is correct)
        while (currentIndex < stepsWithIds.length) {
            newSteps.push({
                ...stepsWithIds[currentIndex],
                groupId: 'default' // or null
            });
            currentIndex++;
        }
        stepsWithIds = newSteps;
    }

    return {
        ...recipe,
        prepTime: recipe.prep_time,
        cookTime: recipe.cook_time,
        storeName: recipe.store_name,
        type,
        flours,
        breadIngredients,
        ingredientGroups,
        stepGroups,
        ingredients: cleanIngredients,
        steps: stepsWithIds.length > 0 && typeof stepsWithIds[0] === 'object' ? stepsWithIds : recipe.steps, // Return objects if grouped
        tags: normalizedTags,
        sourceUrl: (recipe.recipe_sources && recipe.recipe_sources.length > 0) ? recipe.recipe_sources[0].url : ''
    }
}

const fromDeletedDbFormat = (recipe) => ({
    ...fromDbFormat(recipe),
    deletedAt: recipe.deleted_at,
    originalId: recipe.original_id
})
`;export{e as default};
