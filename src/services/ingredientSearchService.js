import { purchasePriceService } from './purchasePriceService';
import { unitConversionService } from './unitConversionService';
import { supabase } from '../supabase.js';
import { normalizeIngredientKey } from '../utils/normalizeIngredientKey.js';

export const ingredientSearchService = {
    /**
     * Search for ingredients from both CSV master data and manual unit conversions
     * Uses database-level search for manual ingredients (fast) + fallback to CSV data
     * @param {string} query Search query
     * @returns {Promise<Array>} List of merged search results
     */
    // Cache for CSV data to avoid re-fetching on every keystroke
    _csvCache: null,
    _csvCacheKey: null, // Track if cache is for current user
    _lastDbResults: null, // Cache last DB results for quick re-filtering
    _lastDbQuery: null,

    /**
     * Clear the cache
     */
    invalidateCache() {
        this._csvCache = null;
        this._csvCacheKey = null;
        this._lastDbResults = null;
        this._lastDbQuery = null;
    },

    /**
     * Fetch manual ingredients from database using RPC function (fast)
     * @param {string} query Search query
     * @returns {Promise<Array>} Database results
     */
    async _searchFromDatabase(query) {
        try {
            console.log('🔍 Searching DB for:', query);
            const { data, error } = await supabase.rpc('search_ingredients', {
                search_query: query,
                max_results: 15
            });

            if (error) {
                console.warn('❌ Database search failed:', error);
                console.warn('Error message:', error.message);
                console.warn('Error code:', error.code);
                return null;
            }

            console.log('✅ DB search result:', data);
            return data || [];
        } catch (error) {
            console.warn('❌ Database search exception:', error);
            return null;
        }
    },

    /**
     * Search for ingredients from both CSV master data and manual unit conversions
     * Strategy: Try fast DB search first, fallback to cached CSV data
     * @param {string} query Search query
     * @returns {Promise<Array>} List of merged search results
     */
    async search(query) {
        const rawQuery = String(query || '').trim();
        if (!rawQuery) {
            this._lastDbResults = null;
            this._lastDbQuery = null;
            return [];
        }

        const normalizedQuery = rawQuery.toLowerCase();
        const queryKey = normalizeIngredientKey(rawQuery);

        try {
            // Try database search first (should be fast - max 15 results)
            const dbResults = await this._searchFromDatabase(normalizedQuery);

            // If DB search succeeded, cache and format results
            if (dbResults && Array.isArray(dbResults)) {
                this._lastDbResults = dbResults;
                this._lastDbQuery = normalizedQuery;

                // Format DB results
                const formattedDbResults = dbResults.map(item => ({
                    name: item.ingredient_name,
                    price: item.last_price,
                    size: item.packet_size,
                    unit: item.packet_unit,
                    itemCategory: item.item_category || null,
                    source: 'manual',
                    displaySource: '📦 マスター'
                }));

                // If DB returns no hit, fallback to wide search (includes manual conversions + CSV partial match)
                // so users still get suggestions for "contains" matches.
                if (formattedDbResults.length === 0) {
                    return await this._fallbackSearch(normalizedQuery);
                }

                // Load CSV data (if not cached yet)
                if (!this._csvCache) {
                    console.log('📥 Building cache from CSV and manual data...');
                    const [csvData, manualDataMap] = await Promise.all([
                        purchasePriceService.getPriceListArray(),
                        unitConversionService.getAllConversions()
                    ]);

                    const manualResults = Array.from(manualDataMap.values()).map(item => ({
                        name: item.ingredientName,
                        price: item.lastPrice,
                        size: item.packetSize,
                        unit: item.packetUnit,
                        itemCategory: item.itemCategory || null,
                        source: 'manual',
                        displaySource: '📦 マスター'
                    }));

                    const csvResults = csvData.map(item => ({
                        name: item.name,
                        price: item.price,
                        size: null,
                        unit: item.unit,
                        source: 'csv',
                        displaySource: '💰 CSV'
                    }));

                    const manualNames = new Set(manualResults.map(r => r.name));
                    const uniqueCsvResults = csvResults.filter(r => !manualNames.has(r.name));

                    this._csvCache = [...manualResults, ...uniqueCsvResults];
                }

                const scoreFor = (nameKey) => {
                    if (!queryKey) return null;
                    const idx = String(nameKey || '').indexOf(queryKey);
                    if (idx < 0) return null;
                    const tier = (nameKey === queryKey) ? 0 : (idx === 0 ? 1 : 2);
                    return { tier, idx, len: String(nameKey || '').length };
                };

                const compareEntry = (a, b) => {
                    // Lower score is better
                    if (a.score.tier !== b.score.tier) return a.score.tier - b.score.tier;
                    if (a.score.idx !== b.score.idx) return a.score.idx - b.score.idx;
                    if (a.score.len !== b.score.len) return a.score.len - b.score.len;
                    return a.name.localeCompare(b.name, 'ja');
                };

                const pushTop = (arr, entry, limit) => {
                    // Insert into sorted array (small N: <= 15)
                    let i = 0;
                    while (i < arr.length && compareEntry(arr[i], entry) <= 0) i++;
                    arr.splice(i, 0, entry);
                    if (arr.length > limit) arr.pop();
                };

                const MAX_TOTAL = 15;
                const remaining = Math.max(0, MAX_TOTAL - formattedDbResults.length);

                // Filter CSV results: only include if not in DB results (dedupe by normalized key)
                const dbKeys = new Set(formattedDbResults.map(r => normalizeIngredientKey(r.name)));
                const picked = [];
                const pickedKeys = new Set(); // avoid duplicates within CSV matches
                if (remaining > 0) {
                    for (const item of this._csvCache) {
                        const nameKey = normalizeIngredientKey(item?.name);
                        if (!nameKey) continue;
                        if (dbKeys.has(nameKey)) continue;
                        if (pickedKeys.has(nameKey)) continue;
                        const score = scoreFor(nameKey);
                        if (!score) continue;
                        pickedKeys.add(nameKey);
                        pushTop(picked, { ...item, nameKey, score }, remaining);
                    }
                }

                const csvResults = picked.map(e => ({
                    name: e.name,
                    price: e.price,
                    size: e.size,
                    unit: e.unit,
                    source: e.source,
                    displaySource: e.displaySource
                }));

                // Merge and return
                return [...formattedDbResults, ...csvResults];
            }

            // FALLBACK: If DB search failed, use old strategy
            console.info('⚠️ Database search unavailable (dbResults is null/empty), using fallback CSV search');
            console.log('⚠️ dbResults:', dbResults);
            const fallbackResults = await this._fallbackSearch(normalizedQuery);
            console.log('✅ Fallback search returned:', fallbackResults.length, 'results');
            return fallbackResults;

        } catch (error) {
            console.error('Error searching ingredients:', error);
            return [];
        }
    },

    /**
     * Fallback search using CSV data when database is unavailable
     * @param {string} normalizedQuery Normalized search query
     * @returns {Promise<Array>} Search results
     */
    async _fallbackSearch(normalizedQuery) {
        try {
            const queryKey = normalizeIngredientKey(normalizedQuery);
            // Build cache if empty
            if (!this._csvCache) {
                console.log('📥 Building cache from CSV and manual data...');
                // Fetch data in parallel
                const [csvData, manualDataMap] = await Promise.all([
                    purchasePriceService.getPriceListArray(),
                    unitConversionService.getAllConversions()
                ]);

                console.log('📊 CSV Data rows:', csvData.length);
                console.log('📊 Manual Data items:', manualDataMap.size);

                // Format Manual Data (Priority 1)
                const manualResults = Array.from(manualDataMap.values()).map(item => ({
                    name: item.ingredientName,
                    price: item.lastPrice,
                    size: item.packetSize,
                    unit: item.packetUnit,
                    itemCategory: item.itemCategory || null,
                    source: 'manual',
                    displaySource: '📦 マスター'
                }));

                // Format CSV Data (Priority 2)
                const csvResults = csvData.map(item => ({
                    name: item.name,
                    price: item.price,
                    size: null,
                    unit: item.unit,
                    source: 'csv',
                    displaySource: '💰 CSV'
                }));

                // Merge and dedup (Prefer manual data if names match exactly)
                const manualNames = new Set(manualResults.map(r => r.name));
                const uniqueCsvResults = csvResults.filter(r => !manualNames.has(r.name));

                // Store combined list
                this._csvCache = [...manualResults, ...uniqueCsvResults];
                console.log('✅ Cache built. Total items:', this._csvCache.length);
            }

            const scoreFor = (nameKey) => {
                if (!queryKey) return null;
                const idx = String(nameKey || '').indexOf(queryKey);
                if (idx < 0) return null;
                const tier = (nameKey === queryKey) ? 0 : (idx === 0 ? 1 : 2);
                return { tier, idx, len: String(nameKey || '').length };
            };

            const compareEntry = (a, b) => {
                if (a.score.tier !== b.score.tier) return a.score.tier - b.score.tier;
                if (a.score.idx !== b.score.idx) return a.score.idx - b.score.idx;
                if (a.score.len !== b.score.len) return a.score.len - b.score.len;
                return a.name.localeCompare(b.name, 'ja');
            };

            const pushTop = (arr, entry, limit) => {
                let i = 0;
                while (i < arr.length && compareEntry(arr[i], entry) <= 0) i++;
                arr.splice(i, 0, entry);
                if (arr.length > limit) arr.pop();
            };

            // FILTER & rank based on query (keep only top 15 for performance)
            const TOP_N = 15;
            const picked = [];
            const pickedKeys = new Set();
            for (const item of this._csvCache) {
                const nameKey = normalizeIngredientKey(item?.name);
                if (!nameKey) continue;
                if (pickedKeys.has(nameKey)) continue;
                const score = scoreFor(nameKey);
                if (!score) continue;
                pickedKeys.add(nameKey);
                pushTop(picked, { ...item, nameKey, score }, TOP_N);
            }

            return picked.map(e => ({
                name: e.name,
                price: e.price,
                size: e.size,
                unit: e.unit,
                itemCategory: e.itemCategory || null,
                source: e.source,
                displaySource: e.displaySource
            }));

        } catch (error) {
            console.error('Error in fallback search:', error);
            return [];
        }
    }
};
