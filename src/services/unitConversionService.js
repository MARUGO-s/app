import { supabase } from '../supabase.js';

export const unitConversionService = {
    async _getCurrentUserId() {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        return data?.user?.id || null;
    },

    async saveConversion(ingredientName, packetSize, packetUnit, packetPrice = null) {
        try {
            const userId = await this._getCurrentUserId();
            if (!userId) throw new Error('ログインが必要です');
            // Upsert to unit_conversions table
            const { data, error } = await supabase
                .from('unit_conversions')
                .upsert({
                    user_id: userId,
                    ingredient_name: ingredientName,
                    packet_size: parseFloat(packetSize),
                    packet_unit: packetUnit,
                    last_price: packetPrice ? parseFloat(packetPrice) : null,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id,ingredient_name'
                })
                .select()
                .single();

            if (error) throw error;

            // Return in camelCase to match previous behavior
            return {
                ingredientName: data.ingredient_name,
                packetSize: data.packet_size,
                packetUnit: data.packet_unit,
                lastPrice: data.last_price,
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
    }
};
