import { supabase } from '../supabase'

export const recipeService = {
    async fetchRecipes() {
        try {
            const { data, error } = await supabase
                .from('recipes')
                .select('*, recipe_sources(url)')
                .order('order_index', { ascending: true, nullsFirst: true })
                .order('created_at', { ascending: false })

            if (error) throw error
            return data.map(fromDbFormat)
        } catch (error) {
            console.warn("Primary fetch failed (likely missing order_index), using fallback:", error);
            const { data, error: retryError } = await supabase
                .from('recipes')
                .select('*')
                .order('created_at', { ascending: false })

            if (retryError) {
                console.error("Fallback fetch failed:", retryError);
                throw retryError;
            }
            return data.map(fromDbFormat)
        }
    },

    async uploadImage(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error } = await supabase.storage
            .from('recipe-images')
            .upload(filePath, file);

        if (error) throw error;

        const { data } = supabase.storage
            .from('recipe-images')
            .getPublicUrl(filePath);

        return data.publicUrl;
    },

    async createRecipe(recipe) {
        const { id: _ID, created_at: _CREATED_AT, sourceUrl, ...recipeData } = recipe

        // Handle image upload if a File object is provided
        if (recipeData.image instanceof File) {
            recipeData.image = await this.uploadImage(recipeData.image);
        }

        const payload = toDbFormat(recipeData)

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
    },

    async updateRecipe(recipe) {
        const { id: _ID, created_at: _CREATED_AT, sourceUrl, ...recipeData } = recipe

        // Handle image upload if a File object is provided
        if (recipeData.image instanceof File) {
            recipeData.image = await this.uploadImage(recipeData.image);
        }

        const payload = toDbFormat(recipeData)

        const { data, error } = await supabase
            .from('recipes')
            .update(payload)
            .eq('id', recipe.id) // Use recipe.id here since we stripped it from recipeData
            .select()
            .single()

        if (error) throw error

        // Handle Source URL Update
        // Strategy: Delete existing and insert new one if exists. 
        // This ensures clean state for the single-URL UI model.
        if (sourceUrl !== undefined) {
            // 1. Delete existing
            await supabase.from('recipe_sources').delete().eq('recipe_id', recipe.id);

            // 2. Insert if has value
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

    async exportAllRecipes() {
        // Fetch all data for backup
        // We reuse fetchRecipes to get the clean frontend format
        return await this.fetchRecipes();
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

    // UNPACKING STRATEGY:
    // Check for _meta item
    if (Array.isArray(rawIngs) && rawIngs.length > 0 && rawIngs[0]._meta) {
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
            flours = dataItems.filter(i => i._group === 'flour').map(({ _group: _GROUP, ...i }) => i);
            breadIngredients = dataItems.filter(i => i._group === 'other').map(({ _group: _GROUP, ...i }) => i);
            // For standard views, we might want a combined list
            cleanIngredients = [...flours, ...breadIngredients];
        } else {
            cleanIngredients = dataItems;
        }
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
        sourceUrl: (recipe.recipe_sources && recipe.recipe_sources.length > 0) ? recipe.recipe_sources[0].url : ''
    }
}

const fromDeletedDbFormat = (recipe) => ({
    ...fromDbFormat(recipe),
    deletedAt: recipe.deleted_at,
    originalId: recipe.original_id
})
