import { purchasePriceService } from './purchasePriceService';
import { unitConversionService } from './unitConversionService';
import { supabase } from '../supabase.js';

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
            const { data, error } = await supabase.rpc('search_ingredients', {
                search_query: query,
                max_results: 15
            });

            if (error) {
                console.warn('Database search failed, falling back to cache:', error.message);
                return null;
            }

            return data || [];
        } catch (error) {
            console.warn('Database search exception:', error.message);
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
        if (!query || query.trim().length === 0) {
            this._lastDbResults = null;
            this._lastDbQuery = null;
            return [];
        }

        const normalizedQuery = query.toLowerCase().trim();

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
                    source: 'manual',
                    displaySource: '📦 マスター'
                }));

                // Load CSV data (if not cached yet)
                if (!this._csvCache) {
                    const csvData = await purchasePriceService.getPriceListArray();
                    this._csvCache = csvData.map(item => ({
                        name: item.name,
                        price: item.price,
                        size: null,
                        unit: item.unit,
                        source: 'csv',
                        displaySource: '💰 CSV'
                    }));
                }

                // Filter CSV results: only include if not in DB results
                const dbNames = new Set(formattedDbResults.map(r => r.name));
                const csvResults = this._csvCache.filter(item =>
                    item.name.toLowerCase().includes(normalizedQuery) &&
                    !dbNames.has(item.name)
                ).slice(0, 5); // Limit CSV results to 5 to keep total under 20

                // Merge and return
                return [...formattedDbResults, ...csvResults];
            }

            // FALLBACK: If DB search failed, use old strategy
            console.info('Database search unavailable, using fallback CSV search');
            return await this._fallbackSearch(normalizedQuery);

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
            // Build cache if empty
            if (!this._csvCache) {
                // Fetch data in parallel
                const [csvData, manualDataMap] = await Promise.all([
                    purchasePriceService.getPriceListArray(),
                    unitConversionService.getAllConversions()
                ]);

                // Format Manual Data (Priority 1)
                const manualResults = Array.from(manualDataMap.values()).map(item => ({
                    name: item.ingredientName,
                    price: item.lastPrice,
                    size: item.packetSize,
                    unit: item.packetUnit,
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
            }

            // FILTER & SORT based on query
            const results = this._csvCache.filter(item =>
                item.name.toLowerCase().includes(normalizedQuery)
            ).slice(0, 15); // Limit to 15 results

            // Sort by relevance (exact match first, then starts with, then includes)
            return results.sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();

                // Exact match
                if (aName === normalizedQuery && bName !== normalizedQuery) return -1;
                if (bName === normalizedQuery && aName !== normalizedQuery) return 1;

                // Starts with
                if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
                if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) return 1;

                return aName.localeCompare(bName, 'ja');
            });

        } catch (error) {
            console.error('Error in fallback search:', error);
            return [];
        }
    }
};
