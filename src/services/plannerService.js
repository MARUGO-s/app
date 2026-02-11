import { supabase } from '../supabase';

const TABLE_NAME = 'meal_plans';
const LEGACY_STORAGE_KEY = 'planner_data';
const LOCAL_FALLBACK_WARNING = 'クラウド保存に失敗したため、この操作はローカル保存に切り替えました。';
const MAX_WARNING_QUEUE = 20;

const warningQueue = [];

const getStorageKey = (userId) => `planner_data_${userId}`;

const queueWarning = (message) => {
    if (!message) return;
    const last = warningQueue[warningQueue.length - 1];
    if (last === message) return;
    warningQueue.push(message);
    if (warningQueue.length > MAX_WARNING_QUEUE) {
        warningQueue.splice(0, warningQueue.length - MAX_WARNING_QUEUE);
    }
};

const toNumberOr = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const readPlansFromLocal = (userId) => {
    try {
        if (!userId) return {};
        const data = localStorage.getItem(getStorageKey(userId));
        if (data) return JSON.parse(data);

        const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyData) {
            const parsed = JSON.parse(legacyData);
            savePlansToLocal(userId, parsed);
            return parsed;
        }

        return {};
    } catch {
        return {};
    }
};

const savePlansToLocal = (userId, plans) => {
    if (!userId) return;
    localStorage.setItem(getStorageKey(userId), JSON.stringify(plans));
};

const makeLocalMealId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toRecipeId = (value) => {
    if (typeof value === 'number') return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
};

const normalizeMeal = (row) => ({
    id: String(row.id),
    recipeId: toRecipeId(row.recipe_id ?? row.recipeId),
    type: row.meal_type ?? row.type ?? 'dinner',
    note: row.note ?? '',
    multiplier: toNumberOr(row.multiplier, 1),
    totalWeight: toNumberOr(row.total_weight ?? row.totalWeight, null),
});

const normalizeDateStr = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

const rowsToPlans = (rows) => {
    const plans = {};
    (rows || []).forEach((row) => {
        const dateStr = normalizeDateStr(row.plan_date ?? row.planDate);
        if (!dateStr) return;
        if (!plans[dateStr]) plans[dateStr] = [];
        plans[dateStr].push(normalizeMeal(row));
    });
    return plans;
};

const flattenPlansForInsert = (userId, plans) => {
    const rows = [];
    Object.keys(plans || {}).forEach((dateStr) => {
        const meals = plans[dateStr] || [];
        meals.forEach((meal) => {
            rows.push({
                user_id: userId,
                plan_date: dateStr,
                recipe_id: toRecipeId(meal.recipeId),
                meal_type: meal.type || 'dinner',
                note: meal.note || '',
                multiplier: toNumberOr(meal.multiplier, 1),
                total_weight: toNumberOr(meal.totalWeight, null),
            });
        });
    });
    return rows;
};

const addMealToLocalPlans = (plans, dateStr, meal) => {
    const next = { ...(plans || {}) };
    if (!next[dateStr]) next[dateStr] = [];
    next[dateStr] = [...next[dateStr], meal];
    return next;
};

const removeMealFromLocalPlans = (plans, dateStr, mealId) => {
    const next = { ...(plans || {}) };
    if (!next[dateStr]) return next;
    next[dateStr] = (next[dateStr] || []).filter((m) => String(m.id) !== String(mealId));
    if (next[dateStr].length === 0) delete next[dateStr];
    return next;
};

const updateMealInLocalPlans = (plans, dateStr, mealId, updates) => {
    const next = { ...(plans || {}) };
    if (!next[dateStr]) return next;
    next[dateStr] = next[dateStr].map((meal) => {
        if (String(meal.id) !== String(mealId)) return meal;
        return { ...meal, ...updates };
    });
    return next;
};

const clearPeriodFromLocalPlans = (plans, startDate, endDate) => {
    const next = { ...(plans || {}) };
    Object.keys(next).forEach((dateStr) => {
        if (dateStr >= startDate && dateStr <= endDate) {
            delete next[dateStr];
        }
    });
    return next;
};

const cleanupInvalidLocalPlans = (plans, validRecipeIds) => {
    const validSet = new Set((validRecipeIds || []).map((id) => String(id)));
    const next = {};
    const invalidIds = [];
    let hasChanges = false;

    Object.keys(plans || {}).forEach((dateStr) => {
        const meals = plans[dateStr] || [];
        const filtered = meals.filter((meal) => {
            const ok = validSet.has(String(meal.recipeId));
            if (!ok) invalidIds.push(String(meal.id));
            return ok;
        });
        if (filtered.length > 0) {
            next[dateStr] = filtered;
        }
        if (filtered.length !== meals.length) {
            hasChanges = true;
        }
    });

    return { nextPlans: hasChanges ? next : plans, invalidIds, hasChanges };
};

const fetchPlansFromSupabase = async (userId) => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id, plan_date, recipe_id, meal_type, note, multiplier, total_weight, created_at')
        .eq('user_id', userId)
        .order('plan_date', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) throw error;
    return rowsToPlans(data || []);
};

const tryBackfillLocalPlansToSupabase = async (userId, localPlans) => {
    const rows = flattenPlansForInsert(userId, localPlans);
    if (rows.length === 0) return null;

    const { error } = await supabase.from(TABLE_NAME).insert(rows);
    if (error) throw error;
    return fetchPlansFromSupabase(userId);
};

