const e=`import { supabase } from '../supabase';

const VOICE_INPUT_FLAG_KEY = 'voice_input_enabled';
const CACHE_TTL_MS = 15 * 1000;

const cache = new Map();

const setCache = (key, value) => {
    cache.set(key, { value: value === true, expiresAt: Date.now() + CACHE_TTL_MS });
};

const getCached = (key) => {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        cache.delete(key);
        return null;
    }
    return hit.value;
};

const fetchByRpc = async (key) => {
    const { data, error } = await supabase.rpc('get_feature_flag', { p_key: key });
    if (error) throw error;
    return data === true;
};

const fetchByTableFallback = async (key) => {
    const { data, error } = await supabase
        .from('app_feature_flags')
        .select('enabled')
        .eq('feature_key', key)
        .maybeSingle();

    if (error) throw error;
    return data?.enabled === true;
};

export const featureFlagService = {
    async getFlag(key, { force = false } = {}) {
        if (!force) {
            const cached = getCached(key);
            if (cached !== null) return cached;
        }

        try {
            const enabled = await fetchByRpc(key);
            setCache(key, enabled);
            return enabled;
        } catch (rpcError) {
            console.warn('[featureFlagService] RPC get_feature_flag failed, fallback to table:', rpcError);
            const enabled = await fetchByTableFallback(key);
            setCache(key, enabled);
            return enabled;
        }
    },

    async setFlag(key, enabled) {
        const normalized = enabled === true;

        try {
            const { data, error } = await supabase.rpc('admin_set_feature_flag', {
                p_key: key,
                p_enabled: normalized,
            });
            if (error) throw error;
            setCache(key, data?.enabled === true);
            return data?.enabled === true;
        } catch (rpcError) {
            console.warn('[featureFlagService] RPC admin_set_feature_flag failed, fallback to table:', rpcError);

            const { data, error } = await supabase
                .from('app_feature_flags')
                .upsert({
                    feature_key: key,
                    enabled: normalized,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'feature_key' })
                .select('enabled')
                .single();

            if (error) throw error;
            const result = data?.enabled === true;
            setCache(key, result);
            return result;
        }
    },

    async getVoiceInputEnabled() {
        // 開発中は常に有効にする
        return true;
        // return this.getFlag(VOICE_INPUT_FLAG_KEY, options);
    },

    async setVoiceInputEnabled(enabled) {
        return this.setFlag(VOICE_INPUT_FLAG_KEY, enabled);
    },

    clearCache() {
        cache.clear();
    },
};
`;export{e as default};
