import { supabase } from '../supabase.js';

const DEFAULT_ITEM_CATEGORY = 'food';
const LEGACY_FOOD_ALCOHOL_CATEGORY = 'food_alcohol';
const ALLOWED_ITEM_CATEGORIES = new Set(['food', 'alcohol', 'soft_drink', 'supplies']);

const normalizeItemCategory = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return DEFAULT_ITEM_CATEGORY;
    if (normalized === LEGACY_FOOD_ALCOHOL_CATEGORY) return DEFAULT_ITEM_CATEGORY;
    if (ALLOWED_ITEM_CATEGORIES.has(normalized)) return normalized;
    return DEFAULT_ITEM_CATEGORY;
};

export const unitConversionService = {
    async _getCurrentUserId() {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        return data?.user?.id || null;
    },

    async saveConversion(
        ingredientName,
        packetSize,
        packetUnit,
        packetPrice = null,
        itemCategory = null,
        vendor = undefined,
        yieldPercent = undefined
    ) {
        try {
            const userId = await this._getCurrentUserId();
            if (!userId) throw new Error('ログインが必要です');

            const payload = {
                user_id: userId,
                ingredient_name: ingredientName,
                packet_size: parseFloat(packetSize),
                packet_unit: packetUnit,
                last_price: packetPrice ? parseFloat(packetPrice) : null,
                updated_at: new Date().toISOString()
            };
            if (itemCategory) {
                payload.item_category = normalizeItemCategory(itemCategory);
            }
            if (vendor !== undefined) {
                const normalizedVendor = String(vendor ?? '').trim();
                payload.vendor = normalizedVendor ? normalizedVendor : null;
            }
            if (yieldPercent !== undefined) {
                const raw = parseFloat(yieldPercent);
                let normalized = Number.isFinite(raw) ? raw : 100;
                if (normalized <= 0) normalized = 100;
                if (normalized > 100) normalized = 100;
                payload.yield_percent = normalized;
            }

            // Upsert to unit_conversions table
            const executeUpsert = async (body) => supabase
                .from('unit_conversions')
                .upsert(body, {
                    onConflict: 'user_id,ingredient_name'
                })
                .select()
                .single();

            let { data, error } = await executeUpsert(payload);

            // Backward compatibility: allow save even before DB migration that adds item_category.
            if (error) {
                const msg = String(error.message || '');
                const shouldDropItemCategory = !!payload.item_category && msg.includes('item_category');
                const shouldDropVendor = Object.prototype.hasOwnProperty.call(payload, 'vendor') && msg.includes('vendor');
                const shouldDropYieldPercent = Object.prototype.hasOwnProperty.call(payload, 'yield_percent') && msg.includes('yield_percent');
                if (shouldDropItemCategory || shouldDropVendor || shouldDropYieldPercent) {
                    const fallbackPayload = { ...payload };
                    if (shouldDropItemCategory) delete fallbackPayload.item_category;
                    if (shouldDropVendor) delete fallbackPayload.vendor;
                    if (shouldDropYieldPercent) delete fallbackPayload.yield_percent;
                    ({ data, error } = await executeUpsert(fallbackPayload));
                }
            }

            if (error) throw error;

            // Return in camelCase to match previous behavior
            return {
                ingredientName: data.ingredient_name,
                packetSize: data.packet_size,
                packetUnit: data.packet_unit,
                lastPrice: data.last_price,
                vendor: data.vendor || '',
                itemCategory: normalizeItemCategory(data.item_category),
                yieldPercent: (data.yield_percent === null || data.yield_percent === undefined) ? 100 : data.yield_percent,
                updatedAt: data.updated_at
            };
        } catch (err) {
            console.error('Error saving conversion:', err);
            throw err;
        }
    },

    /**
     * Get conversion data for a specific ingredient
     */
    async getConversion(ingredientName) {
        try {
            const userId = await this._getCurrentUserId();
            if (!userId) return null;
            const { data, error } = await supabase
                .from('unit_conversions')
                .select('*')
                .eq('ingredient_name', ingredientName)
                .eq('user_id', userId)
                .single();

            if (error) {
                // PGRST116 is code for no rows returned (single())
                if (error.code === 'PGRST116') {
                    return null;
                }
                console.warn('Error fetching conversion:', error);
                return null;
            }

            // Map DB snake_case to app camelCase
            return {
                ingredientName: data.ingredient_name,
                packetSize: data.packet_size,
                packetUnit: data.packet_unit,
                lastPrice: data.last_price,
                vendor: data.vendor || '',
                itemCategory: normalizeItemCategory(data.item_category),
                yieldPercent: (data.yield_percent === null || data.yield_percent === undefined) ? 100 : data.yield_percent,
                updatedAt: data.updated_at
            };
        } catch (err) {
            console.error('Error in getConversion:', err);
            return null;
        }
    },

    /**
     * Get ALL conversions (useful for bulk loading in forms)
     */
    async getAllConversions() {
        try {
            const userId = await this._getCurrentUserId();
            if (!userId) return new Map();
            const { data, error } = await supabase
                .from('unit_conversions')
                .select('*')
                .eq('user_id', userId);

            if (error) throw error;

            const map = new Map();
            data.forEach(item => {
                map.set(item.ingredient_name, {
                    ingredientName: item.ingredient_name,
                    packetSize: item.packet_size,
                    packetUnit: item.packet_unit,
                    lastPrice: item.last_price,
                    vendor: item.vendor || '',
                    itemCategory: normalizeItemCategory(item.item_category),
                    yieldPercent: (item.yield_percent === null || item.yield_percent === undefined) ? 100 : item.yield_percent,
                    updatedAt: item.updated_at
                });
            });
            return map;
        } catch (err) {
            console.error('Error in getAllConversions:', err);
            return new Map();
        }
    },

    /**
     * Delete a conversion entry
     */
    async deleteConversion(ingredientName) {
        try {
            const userId = await this._getCurrentUserId();
            if (!userId) throw new Error('ログインが必要です');
            const { error } = await supabase
                .from('unit_conversions')
                .delete()
                .eq('ingredient_name', ingredientName)
                .eq('user_id', userId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('Error deleting conversion:', err);
            throw err;
        }
    },

    /**
     * Admin-only: copy ingredient master (unit_conversions + csv_unit_overrides) to another account.
     * One-time copy, no sync.
     */
    async adminCopyIngredientMasterToUser(targetProfileId, { overwrite = false } = {}) {
        const id = String(targetProfileId || '').trim();
        if (!id) throw new Error('コピー先アカウントを選択してください');
        const { data, error } = await supabase.rpc('admin_copy_ingredient_master', {
            target_profile_id: id,
            overwrite: overwrite === true
        });
        if (error) throw error;
        return data;
    }
};
