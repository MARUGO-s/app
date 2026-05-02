import { costFromQuantityAndUnit, normalizeUnit, normalizedCostPer1000 } from './unitUtils';
import { computeRecipeTotalCostTaxIncluded } from '../services/categoryCostOverrideService';

export const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
};

export const getRecipeIngredients = (recipe) => {
    if (!recipe || typeof recipe !== 'object') return [];
    if (recipe.type === 'bread') {
        return [...(recipe.flours || []), ...(recipe.breadIngredients || [])].filter(Boolean);
    }
    return Array.isArray(recipe.ingredients) ? recipe.ingredients.filter(Boolean) : [];
};

export const computeBatchStats = (ingredients) => {
    let totalWeightGrams = 0;
    let totalVolumeMl = 0;
    for (const item of ingredients) {
        const qty = toFiniteNumber(item?.quantity);
        if (!Number.isFinite(qty)) continue;
        const unit = normalizeUnit(item?.unit || '');
        if (unit === 'g') totalWeightGrams += qty;
        if (unit === 'kg') totalWeightGrams += qty * 1000;
        if (unit === 'ml' || unit === 'cc') totalVolumeMl += qty;
        if (unit === 'cl') totalVolumeMl += qty * 10;
        if (unit === 'l') totalVolumeMl += qty * 1000;
    }

    const hasWeightBasis = totalWeightGrams > 0;
    const hasVolumeBasis = totalVolumeMl > 0;
    const defaultBatchAmount = (hasWeightBasis || hasVolumeBasis) ? (totalWeightGrams + totalVolumeMl) : NaN;
    const defaultUnit = hasWeightBasis ? 'g' : (hasVolumeBasis ? 'ml' : 'g');

    return {
        totalWeightGrams,
        totalVolumeMl,
        defaultBatchAmount,
        defaultUnit,
    };
};

export const isTax10Category = (category) => {
    const normalized = String(category || '').trim().toLowerCase();
    return normalized === 'alcohol' || normalized === 'supplies';
};

export const getIngredientTaxRate = (ingredient) => (isTax10Category(ingredient?.itemCategory) ? 1.10 : 1.08);

export const getDefaultUsageUnit = (packetUnit) => {
    const unit = normalizeUnit(packetUnit);
    if (unit === 'g' || unit === 'kg') return 'g';
    if (unit === 'ml' || unit === 'cc' || unit === 'cl' || unit === 'l') return 'ml';
    return unit || '個';
};

export const normalizeIngredientCandidate = (item) => {
    const basePrice = toFiniteNumber(item?.price);
    const packetSize = toFiniteNumber(item?.size);
    const packetUnit = normalizeUnit(item?.unit || '');
    const defaultUsageUnit = getDefaultUsageUnit(packetUnit);
    const unitCostTaxExcluded = Number.isFinite(basePrice) && Number.isFinite(packetSize) && packetSize > 0
        ? normalizedCostPer1000(basePrice, packetSize, packetUnit)
        : basePrice;

    return {
        name: String(item?.name || '').trim(),
        source: item?.source || '',
        displaySource: item?.displaySource || '',
        price: Number.isFinite(basePrice) ? basePrice : null,
        packetSize: Number.isFinite(packetSize) ? packetSize : null,
        packetUnit,
        unit: defaultUsageUnit,
        defaultUsageUnit,
        unitCostTaxExcluded: Number.isFinite(unitCostTaxExcluded) ? Math.round(unitCostTaxExcluded * 100) / 100 : null,
        itemCategory: item?.itemCategory || item?.item_category || null,
    };
};

export const normalizeSavedIngredient = (item) => {
    const normalized = normalizeIngredientCandidate({
        name: item?.name,
        source: item?.source,
        displaySource: item?.displaySource,
        price: item?.price,
        size: item?.packetSize,
        unit: item?.packetUnit || item?.unit,
        itemCategory: item?.itemCategory,
    });
    const savedUnitCost = toFiniteNumber(item?.unitCostTaxExcluded);
    return {
        ...normalized,
        unit: item?.unit || normalized.unit,
        defaultUsageUnit: item?.defaultUsageUnit || normalized.defaultUsageUnit,
        unitCostTaxExcluded: Number.isFinite(savedUnitCost) ? savedUnitCost : normalized.unitCostTaxExcluded,
    };
};

