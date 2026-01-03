import { supabase } from '../supabase'

export const recipeService = {
    async fetchRecipes() {
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error
        return data.map(fromDbFormat)
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
        const { id, created_at, ...recipeData } = recipe

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
        return fromDbFormat(data)
    },

    async updateRecipe(recipe) {
        const { id, created_at, ...recipeData } = recipe

        // Handle image upload if a File object is provided
        if (recipeData.image instanceof File) {
            recipeData.image = await this.uploadImage(recipeData.image);
        }

        const payload = toDbFormat(recipeData)

        const { data, error } = await supabase
            .from('recipes')
            .update(payload)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return fromDbFormat(data)
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
        // We will prioritize "original_id" if we want, but let's just make a new record to avoid collisions if identity column issues arise.
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
    }
}

// Helpers to map between frontend (camelCase) and DB (snake_case)
const toDbFormat = (recipe) => {
    // Explicitly destructure to remove camelCase keys
    const { prepTime, cookTime, imageFile, ...rest } = recipe

    return {
        ...rest,
        prep_time: prepTime,
        cook_time: cookTime,
        // Ensure arrays
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        tags: recipe.tags || []
    }
}

const fromDbFormat = (recipe) => ({
    ...recipe,
    prepTime: recipe.prep_time,
    cookTime: recipe.cook_time,
})

const fromDeletedDbFormat = (recipe) => ({
    ...fromDbFormat(recipe),
    deletedAt: recipe.deleted_at,
    originalId: recipe.original_id
})
