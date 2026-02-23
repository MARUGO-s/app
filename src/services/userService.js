import { supabase } from '../supabase';

const normalizeProfileRow = (payload) => {
    if (!payload) return null;
    if (Array.isArray(payload)) return payload[0] || null;
    if (typeof payload === 'object') {
        if (payload.id && payload.display_id !== undefined) return payload;
        const first = Object.values(payload)[0];
        if (Array.isArray(first)) return first[0] || null;
        if (first && typeof first === 'object' && first.id) return first;
    }
    return null;
};

export const userService = {
    async fetchAllProfiles() {
        // Prefer admin RPC if available (profiles RLS may restrict direct SELECT).
        try {
            const { data, error } = await supabase.rpc('admin_list_profiles');
            if (!error && Array.isArray(data)) return data;
            if (error) {
                // Fall back to direct SELECT for older DBs or non-admin users.
                console.warn('admin_list_profiles RPC failed (fallback to direct select):', error);
            }
        } catch (e) {
            console.warn('admin_list_profiles RPC threw (fallback to direct select):', e);
        }

        // Prefer selecting email if schema supports it; fallback for older DBs.
        const res1 = await supabase
            .from('profiles')
            .select('id, display_id, email, role, show_master_recipes, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (!res1.error) return res1.data || [];

        if (String(res1.error.message || '').toLowerCase().includes('email')) {
            const res2 = await supabase
                .from('profiles')
                .select('id, display_id, role, show_master_recipes, created_at, updated_at')
                .order('created_at', { ascending: false });
            if (res2.error) throw res2.error;
            return res2.data || [];
        }

        throw res1.error;
    },

    async updateProfile(profileId, updates) {
        const updateKeys = Object.keys(updates || {});
        const isMasterPrefOnlyUpdate =
            updateKeys.length === 1 &&
            Object.prototype.hasOwnProperty.call(updates, 'show_master_recipes');

        let rpcError = null;

        if (isMasterPrefOnlyUpdate) {
            try {
                const { data, error } = await supabase.rpc('admin_set_show_master_recipes', {
                    target_profile_id: profileId,
                    enabled: updates.show_master_recipes === true
                });
                if (error) throw error;
                // If successful, return normalized data
                if (data) {
                    const row = normalizeProfileRow(data);
                    if (row) return row;
                }
            } catch (e) {
                // Determine if we should fallback
                // If the error is "insufficient_privilege", fallback won't help either (RLS).
                // But if it's "function not found" (migration missing), fallback IS needed.
                console.warn('RPC admin_set_show_master_recipes failed:', e);
                rpcError = e;
            }
        }

        // Fallback to direct update (for non-master-pref updates OR if RPC failed)
        // Note: For admin updating other users, this will FAIL if RLS 'profiles_update_own_safeguard' is active
        // and 'profiles_update_own_or_admin' is gone.
        // So we strictly rely on RPC for that specific field. 
        // But we try anyway to support "own profile" updates or other fields.

        const res1 = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', profileId)
            .select('id, display_id, email, role, show_master_recipes, created_at, updated_at')
            .single();

        if (!res1.error) return res1.data;

        // If direct update failed...
        if (rpcError && isMasterPrefOnlyUpdate) {
            // Check if direct update also failed. 
            // If so, throw the RPC error as it's more relevant for "Master Share" feature.
            // But if direct update failed with "PGRST116" (not found?) or "42501" (RLS), 
            // and we had an RPC error, we should probably throw the RPC error message if meaningful.
            console.error('Direct update also failed:', res1.error);
            throw new Error(`設定の保存に失敗しました。(RPC: ${rpcError.message})`);
        }

        if (String(res1.error.message || '').toLowerCase().includes('email')) {
            const res2 = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', profileId)
                .select('id, display_id, role, show_master_recipes, created_at, updated_at')
                .single();
            if (res2.error) throw res2.error;
            return res2.data;
        }

        throw res1.error;
    }
    ,

    async adminGetLoginLogs(userId) {
        const { data, error } = await supabase.rpc('admin_get_login_logs', {
            p_user_id: userId
        });
        if (error) throw error;
        return data || [];
    },

    async adminResetPassword(userId, newPassword) {
        const { data, error } = await supabase.functions.invoke('admin-reset-password', {
            body: { userId, newPassword }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return data;
    },

    async sendPasswordResetEmail(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + import.meta.env.BASE_URL
        });
        if (error) throw error;
        return true;
    },

    async adminSetRole(userId, newRole) {
        const { error } = await supabase.rpc('admin_set_role', {
            p_user_id: userId,
            p_role: newRole
        });
        if (error) throw error;
        return true;
    },

    async adminDeleteUser(userId) {
        const { error } = await supabase.rpc('admin_delete_user', {
            p_user_id: userId
        });
        if (error) throw error;
        return true;
    }
};
