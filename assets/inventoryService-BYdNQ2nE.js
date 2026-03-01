const e=`import { supabase } from '../supabase';

const TABLE_NAME = 'inventory_items';
const SNAPSHOT_TABLE = 'inventory_snapshots';
const DELETED_SNAPSHOT_TABLE = 'deleted_inventory_snapshots';

const isMissingColumnError = (error, columnName) => {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    // Postgres: undefined_column = 42703
    if (code === '42703') return msg.toLowerCase().includes(String(columnName).toLowerCase());
    return msg.toLowerCase().includes(\`column "\${String(columnName).toLowerCase()}"\`) && msg.toLowerCase().includes('does not exist');
};

export const inventoryService = {
    getAll: async (userId) => {
        if (!userId) return [];
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching inventory:', error);
            return [];
        }
        return data || [];
    },

    add: async (userId, item) => {
        if (!userId) throw new Error("User ID is required");
        // Remove id if it's empty or phantom temp ID, let DB generate it?
        // Or if we want to use the ID we generated?
        // Supabase usually generates UUID or ID.
        // Let's strip the ID if it's not a real one from DB (though we can't easily know).
        // For new items, we usually don't send ID.
        // Strip any UI-only fields before DB insert
        const { id: _id, isPhantom: _isPhantom, _master, _csv, ...itemData } = item;

        const tax10OverrideRaw = item?.tax10_override ?? item?.tax10Override;
        const hasTax10 = Object.prototype.hasOwnProperty.call(item || {}, 'tax10');
        const hasTax10Override =
            Object.prototype.hasOwnProperty.call(item || {}, 'tax10_override') ||
            Object.prototype.hasOwnProperty.call(item || {}, 'tax10Override');
        const normalizedName = String(itemData?.name ?? '').trim();
        const normalizedVendor = String(itemData?.vendor ?? '').trim();

        const payload = {
            ...itemData,
            name: normalizedName,
            vendor: normalizedVendor || null,
            user_id: userId,
            // Ensure numeric fields are numbers
            quantity: parseFloat(item.quantity) || 0,
            threshold: parseFloat(item.threshold) || 0,
            price: parseFloat(item.price) || 0
        };
        if (hasTax10) payload.tax10 = !!item.tax10;
        if (hasTax10Override) payload.tax10_override = !!tax10OverrideRaw;

        const executeInsert = async (body) => supabase
            .from(TABLE_NAME)
            .insert([body])
            .select()
            .single();

        let { data, error } = await executeInsert(payload);

        if (error) {
            const shouldDropTax10 = isMissingColumnError(error, 'tax10');
            const shouldDropTax10Override = isMissingColumnError(error, 'tax10_override');
            if (shouldDropTax10 || shouldDropTax10Override) {
                const fallbackPayload = { ...payload };
                if (shouldDropTax10) delete fallbackPayload.tax10;
                if (shouldDropTax10Override) delete fallbackPayload.tax10_override;
                ({ data, error } = await executeInsert(fallbackPayload));
            }
        }

        if (error && String(error?.code || '') === '23505') {
            // Unique-key collision (same user/name/vendor) -> update the latest existing row instead.
            let query = supabase
                .from(TABLE_NAME)
                .select('*')
                .eq('user_id', userId)
                .eq('name', normalizedName)
                .order('updated_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(1);

            if (normalizedVendor) query = query.eq('vendor', normalizedVendor);
            else query = query.is('vendor', null);

            const { data: existingRows, error: fetchExistingError } = await query;
            if (!fetchExistingError && Array.isArray(existingRows) && existingRows.length > 0) {
                const existing = existingRows[0];
                return await inventoryService.update(userId, {
                    ...existing,
                    ...payload,
                    id: existing.id,
                });
            }
        }

        if (error) {
            console.error('Error adding item:', error);
            throw error;
        }
        return data;
    },

    update: async (userId, item) => {
        if (!userId) throw new Error("User ID is required");
        // We absolutely need ID to update
        if (!item.id) throw new Error("Item ID is required for update");

        // Strip any UI-only fields before DB update
        const { id: _id, isPhantom: _isPhantom, created_at: _createdAt, _master, _csv, ...itemData } = item;

        const tax10OverrideRaw = item?.tax10_override ?? item?.tax10Override;
        const hasTax10 = Object.prototype.hasOwnProperty.call(item || {}, 'tax10');
        const hasTax10Override =
            Object.prototype.hasOwnProperty.call(item || {}, 'tax10_override') ||
            Object.prototype.hasOwnProperty.call(item || {}, 'tax10Override');
        const payload = {
            ...itemData,
            name: Object.prototype.hasOwnProperty.call(itemData || {}, 'name')
                ? String(itemData.name ?? '').trim()
                : itemData.name,
            vendor: Object.prototype.hasOwnProperty.call(itemData || {}, 'vendor')
                ? (String(itemData.vendor ?? '').trim() || null)
                : itemData.vendor,
            quantity: parseFloat(item.quantity) || 0,
            threshold: parseFloat(item.threshold) || 0,
            price: parseFloat(item.price) || 0,
            updated_at: new Date().toISOString()
        };
        if (hasTax10) payload.tax10 = !!item.tax10;
        if (hasTax10Override) payload.tax10_override = !!tax10OverrideRaw;

        const executeUpdate = async (body) => supabase
            .from(TABLE_NAME)
            .update(body)
            .eq('id', item.id)
            .eq('user_id', userId)
            .select()
            .single();

        let { data, error } = await executeUpdate(payload);

        if (error) {
            const shouldDropTax10 = isMissingColumnError(error, 'tax10');
            const shouldDropTax10Override = isMissingColumnError(error, 'tax10_override');
            if (shouldDropTax10 || shouldDropTax10Override) {
                const fallbackPayload = { ...payload };
                if (shouldDropTax10) delete fallbackPayload.tax10;
                if (shouldDropTax10Override) delete fallbackPayload.tax10_override;
                ({ data, error } = await executeUpdate(fallbackPayload));
            }
        }

        if (error) {
            console.error('Error updating item:', error);
            throw error;
        }
        return data;
    },

    delete: async (userId, id) => {
        if (!userId) throw new Error("User ID is required");
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error deleting item:', error);
            throw error;
        }
    },

    // Adjust quantity relative
    adjustStock: async (userId, id, delta) => {
        if (!userId) throw new Error("User ID is required");
        // For atomic updates, maybe use RPC? Or read-update-write constraint check?
        // Simple approach: Get current -> Update
        // Better: custom RPC function 'increment_stock' if available.
        // For now, simpler approach:
        const { data: currentItem, error: fetchError } = await supabase
            .from(TABLE_NAME)
            .select('quantity')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !currentItem) throw new Error("Item not found");

        const newQuantity = Math.max(0, (currentItem.quantity || 0) + delta);

        const { data, error } = await supabase
            .from(TABLE_NAME)
            .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    clearAll: async (userId) => {
        if (!userId) throw new Error("User ID is required");
        // Delete all rows
        // Note: DELETE without WHERE is blocked by default safety settings in Supabase clients usually, 
        // unless you allow it or use a broad condition like id > 0 (if int) or something.
        // Or simply delete where id is not null.
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('user_id', userId)
            // Broad condition that works for both bigint/uuid ids
            .not('id', 'is', null);
        // .neq('id', '00000000-0000-0000-0000-000000000000') maybe?
        // Safer: Fetch IDs then delete? Or just try standard delete without filter if policy allows.

        // 'neq' id 0 works for int IDs. For UUIDs: .neq('id', '00000000-0000-0000-0000-000000000000') 
        // Let's assume standard behavior. If it fails, we might need a better wildcard.

        if (error) {
            console.error('Error clearing inventory:', error);
            throw error;
        }
    },

    // --- Ignore List Features ---

    getIgnoredItems: async (userId) => {
        if (!userId) return new Set();
        const { data, error } = await supabase
            .from('ignored_items')
            .select('name')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching ignored items:', error);
            return new Set();
        }
        return new Set(data.map(i => i.name));
    },

    ignoreItem: async (userId, name) => {
        if (!userId) throw new Error("User ID is required");
        if (!name) return;
        const { error } = await supabase
            .from('ignored_items')
            .insert([{ user_id: userId, name }])
            .select();

        if (error) {
            // Ignore unique violation (already ignored)
            if (error.code !== '23505') {
                console.error('Error ignoring item:', error);
                throw error;
            }
        }
    },

    // --- Snapshot / History Features ---

    getSnapshots: async (userId) => {
        if (!userId) return [];
        const { data, error } = await supabase
            .from(SNAPSHOT_TABLE)
            .select('*')
            .eq('user_id', userId)
            .order('snapshot_date', { ascending: false });

        if (error) {
            console.error('Error fetching snapshots:', error);
            return [];
        }
        return data || [];
    },

    getDeletedSnapshots: async (userId) => {
        if (!userId) return [];
        const { data, error } = await supabase
            .from(DELETED_SNAPSHOT_TABLE)
            .select('*')
            .eq('user_id', userId)
            .order('deleted_at', { ascending: false });

        if (error) {
            console.error('Error fetching deleted snapshots:', error);
            return [];
        }
        return data || [];
    },

    createSnapshot: async (userId, title, items, totalValue) => {
        if (!userId) throw new Error("User ID is required");
        // Prefer user-scoped insert; fallback for older DB schema without user_id.
        let data = null;
        let error = null;

        const res1 = await supabase
            .from(SNAPSHOT_TABLE)
            .insert([{
                user_id: userId,
                title,
                items, // JSONB
                total_value: totalValue,
                snapshot_date: new Date().toISOString()
            }])
            .select()
            .single();

        data = res1.data ?? null;
        error = res1.error ?? null;

        if (error && isMissingColumnError(error, 'user_id')) {
            const res2 = await supabase
                .from(SNAPSHOT_TABLE)
                .insert([{
                    title,
                    items,
                    total_value: totalValue,
                    snapshot_date: new Date().toISOString()
                }])
                .select()
                .single();
            data = res2.data ?? null;
            error = res2.error ?? null;
        }

        if (error) {
            console.error('Error creating snapshot:', error);
            throw error;
        }
        return data;
    },

    /**
     * Move a snapshot to trash (soft delete).
     * - Inserts the snapshot into deleted_inventory_snapshots
     * - Deletes it from inventory_snapshots
     */
    deleteSnapshotToTrash: async (userId, snapshotId) => {
        if (!userId) throw new Error("User ID is required");
        if (!snapshotId) throw new Error("Snapshot ID is required");

        // 1) Fetch snapshot
        const { data: snapshot, error: fetchError } = await supabase
            .from(SNAPSHOT_TABLE)
            .select('*')
            .eq('id', snapshotId)
            .eq('user_id', userId)
            .single();

        if (fetchError || !snapshot) {
            console.error('Error fetching snapshot for delete:', fetchError);
            throw fetchError || new Error('Snapshot not found');
        }

        // 2) Insert into trash
        const { error: insertError } = await supabase
            .from(DELETED_SNAPSHOT_TABLE)
            .insert([{
                original_id: snapshot.id,
                user_id: userId,
                title: snapshot.title,
                items: snapshot.items,
                total_value: snapshot.total_value,
                snapshot_date: snapshot.snapshot_date,
                created_at: snapshot.created_at,
                deleted_at: new Date().toISOString()
            }]);

        if (insertError) {
            console.error('Error moving snapshot to trash:', insertError);
            throw insertError;
        }

        // 3) Delete from main table
        const { error: deleteError } = await supabase
            .from(SNAPSHOT_TABLE)
            .delete()
            .eq('id', snapshotId)
            .eq('user_id', userId);

        if (deleteError) {
            console.error('Error deleting snapshot from main table:', deleteError);
            throw deleteError;
        }

        return true;
    },

    /**
     * Restore a snapshot from trash.
     * - Inserts back into inventory_snapshots
     * - Deletes from deleted_inventory_snapshots
     */
    restoreSnapshotFromTrash: async (userId, deletedId) => {
        if (!userId) throw new Error("User ID is required");
        if (!deletedId) throw new Error("Deleted snapshot ID is required");

        const { data: deletedRow, error: fetchError } = await supabase
            .from(DELETED_SNAPSHOT_TABLE)
            .select('*')
            .eq('id', deletedId)
            .eq('user_id', userId)
            .single();

        if (fetchError || !deletedRow) {
            console.error('Error fetching deleted snapshot:', fetchError);
            throw fetchError || new Error('Deleted snapshot not found');
        }

        // Try to restore with original_id for continuity; if it conflicts, fallback to new UUID
        let insertError = null;
        {
            const { error } = await supabase
                .from(SNAPSHOT_TABLE)
                .insert([{
                    id: deletedRow.original_id,
                    user_id: userId,
                    title: deletedRow.title,
                    items: deletedRow.items,
                    total_value: deletedRow.total_value,
                    snapshot_date: deletedRow.snapshot_date,
                    created_at: deletedRow.created_at
                }]);
            insertError = error;
        }

        if (insertError) {
            // Conflict or schema mismatch → try without id
            const { error: fallbackError } = await supabase
                .from(SNAPSHOT_TABLE)
                .insert([{
                    user_id: userId,
                    title: deletedRow.title,
                    items: deletedRow.items,
                    total_value: deletedRow.total_value,
                    snapshot_date: deletedRow.snapshot_date,
                    created_at: deletedRow.created_at
                }]);
            if (fallbackError) {
                console.error('Error restoring snapshot (fallback) :', fallbackError);
                throw fallbackError;
            }
        }

        const { error: deleteError } = await supabase
            .from(DELETED_SNAPSHOT_TABLE)
            .delete()
            .eq('id', deletedId)
            .eq('user_id', userId);

        if (deleteError) {
            console.error('Error removing restored snapshot from trash:', deleteError);
            throw deleteError;
        }

        return true;
    },

    /**
     * Hard delete ONLY from trash.
     */
    hardDeleteSnapshotFromTrash: async (userId, deletedId) => {
        if (!userId) throw new Error("User ID is required");
        if (!deletedId) throw new Error("Deleted snapshot ID is required");
        const { error } = await supabase
            .from(DELETED_SNAPSHOT_TABLE)
            .delete()
            .eq('id', deletedId)
            .eq('user_id', userId);

        if (error) {
            console.error('Error hard deleting snapshot from trash:', error);
            throw error;
        }
        return true;
    },

    resetStockQuantities: async (userId) => {
        if (!userId) throw new Error("User ID is required");
        // Reset all quantities to 0, but keep prices and other info
        // This is safer than delete, as it keeps the master data

        // Note: Supabase/Postgres UPDATE without WHERE affects all rows.
        // We need to enable this or use a broad WHERE.
        const res1 = await supabase
            .from(TABLE_NAME)
            .update({ quantity: 0, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            // Broad condition that works for both bigint/uuid ids
            .not('id', 'is', null);

        if (!res1.error) return;

        if (isMissingColumnError(res1.error, 'user_id')) {
            // Fallback (older schema): reset all rows (no user scoping possible)
            const res2 = await supabase
                .from(TABLE_NAME)
                .update({ quantity: 0, updated_at: new Date().toISOString() })
                .not('id', 'is', null);
            if (res2.error) {
                console.error('Error resetting quantities (fallback):', res2.error);
                throw res2.error;
            }
            return;
        }

        console.error('Error resetting quantities:', res1.error);
        throw res1.error;
    }
};
`;export{e as default};
