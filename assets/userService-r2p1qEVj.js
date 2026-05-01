const r=`import { supabase } from '../supabase';

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

const PROFILE_SELECT_FIELD_SETS = [
    'id, display_id, email, store_name, role, show_master_recipes, created_at, updated_at',
    'id, display_id, email, role, show_master_recipes, created_at, updated_at',
    'id, display_id, store_name, role, show_master_recipes, created_at, updated_at',
    'id, display_id, role, show_master_recipes, created_at, updated_at',
];

const STORE_NAME_MAX_LENGTH = 100;
const DISPLAY_ID_MAX_LENGTH = 50;
const DISPLAY_ID_RE = /^[a-zA-Z0-9_-]+$/;

const normalizeStoreName = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const validateStoreName = (value) => {
    const normalized = normalizeStoreName(value);
    if (normalized && normalized.length > STORE_NAME_MAX_LENGTH) {
        throw new Error(\`店舗名は\${STORE_NAME_MAX_LENGTH}文字以内で入力してください。\`);
    }
    return normalized;
};

const validateDisplayId = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error('表示IDを入力してください。');
    if (normalized.length > DISPLAY_ID_MAX_LENGTH) {
        throw new Error(\`表示IDは\${DISPLAY_ID_MAX_LENGTH}文字以内で入力してください。\`);
    }
    if (!DISPLAY_ID_RE.test(normalized)) {
        throw new Error('表示IDは半角英数字・アンダースコア・ハイフンのみ使用できます。');
    }
    return normalized;
};

const isRpcSignatureOrMissingError = (error) => {
    const code = String(error?.code || '').toUpperCase();
    const text = [error?.message, error?.details, error?.hint]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
    if (code === 'PGRST202' || code === 'PGRST204') return true;
    return text.includes('could not find the function') || text.includes('schema cache');
};

const toStoreAssignmentError = (error) => {
    if (!error) return new Error('店舗配属の保存に失敗しました。');
    if (isRpcSignatureOrMissingError(error)) {
        return new Error('店舗配属の保存に失敗しました。DB側の最新マイグレーション適用後に再実行してください。');
    }
    return error instanceof Error ? error : new Error(String(error?.message || error));
};

const hasMissingProfileColumnError = (error, columnName) => (
    String(error?.message || '').toLowerCase().includes(String(columnName || '').toLowerCase())
);

const shouldRetryProfileColumnFallback = (error) => (
    hasMissingProfileColumnError(error, 'email')
    || hasMissingProfileColumnError(error, 'store_name')
);

const selectAllProfilesDirect = async () => {
    let lastError = null;

    for (const fields of PROFILE_SELECT_FIELD_SETS) {
        const result = await supabase
            .from('profiles')
            .select(fields)
            .order('created_at', { ascending: false });

        if (!result.error) {
            return result.data || [];
        }

        lastError = result.error;
        if (!shouldRetryProfileColumnFallback(lastError)) {
            throw lastError;
        }
    }

    throw lastError || new Error('profiles select failed');
};

const hasStoreNameFieldInProfiles = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return true;
    return rows.some((row) => row && Object.prototype.hasOwnProperty.call(row, 'store_name'));
};

const updateProfileDirectWithFallback = async (profileId, updates) => {
    let lastError = null;

    for (const fields of PROFILE_SELECT_FIELD_SETS) {
        const result = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', profileId)
            .select(fields)
            .single();

        if (!result.error) {
            return result.data;
        }

        lastError = result.error;
        if (!shouldRetryProfileColumnFallback(lastError)) {
            throw lastError;
        }
    }

    throw lastError || new Error('profiles update failed');
};

export const userService = {
    async fetchAllProfiles() {
        // Prefer admin RPC if available (profiles RLS may restrict direct SELECT).
        try {
            const { data, error } = await supabase.rpc('admin_list_profiles');
            if (!error && Array.isArray(data)) {
                if (hasStoreNameFieldInProfiles(data)) {
                    return data;
                }

                try {
                    return await selectAllProfilesDirect();
                } catch (fallbackError) {
                    console.warn('profiles direct select fallback failed after old admin_list_profiles RPC:', fallbackError);
                    return data;
                }
            }
            if (error) {
                // Fall back to direct SELECT for older DBs or non-admin users.
                console.warn('admin_list_profiles RPC failed (fallback to direct select):', error);
            }
        } catch (e) {
            console.warn('admin_list_profiles RPC threw (fallback to direct select):', e);
        }

        return selectAllProfilesDirect();
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
        try {
            return await updateProfileDirectWithFallback(profileId, updates);
        } catch (res1Error) {
            if (rpcError && isMasterPrefOnlyUpdate) {
                console.error('Direct update also failed:', res1Error);
                throw new Error(\`設定の保存に失敗しました。(RPC: \${rpcError.message})\`);
            }

            throw res1Error;
        }
    }
    ,

    async adminSetProfileStoreName(profileId, storeName) {
        const normalizedStoreName = validateStoreName(storeName);
        let rpcFailure = null;
        const rpcParamCandidates = [
            { target_profile_id: profileId, new_store_name: normalizedStoreName },
            { p_target_profile_id: profileId, p_new_store_name: normalizedStoreName },
        ];

        for (const params of rpcParamCandidates) {
            try {
                const { data, error } = await supabase.rpc('admin_set_profile_store_name', params);
                if (error) throw error;

                const row = normalizeProfileRow(data);
                if (row) return row;
                return await this.fetchAllProfiles().then((rows) => rows.find((rowItem) => rowItem.id === profileId));
            } catch (error) {
                rpcFailure = error;
                console.warn('RPC admin_set_profile_store_name failed:', error);
                if (!isRpcSignatureOrMissingError(error)) break;
            }
        }

        try {
            return await this.updateProfile(profileId, { store_name: normalizedStoreName });
        } catch (fallbackError) {
            throw toStoreAssignmentError(rpcFailure || fallbackError);
        }
    },

    async adminGetLoginLogs(userId) {
        const { data, error } = await supabase.rpc('admin_get_login_logs', {
            p_user_id: userId
        });
        if (error) throw error;
        return data || [];
    },

    async adminGetApiActivityInRange({ fromIso, toIso }) {
        const from = String(fromIso || '').trim();
        const to = String(toIso || '').trim();
        if (!from || !to) return [];

        const PAGE_SIZE = 1000;
        const latestByUser = new Map();

        for (let offset = 0; ; offset += PAGE_SIZE) {
            const { data, error } = await supabase
                .from('api_usage_logs')
                .select('user_id, created_at')
                .not('user_id', 'is', null)
                .gte('created_at', from)
                .lt('created_at', to)
                .order('created_at', { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);
            if (error) throw error;

            const rows = Array.isArray(data) ? data : [];
            rows.forEach((row) => {
                const userId = String(row?.user_id || '').trim();
                const createdAt = String(row?.created_at || '').trim();
                if (!userId || !createdAt) return;
                if (!latestByUser.has(userId)) {
                    latestByUser.set(userId, createdAt);
                }
            });

            if (rows.length < PAGE_SIZE) break;
        }

        return Array.from(latestByUser.entries()).map(([user_id, last_api_at]) => ({
            user_id,
            last_api_at,
        }));
    },

    async adminGetUserApiLogsInRange({ userId, fromIso, toIso, limit = 300 }) {
        const targetUserId = String(userId || '').trim();
        const from = String(fromIso || '').trim();
        const to = String(toIso || '').trim();
        const maxRows = Math.max(1, Math.min(1000, Number(limit) || 300));
        if (!targetUserId || !from || !to) return [];

        const { data, error } = await supabase
            .from('api_usage_logs')
            .select('created_at, api_name, endpoint, model_name, status, input_tokens, output_tokens, duration_ms, estimated_cost_jpy, metadata, error_message')
            .eq('user_id', targetUserId)
            .gte('created_at', from)
            .lt('created_at', to)
            .order('created_at', { ascending: false })
            .limit(maxRows);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    },

    async adminGetUserApiLogs({ userId, limit = 300 }) {
        const targetUserId = String(userId || '').trim();
        const maxRows = Math.max(1, Math.min(1000, Number(limit) || 300));
        if (!targetUserId) return [];

        const { data, error } = await supabase
            .from('api_usage_logs')
            .select('created_at, api_name, endpoint, model_name, status, input_tokens, output_tokens, duration_ms, estimated_cost_jpy, metadata, error_message')
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false })
            .limit(maxRows);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    },

    async adminGetUserPresence() {
        const { data, error } = await supabase
            .from('user_presence')
            .select('user_id, is_online, last_seen_at')
            .order('last_seen_at', { ascending: false });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    },

    async adminResetPassword(userId, newPassword) {
        const { data, error } = await supabase.functions.invoke('admin-reset-password', {
            body: { userId, newPassword }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        supabase.rpc('admin_write_audit_log', {
            p_action: 'reset_password',
            p_target_id: userId,
        }).catch((e) => console.warn('audit log failed:', e));
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
        // 監査ログ（失敗しても操作自体はブロックしない）
        supabase.rpc('admin_write_audit_log', {
            p_action: 'set_role',
            p_target_id: userId,
            p_detail: { new_role: newRole },
        }).catch((e) => console.warn('audit log failed:', e));
        return true;
    },

    async adminDeleteUser(userId) {
        const { error } = await supabase.rpc('admin_delete_user', {
            p_user_id: userId
        });
        if (error) throw error;
        supabase.rpc('admin_write_audit_log', {
            p_action: 'delete_user',
            p_target_id: userId,
        }).catch((e) => console.warn('audit log failed:', e));
        return true;
    }
};
`;export{r as default};
