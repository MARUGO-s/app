import { supabase } from '../supabase';

const toFiniteNumber = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
};

const normalizeSharePermission = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'editor') return 'editor';
    if (v === 'copier') return 'copier';
    return 'viewer';
};

const sanitizeRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
        .map((row, index) => {
            if (row?.itemType === 'ingredient' || row?.ingredient) {
                const ingredient = row?.ingredient || {};
                const name = String(ingredient?.name || '').trim();
                if (!name) return null;
                return {
                    item_type: 'ingredient',
                    recipe_id: null,
                    usage_amount: toFiniteNumber(row?.usageAmount),
                    sort_order: index,
                    ingredient_payload: {
                        name,
                        source: ingredient.source || '',
                        displaySource: ingredient.displaySource || '',
                        price: toFiniteNumber(ingredient.price),
                        packetSize: toFiniteNumber(ingredient.packetSize),
                        packetUnit: ingredient.packetUnit || '',
                        unit: row?.usageUnit || ingredient.unit || ingredient.defaultUsageUnit || '',
                        defaultUsageUnit: ingredient.defaultUsageUnit || ingredient.unit || '',
                        unitCostTaxExcluded: toFiniteNumber(ingredient.unitCostTaxExcluded),
                        itemCategory: ingredient.itemCategory || null,
                    },
                };
            }

            return {
                item_type: 'recipe',
                recipe_id: row?.recipeId ? Number(row.recipeId) : null,
                usage_amount: toFiniteNumber(row?.usageAmount),
                sort_order: index,
                ingredient_payload: null,
            };
        })
        .filter((row) => row && (row.item_type === 'ingredient' || Number.isFinite(row.recipe_id)));
};

