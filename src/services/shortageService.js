import { plannerService } from './plannerService';
import { recipeService } from './recipeService';
import { inventoryService } from './inventoryService';
import { purchasePriceService } from './purchasePriceService';
import { unitConversionService } from './unitConversionService';
import { csvUnitOverrideService } from './csvUnitOverrideService';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';
import { MEASURABLE_UNITS } from '../utils/unitUtils.js';

const normalize = (s) => (s ?? '').toString().trim();
const normalizeUnit = (u) => {
    const s = normalize(u);
    if (!s) return '';
    const lower = s.toLowerCase();
    if (lower === 'ｇ') return 'g';
    if (lower === 'ｍｌ') return 'ml';
    if (lower === 'ｃｃ') return 'cc';
    if (lower === 'ｋｇ') return 'kg';
    if (lower === 'ｌ') return 'l';
    if (lower === 'ｃｌ') return 'cl';
    return lower;
};

const isCountUnit = (uRaw) => {
    const u = normalize(uRaw);
    if (!u) return false;
    return ['本', '個', '袋', '枚', 'パック', '缶', '箱', 'PC', 'pc', '包'].includes(u);
};

const toBaseUnit = (qtyRaw, unitRaw) => {
    const qty = parseFloat(qtyRaw) || 0;
    const u = normalizeUnit(unitRaw);
    if (u === 'kg') return { qty: qty * 1000, unit: 'g' };
    if (u === 'g') return { qty, unit: 'g' };
    if (u === 'l') return { qty: qty * 1000, unit: 'ml' };
    if (u === 'cc') return { qty, unit: 'ml' };
    if (u === 'ml') return { qty, unit: 'ml' };
    if (u === 'cl') return { qty: qty * 10, unit: 'ml' }; // 1 cl = 10 ml（海外表記）
    return { qty, unit: normalize(unitRaw) || '' };
};

const normalizeByMasterIfNeeded = (name, qtyRaw, unitRaw, conv) => {
    const unit = normalize(unitRaw);
    const qty = parseFloat(qtyRaw) || 0;
    if (!conv) return toBaseUnit(qty, unit);
    const packetSize = parseFloat(conv.packetSize);
    const packetUnit = normalizeUnit(conv.packetUnit);
    if (!Number.isFinite(packetSize) || packetSize <= 0 || !packetUnit) return toBaseUnit(qty, unit);

    const masterIsMeasurable = MEASURABLE_UNITS.includes(packetUnit);
    if (masterIsMeasurable && isCountUnit(unit)) {
        const content = qty * packetSize;
        return toBaseUnit(content, packetUnit);
    }
    return toBaseUnit(qty, unit);
};

