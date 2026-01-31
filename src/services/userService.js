import { supabase } from '../supabase';

export const userService = {
    async fetchAllUsers() {
        const { data: users, error } = await supabase
            .from('app_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Use RPC to get accurate counts (bypass RLS)
        const { data: counts, error: countError } = await supabase
            .rpc('get_user_recipe_counts');

        if (countError) {
            console.error("Failed to fetch counts via RPC", countError);
            return users.map(u => ({ ...u, recipeCount: 0 }));
        }

        // Map counts to users
        return users.map(user => {
            const match = counts.find(c => c.user_id === user.id);
            return {
                ...user,
                recipeCount: match ? match.count : 0
            };
        });
    },

    async deleteUser(userId) {
        const { error } = await supabase
            .from('app_users')
            .delete()
            .eq('id', userId);

        if (error) throw error;
        return true;
    },

    async updateUser(userId, updates) {
        const { data, error } = await supabase
            .from('app_users')
            .update(updates)
            .eq('id', userId)
            // Select id and preference
            .select('id, show_master_recipes')
            .single();

        if (error) throw error;
        return data;
    },

    // Password Recovery Methods
    async getSecurityQuestion(userId) {
        const { data, error } = await supabase
            .from('app_users')
            .select('secret_question')
            .eq('id', userId)
            .single();

        if (error || !data) throw new Error("ユーザーが見つかりません");
        return data.secret_question;
    },

    async verifySecurityAnswer(userId, answer) {
        const { data, error } = await supabase
            .from('app_users')
            .select('secret_answer')
            .eq('id', userId)
            .single();

        if (error || !data) throw new Error("ユーザーが見つかりません");
        // Simple case-insensitive check could be nice, but strict for now
        return data.secret_answer === answer;
    },

    async resetPassword(userId, newPassword) {
        const { error } = await supabase
            .from('app_users')
            .update({ password: newPassword })
            .eq('id', userId);

        if (error) throw error;
        return true;
    },

    async updateLastLogin(userId) {
        const { error } = await supabase
            .from('app_users')
            .update({ last_login_at: new Date() })
            .eq('id', userId);

        if (error) console.error("Failed to update last login", error);
    }
};
