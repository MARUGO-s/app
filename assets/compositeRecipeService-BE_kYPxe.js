const e=`import { supabase } from '../supabase';

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
};

const sanitizeRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row, index) => ({
            recipe_id: row?.recipeId ? Number(row.recipeId) : null,
            usage_amount: toFiniteNumber(row?.usageAmount),
            sort_order: index,
        }))
        .filter((row) => Number.isFinite(row.recipe_id));
};

export const compositeRecipeService = {
    async createSet(payload) {
        const headerPayload = {
            dish_name: String(payload?.dishName || '').trim(),
            base_recipe_id: Number(payload?.baseRecipeId),
            base_usage_amount: toFiniteNumber(payload?.currentUsageAmount),
            sales_price: toFiniteNumber(payload?.salesPrice),
            sales_count: toFiniteNumber(payload?.salesCount),
            total_cost_tax_included: toFiniteNumber(payload?.totalCompositeCost),
        };
        const { data: header, error: headerError } = await supabase
            .from('recipe_composite_sets')
            .insert([headerPayload])
            .select('id')
            .single();
        if (headerError) throw headerError;

        const itemsPayload = sanitizeRows(payload?.rows).map((row) => ({
            ...row,
            composite_set_id: header.id,
        }));
        if (itemsPayload.length > 0) {
            const { error: itemsError } = await supabase
                .from('recipe_composite_set_items')
                .insert(itemsPayload);
            if (itemsError) throw itemsError;
        }
        return header.id;
    },

    async updateSet(id, payload) {
        const now = new Date().toISOString();
        const { error: headerError } = await supabase
            .from('recipe_composite_sets')
            .update({
                dish_name: String(payload?.dishName || '').trim(),
                base_usage_amount: toFiniteNumber(payload?.currentUsageAmount),
                sales_price: toFiniteNumber(payload?.salesPrice),
                sales_count: toFiniteNumber(payload?.salesCount),
                total_cost_tax_included: toFiniteNumber(payload?.totalCompositeCost),
                updated_at: now,
            })
            .eq('id', id);
        if (headerError) throw headerError;

        const { error: deleteError } = await supabase
            .from('recipe_composite_set_items')
            .delete()
            .eq('composite_set_id', id);
        if (deleteError) throw deleteError;

        const itemsPayload = sanitizeRows(payload?.rows).map((row) => ({
            ...row,
            composite_set_id: id,
        }));
        if (itemsPayload.length > 0) {
            const { error: itemsError } = await supabase
                .from('recipe_composite_set_items')
                .insert(itemsPayload);
            if (itemsError) throw itemsError;
        }
    },

    async listSets() {
        const { data, error } = await supabase
            .from('recipe_composite_sets')
            .select('id,dish_name,base_recipe_id,total_cost_tax_included,updated_at,created_at')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getSetDetail(id) {
        const { data: header, error: headerError } = await supabase
            .from('recipe_composite_sets')
            .select('*')
            .eq('id', id)
            .single();
        if (headerError) throw headerError;

        const { data: items, error: itemsError } = await supabase
            .from('recipe_composite_set_items')
            .select('recipe_id,usage_amount,sort_order')
            .eq('composite_set_id', id)
            .order('sort_order', { ascending: true });
        if (itemsError) throw itemsError;

        return {
            ...header,
            items: items || [],
        };
    },

    async deleteSet(id) {
        const { error } = await supabase
            .from('recipe_composite_sets')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },
};
`;export{e as default};
