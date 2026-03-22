import { supabase } from '../supabase';

const TABLE_NAME = 'meal_plans';
const LEGACY_STORAGE_KEY = 'planner_data';
const LOCAL_FALLBACK_WARNING = 'クラウド保存に失敗したため、この操作はローカル保存に切り替えました。';
const MAX_WARNING_QUEUE = 20;

const warningQueue = [];
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const isMissingColumnError = (error, columnName) => {
    const msg = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');
    if (code === '42703') return msg.includes(`column "${String(columnName).toLowerCase()}"`);
    return msg.includes(`column "${String(columnName).toLowerCase()}"`) && msg.includes('does not exist');
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

const withLegacyPlanFields = (row) => ({
    ...row,
    date_str: row.plan_date,
    type: row.meal_type,
});

const stripLegacyPlanFields = (row) => {
    const { date_str: _dateStr, type: _type, ...rest } = row;
    return rest;
};

const insertPlanRows = async (rows) => {
    if (!rows || rows.length === 0) return;

    const primaryRows = rows.map(withLegacyPlanFields);
    let { error } = await supabase.from(TABLE_NAME).insert(primaryRows);

    if (error && (isMissingColumnError(error, 'date_str') || isMissingColumnError(error, 'type'))) {
        const fallbackRows = primaryRows.map(stripLegacyPlanFields);
        ({ error } = await supabase.from(TABLE_NAME).insert(fallbackRows));
    }

    if (error) throw error;
};

const isUuidLike = (value) => UUID_LIKE_RE.test(String(value || ''));

const normalizeSigValue = (value) => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') return String(value);
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return String(asNum);
    return String(value);
};

const mealSignature = (dateStr, meal) => {
    const recipe = normalizeSigValue(meal?.recipeId);
    const type = normalizeSigValue(meal?.type || 'dinner');
    const note = normalizeSigValue(meal?.note || '');
    const multiplier = normalizeSigValue(toNumberOr(meal?.multiplier, 1));
    const totalWeight = normalizeSigValue(toNumberOr(meal?.totalWeight, null));
    return `${dateStr}|${recipe}|${type}|${note}|${multiplier}|${totalWeight}`;
};

const mergeRemoteAndLocalPlans = (remotePlans, localPlans) => {
    const merged = {};
    Object.keys(remotePlans || {}).forEach((dateStr) => {
        merged[dateStr] = [...(remotePlans[dateStr] || [])];
    });

    const remoteSignatures = new Set();
    Object.keys(remotePlans || {}).forEach((dateStr) => {
        (remotePlans[dateStr] || []).forEach((meal) => {
            remoteSignatures.add(mealSignature(dateStr, meal));
        });
    });

    Object.keys(localPlans || {}).forEach((dateStr) => {
        const localMeals = localPlans[dateStr] || [];
        localMeals.forEach((meal) => {
            const sig = mealSignature(dateStr, meal);
            if (remoteSignatures.has(sig)) return;
            if (!merged[dateStr]) merged[dateStr] = [];
            merged[dateStr].push(meal);
            remoteSignatures.add(sig);
        });
    });

    return merged;
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

    await insertPlanRows(rows);
    return fetchPlansFromSupabase(userId);
};

const trySyncUnsyncedLocalMeals = async (userId, remotePlans) => {
    const localPlans = readPlansFromLocal(userId);
    const hasUnsyncedLocal = Object.keys(localPlans).some((dateStr) =>
        (localPlans[dateStr] || []).some((meal) => !isUuidLike(meal?.id))
    );
    if (!hasUnsyncedLocal) return remotePlans;

    const remoteSignatures = new Set();
    Object.keys(remotePlans || {}).forEach((dateStr) => {
        (remotePlans[dateStr] || []).forEach((meal) => {
            remoteSignatures.add(mealSignature(dateStr, meal));
        });
    });

    const rowsToInsert = [];
    Object.keys(localPlans || {}).forEach((dateStr) => {
        (localPlans[dateStr] || []).forEach((meal) => {
            if (isUuidLike(meal?.id)) return;
            const sig = mealSignature(dateStr, meal);
            if (remoteSignatures.has(sig)) return;
            rowsToInsert.push({
                user_id: userId,
                plan_date: dateStr,
                recipe_id: toRecipeId(meal.recipeId),
                meal_type: meal.type || 'dinner',
                note: meal.note || '',
                multiplier: toNumberOr(meal.multiplier, 1),
                total_weight: toNumberOr(meal.totalWeight, null),
            });
            remoteSignatures.add(sig);
        });
    });

    if (rowsToInsert.length > 0) {
        await insertPlanRows(rowsToInsert);
    }

    const synced = await fetchPlansFromSupabase(userId);
    savePlansToLocal(userId, synced);
    return synced;
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

            try {
                const syncedPlans = await trySyncUnsyncedLocalMeals(userId, remotePlans);
                savePlansToLocal(userId, syncedPlans);
                return syncedPlans;
            } catch (syncError) {
                console.warn('plannerService.getAll: failed to sync local fallback meals', syncError);
                queueWarning(LOCAL_FALLBACK_WARNING);
                const localPlans = readPlansFromLocal(userId);
                const mergedPlans = mergeRemoteAndLocalPlans(remotePlans, localPlans);
                savePlansToLocal(userId, mergedPlans);
                return mergedPlans;
            }
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

        const localMeal = {
            id: makeLocalMealId(),
            recipeId: toRecipeId(recipeId),
            type: type || 'dinner',
            note: '',
            multiplier: toNumberOr(options?.multiplier, 1),
            totalWeight: toNumberOr(options?.totalWeight, null),
        };

        const localPlans = readPlansFromLocal(userId);
        const nextPlans = addMealToLocalPlans(localPlans, dateStr, localMeal);
        savePlansToLocal(userId, nextPlans);

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
            await insertPlanRows([payload]);
            return localMeal;
        } catch (error) {
            console.warn('plannerService.addMeal: insert fallback to localStorage', error);
            queueWarning(LOCAL_FALLBACK_WARNING);
            return localMeal;
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
        if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
            patch.meal_type = updates.type || 'dinner';
            patch.type = patch.meal_type;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'note')) patch.note = updates.note || '';
        if (Object.prototype.hasOwnProperty.call(updates, 'multiplier')) patch.multiplier = toNumberOr(updates.multiplier, 1);
        if (Object.prototype.hasOwnProperty.call(updates, 'totalWeight')) patch.total_weight = toNumberOr(updates.totalWeight, null);

        try {
            if (Object.keys(patch).length > 0) {
                let { error } = await supabase
                    .from(TABLE_NAME)
                    .update(patch)
                    .eq('id', String(mealId))
                    .eq('user_id', userId);

                if (error && isMissingColumnError(error, 'type')) {
                    const { type: _legacyType, ...fallbackPatch } = patch;
                    ({ error } = await supabase
                        .from(TABLE_NAME)
                        .update(fallbackPatch)
                        .eq('id', String(mealId))
                        .eq('user_id', userId));
                }

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
