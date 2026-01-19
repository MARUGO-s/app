import { supabase } from '../supabase';

const BUCKET_NAME = 'app-data';
// No fixed FILE_PATH anymore

export const purchasePriceService = {
    /**
     * Fetches the material price list from Supabase Storage.
     * Returns a Map where keys are material names and values are prices.
     */
    async fetchPriceList() {
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
        const priceMap = new Map(); // Key: Name, Value: { price, dateStr }

        // Split lines handling potential CRLF
        const lines = csvText.split(/\r?\n/);

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Simple regex for quoted CSV parsing
            // Matches: "value" OR value (if not quoted, though file seems fully quoted)
            const matches = [];
            let current = '';
            let inQuote = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    matches.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            matches.push(current);

            // Clean quotes from values
            const columns = matches.map(val => {
                val = val.trim();
                if (val.startsWith('"') && val.endsWith('"')) {
                    return val.slice(1, -1);
                }
                return val;
            });

            // Logic: Must be "D" record
            if (columns[0] !== 'D') continue;

            // Use specified indices
            const dateStr = columns[1]; // Index 1: Date
            const vendor = columns[8];  // Index 8: Vendor
            const name = columns[14];   // Index 14: Name
            const priceStr = columns[18]; // Index 18: Cost
            const unit = columns[20];   // Index 20: Unit (Column U)

            if (name && priceStr) {
                const price = parseFloat(priceStr);

                if (!isNaN(price)) {
                    const entry = { price, vendor, unit, dateStr };

                    // Deduplication logic: Keep latest date
                    if (priceMap.has(name)) {
                        const existing = priceMap.get(name);
                        // String comparison for YYYY/MM/DD works
                        if (dateStr > existing.dateStr) {
                            priceMap.set(name, entry);
                        }
                    } else {
                        priceMap.set(name, entry);
                    }
                }
            }
        }

        // Return Map<string, { price, vendor, dateStr }>
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
    }
};
