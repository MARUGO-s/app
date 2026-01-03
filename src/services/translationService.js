import { supabase } from '../supabase';

// API Key is now managed in Supabase Secrets (Edge Function)
// const DEEPL_API_URL is handled in the Edge Function


export const translationService = {
    /**
     * Translates a recipe object to the target language
     * @param {Object} recipe 
     * @param {string} targetLang 'EN-US', 'JA', etc.
     */
    async translateRecipe(recipe, targetLang = 'EN-US') {
        // Collect all text to translate in a specific order to minimize API calls
        // 1. Title
        // 2. Description
        // 3. Ingredients (names)
        // 4. Steps
        const textsToTranslate = [];

        // Push Title (Index 0)
        textsToTranslate.push(recipe.title || "");

        // Push Description (Index 1)
        textsToTranslate.push(recipe.description || "");

        // Ingredients start at Index 2
        const ingredientsStart = 2;
        const ingredients = recipe.ingredients || [];
        ingredients.forEach(ing => {
            textsToTranslate.push(typeof ing === 'string' ? ing : ing.name);
        });

        // Steps start after ingredients
        const stepsStart = ingredientsStart + ingredients.length;
        const steps = recipe.steps || [];
        steps.forEach(step => {
            textsToTranslate.push(step);
        });

        if (textsToTranslate.length === 0) return recipe;

        try {
            const translatedTexts = await this.translateList(textsToTranslate, targetLang);

            // Reconstruct recipe
            const newRecipe = { ...recipe };

            newRecipe.title = translatedTexts[0];
            newRecipe.description = translatedTexts[1];

            // Map ingredients back
            newRecipe.ingredients = ingredients.map((ing, i) => {
                const translatedName = translatedTexts[ingredientsStart + i];
                if (typeof ing === 'string') return translatedName;
                return { ...ing, name: translatedName };
                // Note: We don't translate units/quantities automatically as they might not change or might be complex
            });

            // Map steps back
            newRecipe.steps = steps.map((_, i) => translatedTexts[stepsStart + i]);

            return newRecipe;

        } catch (error) {
            console.error("Translation failed:", error);
            throw error;
        }
    },

    /**
     * Calls DeepL API
     * @param {string[]} textArray 
     * @param {string} targetLang 
     */
    async translateList(textArray, targetLang) {
        // Use Supabase Edge Function to proxy the request securely
        const { data, error } = await supabase.functions.invoke('translate', {
            body: {
                text: textArray,
                target_lang: targetLang
            }
        });

        if (error) {
            console.error("Supabase Function Invocation Error:", error);
            throw new Error(`Translation Error: ${error.message}`);
        }

        if (data && data.error) {
            console.error("Edge Function returned error:", data.error);
            throw new Error(`Translation Error: ${data.error}`);
        }

        return data.translations.map(t => t.text);
    }
};
