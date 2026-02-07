
const LEGACY_STORAGE_KEY = 'planner_data';

const getStorageKey = (userId) => `planner_data_${userId}`;

const getPlans = (userId) => {
    try {
        if (!userId) return {};

        // Try user-specific key first
        let data = localStorage.getItem(getStorageKey(userId));

        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
};

const savePlans = (userId, plans) => {
    if (!userId) return;
    localStorage.setItem(getStorageKey(userId), JSON.stringify(plans));
};

export const plannerService = {
    getAll: async (userId) => {
        return getPlans(userId);
    },

    // New method to clean up plans for recipes that don't exist (Unknown)
    cleanupInvalidPlans: async (userId, validRecipeIds) => {
        const plans = getPlans(userId);
        let hasChanges = false;
        const validIdSet = new Set(validRecipeIds);

        Object.keys(plans).forEach(dateStr => {
            const originalLen = plans[dateStr].length;
            // Filter out meals with recipeIds that are not in the valid set
            plans[dateStr] = plans[dateStr].filter(meal => validIdSet.has(meal.recipeId));

            if (plans[dateStr].length !== originalLen) {
                hasChanges = true;
            }
            // If date becomes empty, delete the key
            if (plans[dateStr].length === 0) {
                delete plans[dateStr];
                hasChanges = true; // Key deletion is a change
            }
        });

        if (hasChanges) {
            savePlans(userId, plans);
        }
        return plans;
    },

    addMeal: async (userId, dateStr, recipeId, type) => {
        const plans = getPlans(userId);
        if (!plans[dateStr]) plans[dateStr] = [];

        const newMeal = {
            id: Date.now().toString(),
            recipeId,
            type, // 'breakfast', 'lunch', 'dinner', 'prep'
            note: ''
        };

        plans[dateStr].push(newMeal);
        savePlans(userId, plans);
        return newMeal;
    },

    removeMeal: async (userId, dateStr, mealId) => {
        const plans = getPlans(userId);
        if (plans[dateStr]) {
            plans[dateStr] = plans[dateStr].filter(m => m.id !== mealId);
            if (plans[dateStr].length === 0) delete plans[dateStr]; // Cleanup
            savePlans(userId, plans);
        }
    },

    updateMeal: async (userId, dateStr, mealId, updates) => {
        const plans = getPlans(userId);
        if (plans[dateStr]) {
            const idx = plans[dateStr].findIndex(m => m.id === mealId);
            if (idx !== -1) {
                plans[dateStr][idx] = { ...plans[dateStr][idx], ...updates };
                savePlans(userId, plans);
            }
        }
    }
};
