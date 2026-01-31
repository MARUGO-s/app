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
        const textsToTranslate = [];

        // Push Title (Index 0)
        textsToTranslate.push(recipe.title || "");

        // Push Description (Index 1)
        textsToTranslate.push(recipe.description || "");

        // Unified indices
        let ingredientsStart = 2;
        let stepsStart = 2;

        if (recipe.type === 'bread') {
            const flours = recipe.flours || [];
            const breadIngredients = recipe.breadIngredients || [];

            flours.forEach(f => textsToTranslate.push(f.name || ""));
            breadIngredients.forEach(ing => textsToTranslate.push(ing.name || ""));

            stepsStart = ingredientsStart + flours.length + breadIngredients.length;
        } else {
            const ingredients = recipe.ingredients || [];
            ingredients.forEach(ing => {
                const text = typeof ing === 'string' ? ing : (ing.name || "");
                textsToTranslate.push(text);
            });
            stepsStart = ingredientsStart + ingredients.length;
        }

        const steps = recipe.steps || [];
        steps.forEach(step => {
            // Handle step as object (new format) or string (legacy)
            const text = typeof step === 'object' && step !== null ? (step.text || "") : (step || "");
            textsToTranslate.push(text);
        });

        if (textsToTranslate.length === 0) return recipe;

        try {
            const translatedTexts = await this.translateList(textsToTranslate, targetLang);

            // Reconstruct recipe
            const newRecipe = { ...recipe };

            newRecipe.title = translatedTexts[0];
            newRecipe.description = translatedTexts[1];

            if (recipe.type === 'bread') {
                const floursCount = (recipe.flours || []).length;
                const breadIngCount = (recipe.breadIngredients || []).length;

                newRecipe.flours = (recipe.flours || []).map((f, i) => ({
                    ...f,
                    name: translatedTexts[ingredientsStart + i]
                }));

                newRecipe.breadIngredients = (recipe.breadIngredients || []).map((ing, i) => ({
                    ...ing,
                    name: translatedTexts[ingredientsStart + floursCount + i]
                }));
            } else {
                newRecipe.ingredients = (recipe.ingredients || []).map((ing, i) => {
                    const translatedName = translatedTexts[ingredientsStart + i];
                    if (typeof ing === 'string') return translatedName;
                    return { ...ing, name: translatedName };
                });
            }

            // Map steps back
            newRecipe.steps = steps.map((originalStep, i) => {
                const translatedText = translatedTexts[stepsStart + i];
                if (typeof originalStep === 'object' && originalStep !== null) {
                    return { ...originalStep, text: translatedText };
                }
                return translatedText;
            });

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
