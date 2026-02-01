import { supabase } from '../supabase';

export const userService = {
    async fetchAllProfiles() {
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
        const res1 = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', profileId)
            .select('id, display_id, email, role, show_master_recipes, created_at, updated_at')
            .single();

        if (!res1.error) return res1.data;

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
            redirectTo: window.location.origin
        });
        if (error) throw error;
        return true;
    }
};
