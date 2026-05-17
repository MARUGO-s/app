const e=`import { supabase } from '../supabase';
import { RECIPE_CATEGORY_OPTIONS, normalizeRecipeCategory } from '../constants/recipeCategories';
import { RECIPE_COURSE_OPTIONS, normalizeCourseSuggestions, normalizeRecipeCourse } from '../constants/recipeCourses';

const HISTORY_STORAGE_KEY_PREFIX = 'recipe_meta_history_v1';
const PAGE_SIZE = 1000;

const META_FIELDS = ['course', 'category', 'country', 'servings', 'storeName'];

const DEFAULT_SUGGESTIONS = {
    course: [...RECIPE_COURSE_OPTIONS],
    category: [...RECIPE_CATEGORY_OPTIONS],
    country: [],
    servings: [],
    storeName: [],
};

const normalizeValue = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();

const sortJa = (values) => [...values].sort((a, b) => a.localeCompare(b, 'ja'));

const normalizeCategorySuggestions = (values) => {
    const seen = new Set();
    const merged = [];
    for (const raw of values || []) {
        const canonical = normalizeRecipeCategory(raw);
        const key = canonical.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(canonical);
    }
    return sortJa(merged);
};

const mergeUnique = (...lists) => {
    const seen = new Set();
    const merged = [];
    for (const list of lists) {
        for (const raw of list || []) {
            const value = normalizeValue(raw);
            if (!value) continue;
            const key = value.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(value);
        }
    }
    return sortJa(merged);
};

const normalizeRecipeTags = (rawTags) => {
    if (Array.isArray(rawTags)) return rawTags.map((v) => String(v)).filter(Boolean);
    if (typeof rawTags === 'string') {
        const trimmed = rawTags.trim();
        if (!trimmed) return [];
        return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return [];
};

const getHistoryStorageKey = (currentUser) => {
    const userId = currentUser?.id ? String(currentUser.id) : '';
    if (!userId) return null;
    return \`\${HISTORY_STORAGE_KEY_PREFIX}:\${userId}\`;
};

const getCurrentUserOwnerKeys = (currentUser) => {
    const keys = new Set();
    if (currentUser?.id) keys.add(\`owner:\${String(currentUser.id)}\`);
    if (currentUser?.displayId) keys.add(\`owner:\${String(currentUser.displayId)}\`);
    return keys;
};

const recipeOwnedByUser = (row, ownerKeys) => {
    if (!ownerKeys || ownerKeys.size === 0) return false;
    const ownerTags = normalizeRecipeTags(row?.tags).filter((tag) => tag.startsWith('owner:'));
    if (ownerTags.length === 0) return false;
    return ownerTags.some((tag) => ownerKeys.has(tag));
};

const readLocalHistory = (currentUser) => {
    const storageKey = getHistoryStorageKey(currentUser);
    if (!storageKey) return {};

    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const writeLocalHistory = (currentUser, history) => {
    const storageKey = getHistoryStorageKey(currentUser);
    if (!storageKey) return;

    try {
        localStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
        // ignore quota / private mode
    }
};

export const rememberRecipeMetaFields = (fields, currentUser) => {
    if (!currentUser?.id) return;

    const history = readLocalHistory(currentUser);
    let changed = false;

    for (const field of META_FIELDS) {
        let value = normalizeValue(fields?.[field]);
        if (!value) continue;
        if (field === 'category') {
            value = normalizeRecipeCategory(value);
        }
        if (field === 'course') {
            value = normalizeRecipeCourse(value, { category: fields?.category });
        }

        const prev = Array.isArray(history[field]) ? history[field] : [];
        const next = [value, ...prev.filter((item) => normalizeValue(item).toLowerCase() !== value.toLowerCase())].slice(0, 80);
        if (next.length !== prev.length || next[0] !== prev[0]) {
            history[field] = next;
            changed = true;
        }
    }

    if (changed) writeLocalHistory(currentUser, history);
};

const buildOwnerTagsOrFilter = (currentUser) => {
    const clauses = [];
    if (currentUser?.id) clauses.push(\`tags.cs.{owner:\${currentUser.id}}\`);
    if (currentUser?.displayId) clauses.push(\`tags.cs.{owner:\${currentUser.displayId}}\`);
    return clauses.join(',');
};

const fetchDistinctMetaFromRecipes = async (currentUser) => {
    const empty = {
        course: [],
        category: [],
        country: [],
        servings: [],
        storeName: [],
    };

    if (!currentUser?.id) return empty;

    const ownerKeys = getCurrentUserOwnerKeys(currentUser);
    const ownerOrFilter = buildOwnerTagsOrFilter(currentUser);
    if (!ownerOrFilter) return empty;

    const buckets = {
        course: new Set(),
        category: new Set(),
        country: new Set(),
        servings: new Set(),
        storeName: new Set(),
    };

    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('recipes')
            .select('course, category, country, store_name, servings, tags')
            .or(ownerOrFilter)
            .range(from, from + PAGE_SIZE - 1);

        if (error) {
            console.warn('[recipeMetaSuggestionService] fetch failed:', error);
            break;
        }

        const rows = data || [];
        for (const row of rows) {
            if (!recipeOwnedByUser(row, ownerKeys)) continue;

            if (normalizeValue(row.course)) {
                buckets.course.add(normalizeRecipeCourse(row.course, row));
            }
            if (normalizeValue(row.category)) {
                buckets.category.add(normalizeRecipeCategory(row.category, row));
            }
            if (normalizeValue(row.country)) buckets.country.add(normalizeValue(row.country));
            if (normalizeValue(row.servings)) buckets.servings.add(normalizeValue(row.servings));
            if (normalizeValue(row.store_name)) buckets.storeName.add(normalizeValue(row.store_name));
        }

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return {
        course: sortJa([...buckets.course]),
        category: sortJa([...buckets.category]),
        country: sortJa([...buckets.country]),
        servings: sortJa([...buckets.servings]),
        storeName: sortJa([...buckets.storeName]),
    };
};

/**
 * コース・カテゴリー・国・分量・店舗名の入力候補（既定値 + 自分のレシピ + 自分のローカル履歴）
 */
export const loadRecipeMetaSuggestions = async ({ storeList = [], currentUser } = {}) => {
    const local = readLocalHistory(currentUser);
    const fromDb = await fetchDistinctMetaFromRecipes(currentUser);

    const categoryHistory = normalizeCategorySuggestions([
        ...RECIPE_CATEGORY_OPTIONS,
        ...fromDb.category,
        ...(Array.isArray(local.category) ? local.category : []),
    ]);

    // 旧表記（ソース.ドレッシング 等）が localStorage に残っていても候補に出さない
    if (getHistoryStorageKey(currentUser)) {
        const history = readLocalHistory(currentUser);
        const prev = Array.isArray(history.category) ? history.category : [];
        const cleaned = normalizeCategorySuggestions(prev);
        if (cleaned.length !== prev.length || cleaned.some((v, i) => v !== prev[i])) {
            history.category = cleaned;
            writeLocalHistory(currentUser, history);
        }
    }

    const courseHistory = normalizeCourseSuggestions([
        ...RECIPE_COURSE_OPTIONS,
        ...fromDb.course,
        ...(Array.isArray(local.course) ? local.course : []),
    ]);

    if (getHistoryStorageKey(currentUser)) {
        const history = readLocalHistory(currentUser);
        const prevCourse = Array.isArray(history.course) ? history.course : [];
        const cleanedCourse = normalizeCourseSuggestions(prevCourse);
        if (cleanedCourse.length !== prevCourse.length || cleanedCourse.some((v, i) => v !== prevCourse[i])) {
            history.course = cleanedCourse;
            writeLocalHistory(currentUser, history);
        }
    }

    return {
        course: courseHistory,
        category: categoryHistory,
        country: mergeUnique(DEFAULT_SUGGESTIONS.country, fromDb.country, local.country),
        servings: mergeUnique(DEFAULT_SUGGESTIONS.servings, fromDb.servings, local.servings),
        storeName: mergeUnique(storeList, fromDb.storeName, local.storeName),
    };
};
`;export{e as default};