export const plannerService = {
    consumeWarnings: () => {
        const messages = [...warningQueue];
        warningQueue.length = 0;
        return messages;
    },

    getAll: async (userId) => {
        if (!userId) return {};

        try {
            const remotePlans = await fetchPlansFromSupabase(userId);
            if (Object.keys(remotePlans).length === 0) {
                const localPlans = readPlansFromLocal(userId);
                if (Object.keys(localPlans).length > 0) {
                    try {
                        const syncedPlans = await tryBackfillLocalPlansToSupabase(userId, localPlans);
                        if (syncedPlans) {
                            savePlansToLocal(userId, syncedPlans);
                            return syncedPlans;
                        }
                    } catch {
                        queueWarning(LOCAL_FALLBACK_WARNING);
                        savePlansToLocal(userId, localPlans);
                        return localPlans;
                    }
                }
            }
            savePlansToLocal(userId, remotePlans);
            return remotePlans;
        } catch (error) {
            console.warn('plannerService.getAll: falling back to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
            return readPlansFromLocal(userId);
        }
    },

    cleanupInvalidPlans: async (userId, validRecipeIds) => {
        if (!userId) return {};
        if (!Array.isArray(validRecipeIds) || validRecipeIds.length === 0) {
            // Guard: do not wipe plans when recipe list fetch fails or returns empty.
            return plannerService.getAll(userId);
        }

        const plans = await plannerService.getAll(userId);
        const { nextPlans, invalidIds, hasChanges } = cleanupInvalidLocalPlans(plans, validRecipeIds);
        if (!hasChanges) return plans;

        try {
            if (invalidIds.length > 0) {
                const chunkSize = 200;
                for (let i = 0; i < invalidIds.length; i += chunkSize) {
                    const chunk = invalidIds.slice(i, i + chunkSize);
                    const { error } = await supabase
                        .from(TABLE_NAME)
                        .delete()
                        .eq('user_id', userId)
                        .in('id', chunk);
                    if (error) throw error;
                }
            }
        } catch (error) {
            console.warn('plannerService.cleanupInvalidPlans: delete fallback to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
        }

        savePlansToLocal(userId, nextPlans);
        return nextPlans;
    },

    addMeal: async (userId, dateStr, recipeId, type, options = {}) => {
        if (!userId) return null;

        const fallbackMeal = {
            id: makeLocalMealId(),
            recipeId: toRecipeId(recipeId),
            type: type || 'dinner',
            note: '',
            multiplier: toNumberOr(options?.multiplier, 1),
            totalWeight: toNumberOr(options?.totalWeight, null),
        };

        try {
            const payload = {
                user_id: userId,
                plan_date: dateStr,
                recipe_id: toRecipeId(recipeId),
                meal_type: type || 'dinner',
                note: '',
                multiplier: toNumberOr(options?.multiplier, 1),
                total_weight: toNumberOr(options?.totalWeight, null),
            };
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .insert([payload])
                .select('id, plan_date, recipe_id, meal_type, note, multiplier, total_weight')
                .single();

            if (error) throw error;

            const meal = normalizeMeal(data);
            const localPlans = readPlansFromLocal(userId);
            const nextPlans = addMealToLocalPlans(localPlans, dateStr, meal);
            savePlansToLocal(userId, nextPlans);
            return meal;
        } catch (error) {
            console.warn('plannerService.addMeal: insert fallback to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
            const localPlans = readPlansFromLocal(userId);
            const nextPlans = addMealToLocalPlans(localPlans, dateStr, fallbackMeal);
            savePlansToLocal(userId, nextPlans);
            return fallbackMeal;
        }
    },

    removeMeal: async (userId, dateStr, mealId) => {
        if (!userId) return;

        try {
            const { error } = await supabase
                .from(TABLE_NAME)
                .delete()
                .eq('id', String(mealId))
                .eq('user_id', userId);
            if (error) throw error;
        } catch (error) {
            console.warn('plannerService.removeMeal: delete fallback to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
        }

        const localPlans = readPlansFromLocal(userId);
        const nextPlans = removeMealFromLocalPlans(localPlans, dateStr, mealId);
        savePlansToLocal(userId, nextPlans);
    },

    updateMeal: async (userId, dateStr, mealId, updates) => {
        if (!userId) return;

        const patch = {};
        if (Object.prototype.hasOwnProperty.call(updates, 'recipeId')) patch.recipe_id = toRecipeId(updates.recipeId);
        if (Object.prototype.hasOwnProperty.call(updates, 'type')) patch.meal_type = updates.type || 'dinner';
        if (Object.prototype.hasOwnProperty.call(updates, 'note')) patch.note = updates.note || '';
        if (Object.prototype.hasOwnProperty.call(updates, 'multiplier')) patch.multiplier = toNumberOr(updates.multiplier, 1);
        if (Object.prototype.hasOwnProperty.call(updates, 'totalWeight')) patch.total_weight = toNumberOr(updates.totalWeight, null);

        try {
            if (Object.keys(patch).length > 0) {
                const { error } = await supabase
                    .from(TABLE_NAME)
                    .update(patch)
                    .eq('id', String(mealId))
                    .eq('user_id', userId);
                if (error) throw error;
            }
        } catch (error) {
            console.warn('plannerService.updateMeal: update fallback to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
        }

        const localPlans = readPlansFromLocal(userId);
        const nextPlans = updateMealInLocalPlans(localPlans, dateStr, mealId, updates);
        savePlansToLocal(userId, nextPlans);
    },

    clearPeriod: async (userId, startDate, endDate) => {
        if (!userId) return;

        try {
            const { error } = await supabase
                .from(TABLE_NAME)
                .delete()
                .eq('user_id', userId)
                .gte('plan_date', startDate)
                .lte('plan_date', endDate);

            if (error) throw error;
        } catch (error) {
            console.warn('plannerService.clearPeriod: delete fallback to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
        }

        const localPlans = readPlansFromLocal(userId);
        const nextPlans = clearPeriodFromLocalPlans(localPlans, startDate, endDate);
        savePlansToLocal(userId, nextPlans);
    }
};
