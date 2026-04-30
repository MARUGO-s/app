import { supabase } from '../supabase';

const SKIP_GROUP_NAMES = new Set(['作り方', 'steps', 'method', '手順']);

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
};

const normalizeCategoryName = (name) => String(name || '').trim().toLowerCase();

const isTax10Item = (item) => {
    const category = String(item?.itemCategory ?? item?.item_category ?? '').trim().toLowerCase();
    if (category === 'alcohol' || category === 'supplies') return true;
    return Boolean(item?.isAlcohol);
};

const getItemTaxRate = (item) => (isTax10Item(item) ? 1.10 : 1.08);

const getRecipeIngredients = (recipe) => {
    if (!recipe || typeof recipe !== 'object') return [];
    if (recipe.type === 'bread') {
        return [...(recipe.flours || []), ...(recipe.breadIngredients || [])].filter(Boolean);
    }
    return Array.isArray(recipe.ingredients) ? recipe.ingredients.filter(Boolean) : [];
};

const getScaledCostTaxIncluded = (item, multiplier = 1) => {
    const rawCost = toFiniteNumber(item?.cost);
    if (!Number.isFinite(rawCost)) return 0;
    const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
    return rawCost * safeMultiplier * getItemTaxRate(item);
};

const buildGroupEntry = (categoryKey, categoryName, ingredients, multiplier = 1) => {
    const costTaxIncluded = ingredients.reduce((sum, item) => sum + getScaledCostTaxIncluded(item, multiplier), 0);
    return {
        categoryKey,
        categoryName,
        ingredients,
        costTaxIncluded,
    };
};

export const getRecipeCostCategories = (recipe, { multiplier = 1 } = {}) => {
    const ingredients = getRecipeIngredients(recipe);
    if (ingredients.length === 0) return [];

    const groups = Array.isArray(recipe?.ingredientGroups) ? recipe.ingredientGroups : [];
    if (groups.length > 0) {
        const entries = groups
            .filter((group) => !SKIP_GROUP_NAMES.has(normalizeCategoryName(group?.name)))
            .map((group) => {
                const groupIngredients = ingredients.filter((item) => item?.groupId === group.id);
                if (groupIngredients.length === 0) return null;
                return buildGroupEntry(
                    `group:${String(group.id)}`,
                    String(group.name || 'カテゴリ'),
                    groupIngredients,
                    multiplier
                );
            })
            .filter(Boolean);

        const groupedIds = new Set(groups.map((group) => String(group.id)));
        const ungrouped = ingredients.filter((item) => !item?.groupId || !groupedIds.has(String(item.groupId)));
        if (ungrouped.length > 0) {
            entries.push(buildGroupEntry('group:ungrouped', '未分類', ungrouped, multiplier));
        }
        return entries;
    }

    return [
        buildGroupEntry('group:all', '全材料', ingredients, multiplier),
    ];
};

export const computeRecipeTotalCostTaxIncluded = (recipe, overrideMap = new Map(), { multiplier = 1 } = {}) => {
    const categories = getRecipeCostCategories(recipe, { multiplier });
    const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
    return categories.reduce((sum, category) => {
        const overridden = toFiniteNumber(overrideMap.get(category.categoryKey));
        return sum + (Number.isFinite(overridden) ? (overridden * safeMultiplier) : category.costTaxIncluded);
    }, 0);
};

const toOverrideMap = (rows) => {
    const map = new Map();
    for (const row of rows || []) {
        const key = String(row?.category_key || '').trim();
        const value = toFiniteNumber(row?.overridden_cost_tax_included);
        if (!key || !Number.isFinite(value)) continue;
        map.set(key, value);
    }
    return map;
};

export const categoryCostOverrideService = {
    async fetchByRecipeId(recipeId) {
        if (!recipeId) return new Map();
        const { data, error } = await supabase
            .from('recipe_category_cost_overrides')
            .select('category_key, overridden_cost_tax_included')
            .eq('recipe_id', recipeId);
        if (error) throw error;
        return toOverrideMap(data || []);
    },

    async upsertForRecipeCategory({ recipeId, categoryKey, categoryName, overriddenCostTaxIncluded }) {
        const numericCost = toFiniteNumber(overriddenCostTaxIncluded);
        if (!recipeId || !categoryKey || !Number.isFinite(numericCost) || numericCost < 0) {
            throw new Error('カテゴリ原価の保存パラメータが不正です。');
        }

        const payload = {
            recipe_id: recipeId,
            category_key: categoryKey,
            category_name: categoryName || null,
            overridden_cost_tax_included: Math.round(numericCost * 100) / 100,
        };

        const { data: existing, error: checkError } = await supabase
            .from('recipe_category_cost_overrides')
            .select('id')
            .eq('recipe_id', recipeId)
            .eq('category_key', categoryKey)
            .limit(1);
        if (checkError) throw checkError;

        if (Array.isArray(existing) && existing.length > 0) {
            const { error: updateError } = await supabase
                .from('recipe_category_cost_overrides')
                .update({
                    category_name: payload.category_name,
                    overridden_cost_tax_included: payload.overridden_cost_tax_included,
                })
                .eq('recipe_id', recipeId)
                .eq('category_key', categoryKey);
            if (updateError) throw updateError;
            return payload;
        }

        const { error: insertError } = await supabase
            .from('recipe_category_cost_overrides')
            .insert(payload);
        if (insertError) throw insertError;
        return payload;
    },
};

