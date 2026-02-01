import { purchasePriceService } from './purchasePriceService';
import { unitConversionService } from './unitConversionService';

export const ingredientSearchService = {
    /**
     * Search for ingredients from both CSV master data and manual unit conversions
     * @param {string} query Search query
     * @returns {Promise<Array>} List of merged search results
     */
    async search(query) {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const normalizedQuery = query.toLowerCase().trim();

        try {
            // Fetch data in parallel
            const [csvData, manualDataMap] = await Promise.all([
                purchasePriceService.getPriceListArray(),
                unitConversionService.getAllConversions()
            ]);

            // Format Manual Data (Priority 1)
            const manualResults = Array.from(manualDataMap.values())
                .filter(item => item.ingredientName.toLowerCase().includes(normalizedQuery))
                .map(item => ({
                    name: item.ingredientName,
                    price: item.lastPrice,
                    size: item.packetSize,
                    unit: item.packetUnit,
                    source: 'manual', // 'manual' = Ingredient Master
                    displaySource: '📦 マスター'
                }));

            // Format CSV Data (Priority 2)
            const csvResults = csvData
                .filter(item => item.name && item.name.toLowerCase().includes(normalizedQuery))
                .map(item => ({
                    name: item.name,
                    price: item.price,
                    size: null, // CSV might not have size/unit standardized
                    unit: item.unit,
                    source: 'csv', // 'csv' = Imported CSV
                    displaySource: '💰 CSV'
                }));

            // Merge and dedup (Prefer manual data if names match exactly)
            const manualNames = new Set(manualResults.map(r => r.name));
            const uniqueCsvResults = csvResults.filter(r => !manualNames.has(r.name));

            const results = [...manualResults, ...uniqueCsvResults];

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
            console.error('Error searching ingredients:', error);
            return [];
        }
    }
};
