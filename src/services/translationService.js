import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../supabase';

// API Key is now managed in Supabase Secrets (Edge Function)
// const DEEPL_API_URL is handled in the Edge Function

const TRANSLATION_SCHEMA_VERSION = 2;

const isTextualQuantity = (value) => {
    if (typeof value !== 'string') return false;
    const text = value.trim();
    if (!text) return false;
    // Pure numeric expressions (e.g. "1", "2.5", "1/2", "2〜3") don't need translation.
    return !/^[\d０-９\s.,+\-/%~〜]+$/.test(text);
};


export const translationService = {
    /**
     * Translates a recipe object to the target language
     * @param {Object} recipe 
     * @param {string} targetLang 'EN-US', 'JA', etc.
     */
    async translateRecipe(recipe, targetLang = 'EN-US') {
        const textsToTranslate = [];
        const fieldSetters = [];

        const addField = (value, apply) => {
            const original = typeof value === 'string' ? value : String(value ?? '');
            textsToTranslate.push(original);
            fieldSetters.push((translatedText, draft) => {
                const translated = translatedText || original;
                apply(draft, translated, original);
            });
        };

        const cloneArrayObjects = (arr) => (
            Array.isArray(arr)
                ? arr.map((item) => (item && typeof item === 'object' ? { ...item } : item))
                : arr
        );

        const draft = {
            ...recipe,
            ingredients: cloneArrayObjects(recipe.ingredients),
            flours: cloneArrayObjects(recipe.flours),
            breadIngredients: cloneArrayObjects(recipe.breadIngredients),
            steps: cloneArrayObjects(recipe.steps),
            ingredientGroups: cloneArrayObjects(recipe.ingredientGroups),
            stepGroups: cloneArrayObjects(recipe.stepGroups),
        };

        addField(recipe.title || recipe.name || '', (target, translated) => {
            target.title = translated;
            if (target.name !== undefined || recipe.name !== undefined) {
                target.name = translated;
            }
        });

        addField(recipe.description || '', (target, translated) => {
            target.description = translated;
        });

        if (recipe.course) {
            addField(recipe.course, (target, translated) => {
                target.course = translated;
            });
        }
        if (recipe.category) {
            addField(recipe.category, (target, translated) => {
                target.category = translated;
            });
        }
        if (recipe.storeName) {
            addField(recipe.storeName, (target, translated) => {
                target.storeName = translated;
            });
        }

        if (Array.isArray(recipe.ingredientGroups)) {
            recipe.ingredientGroups.forEach((group, groupIndex) => {
                const name = group?.name;
                if (!name) return;
                addField(name, (target, translated) => {
                    if (target.ingredientGroups?.[groupIndex]) {
                        target.ingredientGroups[groupIndex].name = translated;
                    }
                });
            });
        }

        if (Array.isArray(recipe.stepGroups)) {
            recipe.stepGroups.forEach((group, groupIndex) => {
                const name = group?.name;
                if (!name) return;
                addField(name, (target, translated) => {
                    if (target.stepGroups?.[groupIndex]) {
                        target.stepGroups[groupIndex].name = translated;
                    }
                });
            });
        }

        if (recipe.type === 'bread') {
            (recipe.flours || []).forEach((item, index) => {
                if (!item || typeof item !== 'object') return;
                addField(item.name || '', (target, translated) => {
                    if (target.flours?.[index]) target.flours[index].name = translated;
                });
                if (item.unit) {
                    addField(item.unit, (target, translated) => {
                        if (target.flours?.[index]) target.flours[index].unit = translated;
                    });
                }
                if (isTextualQuantity(item.quantity)) {
                    addField(item.quantity, (target, translated) => {
                        if (target.flours?.[index]) target.flours[index].quantity = translated;
                    });
                }
            });

            (recipe.breadIngredients || []).forEach((item, index) => {
                if (!item || typeof item !== 'object') return;
                addField(item.name || '', (target, translated) => {
                    if (target.breadIngredients?.[index]) target.breadIngredients[index].name = translated;
                });
                if (item.unit) {
                    addField(item.unit, (target, translated) => {
                        if (target.breadIngredients?.[index]) target.breadIngredients[index].unit = translated;
                    });
                }
                if (isTextualQuantity(item.quantity)) {
                    addField(item.quantity, (target, translated) => {
                        if (target.breadIngredients?.[index]) target.breadIngredients[index].quantity = translated;
                    });
                }
            });
        } else {
            (recipe.ingredients || []).forEach((ing, index) => {
                if (typeof ing === 'string') {
                    addField(ing, (target, translated) => {
                        if (Array.isArray(target.ingredients)) target.ingredients[index] = translated;
                    });
                    return;
                }
                if (!ing || typeof ing !== 'object') return;

                addField(ing.name || '', (target, translated) => {
                    if (target.ingredients?.[index] && typeof target.ingredients[index] === 'object') {
                        target.ingredients[index].name = translated;
                    }
                });

                if (ing.unit) {
                    addField(ing.unit, (target, translated) => {
                        if (target.ingredients?.[index] && typeof target.ingredients[index] === 'object') {
                            target.ingredients[index].unit = translated;
                        }
                    });
                }

                if (isTextualQuantity(ing.quantity)) {
                    addField(ing.quantity, (target, translated) => {
                        if (target.ingredients?.[index] && typeof target.ingredients[index] === 'object') {
                            target.ingredients[index].quantity = translated;
                        }
                    });
                }
            });
        }

        const steps = recipe.steps || [];
        steps.forEach((step, index) => {
            const text = typeof step === 'object' && step !== null ? (step.text || '') : (step || '');
            addField(text, (target, translated) => {
                const current = target.steps?.[index];
                if (typeof current === 'object' && current !== null) {
                    current.text = translated;
                    return;
                }
                if (Array.isArray(target.steps)) {
                    target.steps[index] = translated;
                }
            });
        });

        if (!textsToTranslate.some((text) => String(text || '').trim().length > 0)) {
            return recipe;
        }

        try {
            const translatedTexts = await this.translateList(textsToTranslate, targetLang);
            fieldSetters.forEach((apply, index) => {
                apply(translatedTexts[index], draft);
            });
            draft.__translationVersion = TRANSLATION_SCHEMA_VERSION;
            return draft;

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
        const normalizedTextArray = (textArray || []).map((text) =>
            typeof text === 'string' ? text : String(text ?? '')
        );

        // Avoid unnecessary API call for completely empty payloads.
        if (!normalizedTextArray.some((text) => text.trim().length > 0)) {
            return normalizedTextArray;
        }

        const functionUrl = `${SUPABASE_URL}/functions/v1/translate`;

        let accessToken = '';
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            accessToken = sessionData?.session?.access_token || '';
            if (!accessToken) {
                const { data: refreshed } = await supabase.auth.refreshSession();
                accessToken = refreshed?.session?.access_token || '';
            }
        } catch (e) {
            console.warn("Could not retrieve session for translation:", e);
        }

        const doFetch = async (token) => {
            const fetchHeaders = {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
            };
            if (token) {
                fetchHeaders['Authorization'] = `Bearer ${token}`;
            }

            return await fetch(functionUrl, {
                method: 'POST',
                headers: fetchHeaders,
                body: JSON.stringify({
                    text: normalizedTextArray,
                    target_lang: targetLang,
                }),
            });
        };

        let res = await doFetch(accessToken);

        if (res.status === 401) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            accessToken = refreshed?.session?.access_token || '';
            if (accessToken) {
                res = await doFetch(accessToken);
            }
        }

        if (!res.ok) {
            const status = res.status;
            let detail = '';
            try {
                const text = await res.text();
                if (text) {
                    try {
                        const parsed = JSON.parse(text);
                        detail = parsed?.error || parsed?.message || text;
                    } catch {
                        detail = text;
                    }
                }
            } catch {
                // ignore
            }
            throw new Error(detail || `Translation Error (${status})`);
        }

        const responseData = await res.json();
        
        if (responseData && responseData.error) {
            console.error("Edge Function returned error:", responseData.error);
            throw new Error(`Translation Error: ${responseData.error}`);
        }

        if (!Array.isArray(responseData?.translations)) {
            console.error("Edge Function returned invalid payload:", responseData);
            throw new Error('Translation Error: invalid response payload');
        }

        return responseData.translations.map(t => t.text);
    }
};
