import { supabase } from '../supabase.js';

const TABLE_NAME = 'ingredient_vendor_orders';

const isMissingTableError = (error) => {
    return String(error?.code || '') === '42P01'
        || String(error?.message || '').toLowerCase().includes('does not exist');
};

export const vendorOrderService = {
    async getAll(userId) {
        const uid = String(userId || '').trim();
        if (!uid) return [];

        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('vendor_name,sort_order')
            .eq('user_id', uid)
            .order('sort_order', { ascending: true })
            .order('vendor_name', { ascending: true });

        if (error) {
            if (isMissingTableError(error)) return [];
            throw error;
        }

        return (data || [])
            .map((row) => String(row?.vendor_name || '').trim())
            .filter(Boolean);
    },

    async saveOrder(userId, vendorKeys) {
        const uid = String(userId || '').trim();
        if (!uid) throw new Error('User ID is required');

        const unique = [];
        const seen = new Set();
        (vendorKeys || []).forEach((raw) => {
            const key = String(raw || '').trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            unique.push(key);
        });

        if (unique.length === 0) return;

        const now = new Date().toISOString();
        const rows = unique.map((vendorName, index) => ({
            user_id: uid,
            vendor_name: vendorName,
            sort_order: index,
            updated_at: now,
        }));

        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert(rows, { onConflict: 'user_id,vendor_name' });

        if (error) {
            if (isMissingTableError(error)) {
                throw new Error('DBに ingredient_vendor_orders テーブルがありません（マイグレーション未適用）');
            }
            throw error;
        }
    },
};