export const shortageService = {
    async calculateShortages(user, startDateStr, endDateStr, options = {}) {
        if (!user?.id) throw new Error('User required');
        const includeRecipeBreakdown = options?.includeRecipeBreakdown === true;

        // 1. Get Plans
        const allPlans = await plannerService.getAll(user.id);
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);

        const mealsToCook = [];

        Object.keys(allPlans).forEach(dateStr => {
            const planDate = new Date(dateStr);
            if (planDate >= start && planDate <= end) {
                allPlans[dateStr].forEach(meal => {
                    mealsToCook.push(meal);
                });
            }
        });

        if (mealsToCook.length === 0) {
            if (includeRecipeBreakdown) {
                return { items: [], recipeBreakdown: [] };
            }
            return [];
        }

        // 2. Fetch Recipes Details / Master Data
        const [allRecipes, conversions, csvPriceMap, inventoryRaw, csvUnitOverrides] = await Promise.all([
            recipeService.fetchRecipes(user),
            unitConversionService.getAllConversions(),
            purchasePriceService.fetchPriceList(user.id),
            inventoryService.getAll(user.id),
            csvUnitOverrideService.getAll(user.id),
        ]);

        const recipesMap = new Map();
        allRecipes.forEach(r => recipesMap.set(r.id, r));

        const convByKey = new Map();
        try {
            for (const [rawName, row] of (conversions || new Map()).entries()) {
                const k = normalizeIngredientKey(rawName);
                if (!k) continue;
                if (!convByKey.has(k)) convByKey.set(k, row);
            }
        } catch { /* ignore */ }

        const overrideByKey = new Map();
        try {
            for (const [rawName, unit] of (csvUnitOverrides || new Map()).entries()) {
                const k = normalizeIngredientKey(rawName);
                if (!k) continue;
                if (!overrideByKey.has(k)) overrideByKey.set(k, unit);
            }
        } catch { /* ignore */ }

        const inventoryByKey = new Map();
        try {
            (inventoryRaw || []).forEach((row) => {
                const k = normalizeIngredientKey(row?.name);
                if (!k) return;
                if (!inventoryByKey.has(k)) inventoryByKey.set(k, row);
            });
        } catch { /* ignore */ }


        // 3. Aggregate Ingredients (normalized)
        const totals = {}; // name -> { quantity, unit }
        const recipeBreakdownMap = new Map();

        mealsToCook.forEach(meal => {
            const recipe = recipesMap.get(meal.recipeId);
            if (!recipe) return;

            let breakdownEntry = null;
            if (includeRecipeBreakdown) {
                const recipeKey = String(recipe.id);
                if (!recipeBreakdownMap.has(recipeKey)) {
                    recipeBreakdownMap.set(recipeKey, {
                        recipeId: recipe.id,
                        recipeTitle: recipe.title || `Recipe ${recipe.id}`,
                        itemMap: new Map(),
                    });
                }
                breakdownEntry = recipeBreakdownMap.get(recipeKey);
            }

            let scale = 1;

            // Determine Scale Factor
            if (meal.totalWeight && meal.totalWeight > 0) {
                // Calculate original weight of the recipe (sum of simple units)
                let originalWeight = 0;
                (recipe.ingredients || []).forEach(ing => {
                    const { qty, unit } = toBaseUnit(ing.quantity, ing.unit);
                    // Treat g and ml as 1:1 for dough weight approximation
                    if (unit === 'g' || unit === 'ml') {
                        originalWeight += qty;
                    }
                });

                if (originalWeight > 0) {
                    scale = meal.totalWeight / originalWeight;
                }
            } else if (meal.multiplier && meal.multiplier > 0) {
                scale = meal.multiplier;
            }

            const ingredients = recipe.ingredients || [];
            // ingredients array already contains flours and breadIngredients due to recipeService.fromDbFormat logic
            // providing a combined list. Merging them again causes double counting.
            const allIngs = [...ingredients];


            allIngs.forEach(ing => {
                if (!ing.name) return;
                const name = normalize(ing.name);
                const key = normalizeIngredientKey(name);
                const conv = (key ? convByKey.get(key) : null) || (conversions?.get(name) || null);

                // Apply Scale
                const scaledQtyRaw = (parseFloat(ing.quantity) || 0) * scale;

                const normalizedIng = normalizeByMasterIfNeeded(name, scaledQtyRaw, ing.unit, conv);
                const qty = normalizedIng.qty || 0;
                const unit = normalizedIng.unit || '';

                if (!totals[name]) {
                    totals[name] = { quantity: 0, unit: unit, count: 0 };
                }

                totals[name].quantity += qty;

                if (includeRecipeBreakdown && breakdownEntry) {
                    const breakdownKey = key || name;
                    const existing = breakdownEntry.itemMap.get(breakdownKey);
                    if (existing) {
                        existing.required += qty;
                        if (!existing.unit && unit) existing.unit = unit;
                    } else {
                        breakdownEntry.itemMap.set(breakdownKey, {
                            ingredientKey: breakdownKey,
                            name,
                            required: qty,
                            unit,
                        });
                    }
                }
            });
        });

        // 4. Calculate Shortages
        const results = Object.keys(totals).map(name => {
            const req = totals[name];
            const key = normalizeIngredientKey(name);
            const conv = (key ? convByKey.get(key) : null) || (conversions?.get(name) || null);
            const csvEntry = (key ? (csvPriceMap?.get(key) || null) : null);

            const stockItem = key ? (inventoryByKey.get(key) || null) : null;
            const stockNorm = normalizeByMasterIfNeeded(name, stockItem?.quantity ?? 0, stockItem?.unit ?? req.unit, conv);

            const required = req.quantity || 0;
            const stock = stockNorm.qty || 0;
            const unit = req.unit || stockNorm.unit || '';
            const remaining = stock - required;

            const packetSize = parseFloat(conv?.packetSize);
            const packetUnit = normalize(conv?.packetUnit);
            const hasPack = Number.isFinite(packetSize) && packetSize > 0 && !!packetUnit;

            const minRemaining = hasPack ? (packetSize * 0.2) : 0;
            const needsOrderByRule = hasPack ? (remaining < minRemaining) : false;

            const csvOrderUnit = csvEntry?.unit ? String(csvEntry.unit).trim() : '';
            const overrideUnit = (key && overrideByKey.has(key)) ? String(overrideByKey.get(key)).trim() : '';
            const orderUnitLabel = (overrideUnit ? overrideUnit : '') || (csvOrderUnit ? csvOrderUnit : '') || '袋';

            const packPrice = (conv?.lastPrice !== null && conv?.lastPrice !== undefined && conv?.lastPrice !== '' ? parseFloat(conv.lastPrice) : null) ??
                (csvEntry?.price !== null && csvEntry?.price !== undefined ? parseFloat(csvEntry.price) : null);

            let orderPacks = null;
            let orderQty = 0;
            let orderUnit = unit;

            if (hasPack) {
                const additionalNeeded = Math.max(0, minRemaining - remaining);
                orderPacks = Math.ceil(additionalNeeded / packetSize);
                if (needsOrderByRule && orderPacks < 1) orderPacks = 1;
                orderQty = orderPacks;
                orderUnit = orderUnitLabel;
            } else {
                orderQty = Math.max(0, required - stock);
                orderUnit = unit;
            }

            const shouldShow = hasPack ? needsOrderByRule : orderQty > 0.01;

            return {
                name,
                required,
                stock,
                remaining,
                unit,
                shouldShow,
                toOrder: orderQty,
                orderUnit,
                orderPacks,
                packSize: hasPack ? packetSize : null,
                packUnit: hasPack ? packetUnit : null,
                packPrice: Number.isFinite(packPrice) ? packPrice : null,
                vendor: csvEntry?.vendor || stockItem?.vendor || '',
            };
        }).filter(i => i.shouldShow);

        if (!includeRecipeBreakdown) {
            return results;
        }

        const recipeBreakdown = Array.from(recipeBreakdownMap.values()).map((section) => ({
            recipeId: section.recipeId,
            recipeTitle: section.recipeTitle,
            items: Array.from(section.itemMap.values())
                .filter((item) => Number(item.required || 0) > 0.0001),
        }));

        return {
            items: results,
            recipeBreakdown,
        };
    }
};
