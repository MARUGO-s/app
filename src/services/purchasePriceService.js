import { supabase } from '../supabase.js';

const BUCKET_NAME = 'app-data';
// No fixed FILE_PATH anymore

export const purchasePriceService = {
    _cache: null,

    /**
     * Clear the in-memory cache
     */
    clearCache() {
        this._cache = null;
    },

    /**
     * Fetches the material price list from Supabase Storage.
     * Returns a Map where keys are material names and values are prices.
     */
    async fetchPriceList() {
        if (this._cache) {
            return this._cache;
        }

        try {
            // 1. List all files
            const { data: files, error: listError } = await supabase.storage
                .from(BUCKET_NAME)
                .list();

            if (listError) {
                console.warn('Failed to list price files:', listError.message);
                return new Map();
            }

            if (!files || files.length === 0) {
                return new Map();
            }

            // 2. Download and Parse all CSVs
            const masterMap = new Map(); // Key: Name, Value: { price, vendor, dateStr }

            const promises = files
                .filter(f => f.name.endsWith('.csv'))
                .map(async (file) => {
                    const { data, error } = await supabase.storage
                        .from(BUCKET_NAME)
                        .download(file.name);

                    if (error) {
                        console.error(`Failed to download ${file.name}:`, error);
                        return null;
                    }

                    const buffer = await data.arrayBuffer();
                    const decoder = new TextDecoder('shift-jis');
                    return decoder.decode(buffer);
                });

            const csvTexts = await Promise.all(promises);

            // 3. Merge Data
            for (const text of csvTexts) {
                if (!text) continue;
                const fileMap = this.parseCSV(text);

                for (const [name, entry] of fileMap) {
                    if (masterMap.has(name)) {
                        const existing = masterMap.get(name);
                        // Keep latest date
                        if (entry.dateStr > existing.dateStr) {
                            masterMap.set(name, entry);
                        }
                    } else {
                        masterMap.set(name, entry);
                    }
                }
            }

            this._cache = masterMap;
            return masterMap;
        } catch (err) {
            console.error('Error in fetchPriceList:', err);
            return new Map();
        }
    },

    /**
     * Lists all uploaded CSV files.
     */
    async getFileList() {
        try {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .list();

            if (error) throw error;
            return data.filter(f => f.name.endsWith('.csv')) || [];
        } catch (err) {
            console.error('Error fetching file list:', err);
            return [];
        }
    },

    /**
     * Uploads a CSV file to Supabase Storage.
     * @param {File} file 
     */
    async uploadPriceList(file) {
        try {
            // Use original filename, ensuring it's a CSV
            const fileName = file.name; // User wants to save multiples, so we trust reasonable unique names

            this.clearCache();

            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, file, {
                    upsert: true,
                    contentType: 'text/csv'
                });

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('Error uploading price list:', err);
            return { success: false, error: err };
        }
    },

    /**
     * Deletes the CSV file from Supabase Storage.
     */
    async deletePriceFile(fileName) {
        try {
            this.clearCache();
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([fileName]);

            if (error) throw error;

            // Check if file was actually deleted (if RLS blocks, data might be empty)
            if (!data || data.length === 0) {
                throw new Error('削除に失敗しました。権限がないか、ファイルが見つかりません。');
            }

            return { success: true, data };
        } catch (err) {
            console.error('Error deleting price file:', err);
            return { success: false, error: err };
        }
    },

    /**
     * Custom Parser for 12.csv format
     * Format: Quoted fields.
     * Indices (0-based):
     * 0: Record Type ("D" for data)
     * 1: Date (YYYY/MM/DD)
     * 14: Ingredient Name
     * 18: Cost
     */
    parseCSV(csvText) {
        const priceMap = new Map(); // Key: Name, Value: { price, vendor, dateStr }

        // Split lines handling potential CRLF
        const lines = csvText.split(/\r?\n/).filter(line => line.trim());

        if (lines.length === 0) return priceMap;

        // Detect Format
        // Legacy "12.csv" format starts with "D" in the first column of data lines.
        // We check the first few non-empty lines. If any starts with "D,", it's likely legacy.
        // Actually, let's try to parse as Legacy first. If it yields results, good.
        // If not, try Generic.

        const isLegacy = lines.some(line => line.startsWith('D,') || line.startsWith('"D",'));

        if (isLegacy) {
            // --- Legacy Parser (Kept from original) ---
            for (let line of lines) {
                // ... (Existing parsing logic)
                // Simple regex for quoted CSV parsing
                // Matches: "value" OR value
                const matches = [];
                let current = '';
                let inQuote = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') inQuote = !inQuote;
                    else if (char === ',' && !inQuote) { matches.push(current); current = ''; }
                    else current += char;
                }
                matches.push(current);
                const columns = matches.map(val => {
                    val = val.trim();
                    if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
                    return val;
                });

                if (columns[0] !== 'D') continue;

                const dateStr = columns[1];
                const vendor = columns[8];
                const name = columns[14];
                const priceStr = columns[18];
                const unit = columns[20];

                if (name && priceStr) {
                    const price = parseFloat(priceStr);
                    if (!isNaN(price)) {
                        const entry = { price, vendor, unit, dateStr };
                        if (priceMap.has(name)) {
                            const existing = priceMap.get(name);
                            if (dateStr > existing.dateStr) priceMap.set(name, entry);
                        } else {
                            priceMap.set(name, entry);
                        }
                    }
                }
            }
        } else {
            // --- Generic Parser ---
            // Assume first row is Header? Or check for keywords.
            // Keywords: Name (材料, 品名), Price (単価, 価格, 原価), Unit (単位), Vendor (業者, 問屋)

            let headerIndices = { name: -1, price: -1, unit: -1, vendor: -1 };
            let startRow = 0;

            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

            // Heuristic detection
            headers.forEach((h, i) => {
                if (['材料', '材料名', '品名', '商品名', 'name', 'item'].some(k => h.includes(k))) headerIndices.name = i;
                if (['単価', '価格', '原価', '金額', 'price', 'cost'].some(k => h.includes(k))) headerIndices.price = i;
                if (['単位', 'unit'].some(k => h.includes(k))) headerIndices.unit = i;
                if (['業者', '問屋', '仕入', 'vendor', 'supplier'].some(k => h.includes(k))) headerIndices.vendor = i;
            });

            // If no header detected, assume order: Name, Price, Unit, Vendor (0, 1, 2, 3)
            if (headerIndices.name === -1 && headerIndices.price === -1) {
                headerIndices = { name: 0, price: 1, unit: 2, vendor: 3 };
                // If first row looks like header (not number in price col), skip it
                const firstRowCols = lines[0].split(',');
                if (isNaN(parseFloat(firstRowCols[1]))) {
                    startRow = 1;
                }
            } else {
                startRow = 1; // Header exists
            }

            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

            for (let i = startRow; i < lines.length; i++) {
                const row = lines[i];
                // basic split (caveat: doesn't handle quoted commas well, but good enough for simple)
                // Use the same robust split logic as above just in case
                const matches = [];
                let current = '';
                let inQuote = false;
                for (let j = 0; j < row.length; j++) {
                    const char = row[j];
                    if (char === '"') inQuote = !inQuote;
                    else if (char === ',' && !inQuote) { matches.push(current); current = ''; }
                    else current += char;
                }
                matches.push(current);
                const columns = matches.map(val => {
                    val = val.trim();
                    if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
                    return val;
                });

                const name = headerIndices.name > -1 ? columns[headerIndices.name] : null;
                const priceStr = headerIndices.price > -1 ? columns[headerIndices.price] : null;
                const unit = headerIndices.unit > -1 ? columns[headerIndices.unit] : '';
                const vendor = headerIndices.vendor > -1 ? columns[headerIndices.vendor] : '';

                if (name && priceStr) {
                    const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')); // clean currency symbols
                    if (!isNaN(price)) {
                        // For generic CSV, use current date as 'dateStr' since it's an import? 
                        // Or just empty. If merging with legacy, legacy has dates.
                        // Let's use Today.
                        priceMap.set(name, { price, vendor, unit, dateStr: today });
                    }
                }
            }
        }

        return priceMap;
    },

    /**
     * Helper to get price list as array for UI display
     */
    async getPriceListArray() {
        const map = await this.fetchPriceList();
        const array = [];
        for (const [name, data] of map.entries()) {
            if (typeof data === 'object') {
                array.push({ name, ...data });
            } else {
                array.push({ name, price: data });
            }
        }
        // Sort by date desc, then name
        return array.sort((a, b) => {
            if (a.dateStr && b.dateStr) {
                return b.dateStr.localeCompare(a.dateStr);
            }
            return a.name.localeCompare(b.name);
        });
    },

    /**
     * Get price data for a specific ingredient
     * @param {string} name 
     * @returns {Promise<{price: number, unit: string, vendor: string}|null>}
     */
    async getPrice(name) {
        if (!name) return null;
        const map = await this.fetchPriceList();
        return map.get(name) || null;
    }
};
