import { applyImportedRecipeType } from './importRecipeType';

const stepGroupKeywords = ['作り方', '手順', 'method', 'instructions', 'steps', 'preparation'];

/**
 * URL/画像/PDF取り込みの生データをフォーム・保存用に正規化
 */
export const normalizeImportedRecipe = (raw) => {
    const finalRecipe = { ...(raw || {}) };

    finalRecipe.title = finalRecipe.title || finalRecipe.name || '';
    finalRecipe.name = finalRecipe.name || finalRecipe.title || '';
    finalRecipe.recipeYield = finalRecipe.recipeYield || finalRecipe.servings || '';
    finalRecipe.description = finalRecipe.description || '';

    if (!finalRecipe.ingredients && finalRecipe.recipeIngredient) {
        finalRecipe.ingredients = finalRecipe.recipeIngredient;
    }

    if (Array.isArray(finalRecipe.ingredients)) {
        const realIngredients = [];
        const extractedSteps = [];

        finalRecipe.ingredients.forEach((ing) => {
            const groupName = (ing?.group || '').trim().toLowerCase();
            if (groupName && stepGroupKeywords.some((k) => groupName === k || groupName.includes(k))) {
                const stepText = ing?.name || ing?.text || '';
                if (stepText) extractedSteps.push(stepText);
            } else {
                realIngredients.push(ing);
            }
        });

        if (extractedSteps.length > 0) {
            finalRecipe.ingredients = realIngredients;
            finalRecipe.steps = Array.isArray(finalRecipe.steps) ? finalRecipe.steps : [];
            finalRecipe.steps = [...finalRecipe.steps, ...extractedSteps];
        }
    }

    return finalRecipe;
};

const mapBreadItem = (item) => {
    if (typeof item === 'string') {
        return {
            id: crypto.randomUUID(),
            name: item,
            quantity: '',
            unit: 'g',
            cost: '',
            purchaseCost: '',
            isAlcohol: false,
            itemCategory: null,
        };
    }
    return {
        id: crypto.randomUUID(),
        name: item?.name || '',
        quantity: item?.quantity ?? '',
        unit: item?.unit || 'g',
        cost: item?.cost ?? '',
        purchaseCost: item?.purchaseCost ?? '',
        isAlcohol: Boolean(item?.isAlcohol),
        itemCategory: item?.itemCategory ?? item?.item_category ?? null,
    };
};

/**
 * 取り込みデータを recipeService.createRecipe 向けペイロードへ変換
 */
export const mapImportedRecipeToSavePayload = (importedData, {
    sourceUrl = '',
    category = '',
    importOptions = {},
} = {}) => {
    const importTypeMode = importOptions?.mode === 'image' || importOptions?.mode === 'pdf'
        ? (importOptions?.recipeType === 'bread' ? 'bread' : 'normal')
        : 'auto';

    const typedImportedData = applyImportedRecipeType(
        normalizeImportedRecipe(importedData),
        importTypeMode,
    );

    const groupMap = new Map();
    const rawIngredients = typedImportedData.ingredients || [];

    rawIngredients.forEach((ing) => {
        let gName = ing?.group || '材料';
        if (gName === 'Main') gName = '材料';
        if (!groupMap.has(gName)) {
            groupMap.set(gName, crypto.randomUUID());
        }
    });

    const ingredientGroups = Array.from(groupMap.entries()).map(([name, id]) => ({ id, name }));

    const cappedIngredients = rawIngredients.slice(0, 198);

    const ingredients = cappedIngredients.map((ing) => {
        let gName = ing?.group || '材料';
        if (gName === 'Main') gName = '材料';
        const groupId = groupMap.has(gName) ? groupMap.get(gName) : undefined;
        return {
            id: crypto.randomUUID(),
            name: ing?.name || '',
            quantity: ing?.quantity || '',
            unit: ing?.unit || '',
            cost: '',
            purchaseCost: '',
            groupId,
        };
    });

    const stepGroupMap = new Map();
    const rawSteps = typedImportedData.steps || [];

    rawSteps.forEach((step) => {
        if (typeof step === 'object' && step?.group && step.group !== 'Main') {
            if (!stepGroupMap.has(step.group)) {
                stepGroupMap.set(step.group, crypto.randomUUID());
            }
        }
    });

    const stepGroups = Array.from(stepGroupMap.entries()).map(([name, id]) => ({ id, name }));

    const steps = rawSteps.map((step) => {
        const isObj = typeof step === 'object';
        const text = isObj ? (step?.text || '') : step;
        const groupName = isObj ? step?.group : null;
        const groupId = groupName && stepGroupMap.has(groupName) ? stepGroupMap.get(groupName) : undefined;
        return { id: crypto.randomUUID(), text, groupId };
    });

    const resolvedCategory = category
        || (sourceUrl ? '取り込み' : (typedImportedData.category || ''));

    return {
        title: typedImportedData.name || typedImportedData.title || '',
        description: typedImportedData.description || '',
        category: resolvedCategory,
        image: typedImportedData.image || '',
        servings: typedImportedData.recipeYield || typedImportedData.servings || '',
        ingredients,
        ingredientGroups,
        steps,
        stepGroups,
        type: typedImportedData.type || 'normal',
        flours: typedImportedData.type === 'bread'
            ? (typedImportedData.flours || []).map(mapBreadItem)
            : [],
        breadIngredients: typedImportedData.type === 'bread'
            ? (typedImportedData.breadIngredients || []).map(mapBreadItem)
            : [],
        tags: Array.isArray(typedImportedData.tags) ? typedImportedData.tags : [],
        sourceUrl: sourceUrl || '',
    };
};