export const compositeRecipeService = {
    async createSet(payload) {
        const sharePermission = normalizeSharePermission(payload?.sharePermission);
        const headerPayload = {
            dish_name: String(payload?.dishName || '').trim(),
            base_recipe_id: Number(payload?.baseRecipeId),
            base_usage_amount: toFiniteNumber(payload?.currentUsageAmount),
            sales_price: toFiniteNumber(payload?.salesPrice),
            sales_count: toFiniteNumber(payload?.salesCount),
            total_cost_tax_included: toFiniteNumber(payload?.totalCompositeCost),
            is_public: payload?.isPublic === true,
            share_permission: sharePermission,
            current_version_no: 1,
        };
        const { data: header, error: headerError } = await supabase
            .from('recipe_composite_sets')
            .insert([headerPayload])
            .select('id,created_by')
            .single();
        if (headerError) throw headerError;

        const safeRows = sanitizeRows(payload?.rows);
        const itemsPayload = safeRows.map((row) => ({
            ...row,
            composite_set_id: header.id,
        }));
        if (itemsPayload.length > 0) {
            const { error: itemsError } = await supabase
                .from('recipe_composite_set_items')
                .insert(itemsPayload);
            if (itemsError) throw itemsError;
        }
        const { error: versionError } = await supabase
            .from('recipe_composite_set_versions')
            .insert([{
                composite_set_id: header.id,
                version_no: 1,
                snapshot: {
                    dishName: String(payload?.dishName || '').trim(),
                    baseRecipeId: Number(payload?.baseRecipeId),
                    currentUsageAmount: toFiniteNumber(payload?.currentUsageAmount),
                    salesPrice: toFiniteNumber(payload?.salesPrice),
                    salesCount: toFiniteNumber(payload?.salesCount),
                    totalCompositeCost: toFiniteNumber(payload?.totalCompositeCost),
                    isPublic: payload?.isPublic === true,
                    sharePermission,
                    rows: safeRows,
                },
                created_by: header.created_by,
            }]);
        if (versionError) throw versionError;
        return header.id;
    },

    async updateSet(id, payload) {
        const now = new Date().toISOString();
        const sharePermission = normalizeSharePermission(payload?.sharePermission);
        const { data: current, error: currentError } = await supabase
            .from('recipe_composite_sets')
            .select('id,current_version_no,created_by,share_permission')
            .eq('id', id)
            .single();
        if (currentError) throw currentError;
        const nextVersionNo = Number(current?.current_version_no || 1) + 1;

        const { error: headerError } = await supabase
            .from('recipe_composite_sets')
            .update({
                dish_name: String(payload?.dishName || '').trim(),
                base_usage_amount: toFiniteNumber(payload?.currentUsageAmount),
                sales_price: toFiniteNumber(payload?.salesPrice),
                sales_count: toFiniteNumber(payload?.salesCount),
                total_cost_tax_included: toFiniteNumber(payload?.totalCompositeCost),
                is_public: payload?.isPublic === true,
                share_permission: sharePermission,
                current_version_no: nextVersionNo,
                updated_at: now,
            })
            .eq('id', id);
        if (headerError) throw headerError;

        const { error: deleteError } = await supabase
            .from('recipe_composite_set_items')
            .delete()
            .eq('composite_set_id', id);
        if (deleteError) throw deleteError;

        const safeRows = sanitizeRows(payload?.rows);
        const itemsPayload = safeRows.map((row) => ({
            ...row,
            composite_set_id: id,
        }));
        if (itemsPayload.length > 0) {
            const { error: itemsError } = await supabase
                .from('recipe_composite_set_items')
                .insert(itemsPayload);
            if (itemsError) throw itemsError;
        }
        const { error: versionError } = await supabase
            .from('recipe_composite_set_versions')
            .insert([{
                composite_set_id: id,
                version_no: nextVersionNo,
                snapshot: {
                    dishName: String(payload?.dishName || '').trim(),
                    baseRecipeId: Number(payload?.baseRecipeId),
                    currentUsageAmount: toFiniteNumber(payload?.currentUsageAmount),
                    salesPrice: toFiniteNumber(payload?.salesPrice),
                    salesCount: toFiniteNumber(payload?.salesCount),
                    totalCompositeCost: toFiniteNumber(payload?.totalCompositeCost),
                    isPublic: payload?.isPublic === true,
                    sharePermission,
                    rows: safeRows,
                },
                created_by: current?.created_by,
            }]);
        if (versionError) throw versionError;

        return { id, versionNo: nextVersionNo };
    },

    async listSets() {
        const { data, error } = await supabase
            .from('recipe_composite_sets')
            .select('id,dish_name,base_recipe_id,total_cost_tax_included,updated_at,created_at,is_public,share_permission,current_version_no,created_by')
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
            .select('recipe_id,usage_amount,sort_order,item_type,ingredient_payload')
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

    async setPublicVisibility(id, isPublic) {
        const { data: current, error: currentError } = await supabase
            .from('recipe_composite_sets')
            .select('share_permission')
            .eq('id', id)
            .single();
        if (currentError) throw currentError;
        const { error } = await supabase
            .from('recipe_composite_sets')
            .update({
                is_public: isPublic === true,
                share_permission: normalizeSharePermission(current?.share_permission),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        if (error) throw error;
    },

    async setShareSettings(id, { isPublic, sharePermission }) {
        const { error } = await supabase
            .from('recipe_composite_sets')
            .update({
                is_public: isPublic === true,
                share_permission: normalizeSharePermission(sharePermission),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        if (error) throw error;
    },

    async listSetVersions(compositeSetId) {
        const { data, error } = await supabase
            .from('recipe_composite_set_versions')
            .select('id,composite_set_id,version_no,snapshot,created_by,created_at')
            .eq('composite_set_id', compositeSetId)
            .order('version_no', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async restoreSetVersion(compositeSetId, versionNo) {
        const { data: target, error: targetError } = await supabase
            .from('recipe_composite_set_versions')
            .select('snapshot')
            .eq('composite_set_id', compositeSetId)
            .eq('version_no', versionNo)
            .single();
        if (targetError) throw targetError;
        const snapshot = target?.snapshot || {};
        return this.updateSet(compositeSetId, {
            dishName: snapshot?.dishName,
            baseRecipeId: snapshot?.baseRecipeId,
            currentUsageAmount: snapshot?.currentUsageAmount,
            salesPrice: snapshot?.salesPrice,
            salesCount: snapshot?.salesCount,
            totalCompositeCost: snapshot?.totalCompositeCost,
            isPublic: snapshot?.isPublic === true,
            sharePermission: normalizeSharePermission(snapshot?.sharePermission),
            rows: Array.isArray(snapshot?.rows) ? snapshot.rows : [],
        });
    },
};