export const buildRecipeMetrics = (recipe, overrideMap = new Map()) => {
    if (!recipe) return null;
    const ingredients = getRecipeIngredients(recipe);
    const stats = computeBatchStats(ingredients);
    return {
        recipeId: String(recipe.id || ''),
        title: recipe.title || '無題',
        ingredients,
        totalCostTaxIncluded: computeRecipeTotalCostTaxIncluded(
            { ...recipe, ingredients },
            overrideMap || new Map()
        ),
        ...stats,
    };
};

export const computeCompositeFinancials = ({ totalCompositeCost, salesPrice, salesCount }) => {
    const price = toFiniteNumber(salesPrice);
    const count = toFiniteNumber(salesCount);
    const hasPrice = Number.isFinite(price) && price > 0;
    const hasCount = Number.isFinite(count) && count > 0;
    const unitCost = Number.isFinite(totalCompositeCost) ? totalCompositeCost : NaN;
    const totalSales = hasPrice && hasCount ? price * count : NaN;
    const totalCostForSales = Number.isFinite(unitCost) && hasCount ? unitCost * count : NaN;
    const grossProfit = Number.isFinite(totalSales) && Number.isFinite(totalCostForSales)
        ? totalSales - totalCostForSales
        : NaN;
    const costRate = hasPrice && Number.isFinite(unitCost)
        ? (unitCost / price) * 100
        : NaN;

    return {
        price,
        count,
        totalSales,
        totalCostForSales,
        unitCost,
        grossProfit,
        costRate,
    };
};

export const computeCompositeSnapshotTotals = ({
    baseRecipe,
    snapshot,
    recipeDetailsById = {},
    overrideMapsByRecipe = {},
}) => {
    const safeSnapshot = snapshot || {};
    const baseMetrics = buildRecipeMetrics(
        baseRecipe,
        overrideMapsByRecipe[String(baseRecipe?.id || '')] || new Map()
    );
    const baseUsage = toFiniteNumber(safeSnapshot?.currentUsageAmount);
    const baseBatch = toFiniteNumber(baseMetrics?.defaultBatchAmount);
    const baseUnitCost = (baseMetrics && Number.isFinite(baseBatch) && baseBatch > 0)
        ? (baseMetrics.totalCostTaxIncluded / baseBatch)
        : NaN;
    const currentLineCost = (Number.isFinite(baseUnitCost) && Number.isFinite(baseUsage) && baseUsage >= 0)
        ? baseUnitCost * baseUsage
        : NaN;

    const rowLineCosts = [];
    const missingRecipeIds = new Set();

    for (const rawRow of Array.isArray(safeSnapshot?.rows) ? safeSnapshot.rows : []) {
        if (rawRow?.itemType === 'ingredient' || rawRow?.ingredient) {
            const ingredient = normalizeSavedIngredient(rawRow?.ingredient || {});
            const use = toFiniteNumber(rawRow?.usageAmount);
            const unit = rawRow?.usageUnit || ingredient?.defaultUsageUnit || ingredient?.unit || 'g';
            const unitCost = toFiniteNumber(ingredient?.unitCostTaxExcluded);
            const taxExcluded = costFromQuantityAndUnit(use, unitCost, unit);
            const lineCost = Number.isFinite(taxExcluded)
                ? taxExcluded * getIngredientTaxRate(ingredient)
                : NaN;
            rowLineCosts.push(lineCost);
            continue;
        }

        const recipeId = String(rawRow?.recipeId || '').trim();
        const detail = recipeDetailsById[recipeId];
        if (!recipeId || !detail) {
            if (recipeId) missingRecipeIds.add(recipeId);
            rowLineCosts.push(NaN);
            continue;
        }

        const metrics = buildRecipeMetrics(
            detail,
            overrideMapsByRecipe[recipeId] || new Map()
        );
        const batch = toFiniteNumber(metrics?.defaultBatchAmount);
        const use = toFiniteNumber(rawRow?.usageAmount);
        const unitCost = (metrics && Number.isFinite(batch) && batch > 0)
            ? (metrics.totalCostTaxIncluded / batch)
            : NaN;
        const lineCost = (Number.isFinite(unitCost) && Number.isFinite(use) && use >= 0)
            ? unitCost * use
            : NaN;
        rowLineCosts.push(lineCost);
    }

    let totalCompositeCost = 0;
    if (Number.isFinite(currentLineCost)) totalCompositeCost += currentLineCost;
    for (const lineCost of rowLineCosts) {
        if (Number.isFinite(lineCost)) totalCompositeCost += lineCost;
    }

    return {
        totalCompositeCost,
        currentLineCost,
        rowLineCosts,
        missingRecipeIds: [...missingRecipeIds],
    };
};
