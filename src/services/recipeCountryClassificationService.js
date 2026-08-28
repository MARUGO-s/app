import { supabase } from '../supabase';

const getFunctionsBaseUrl = () => {
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    return `${String(url).replace(/\/$/, '')}/functions/v1`;
};

const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error('ログインセッションがありません');
    return token;
};

/**
 * レシピの国フィールドを Gemini で推定（1チャンク分）
 * @returns {Promise<object>}
 */
export const classifyRecipeCountriesChunk = async ({
    limit = 12,
    onlyMissing = true,
    overwrite = false,
    dryRun = false,
    afterId = 0,
} = {}) => {
    const token = await getAccessToken();
    const response = await fetch(`${getFunctionsBaseUrl()}/classify-recipe-countries`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit, onlyMissing, overwrite, dryRun, afterId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || `国の推定に失敗しました (${response.status})`);
    }
    return payload;
};

/**
 * 未設定のレシピすべてに国を推定して保存
 */
export const classifyAllRecipeCountries = async ({
    onlyMissing = true,
    overwrite = false,
    dryRun = false,
    onProgress,
} = {}) => {
    let afterId = 0;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const samples = [];

    while (true) {
        const chunk = await classifyRecipeCountriesChunk({
            limit: 12,
            onlyMissing,
            overwrite,
            dryRun,
            afterId,
        });

        totalProcessed += chunk.processed || 0;
        totalUpdated += chunk.updated || 0;
        totalFailed += chunk.failed || 0;

        for (const row of chunk.results || []) {
            if (samples.length < 20 && row.country) {
                samples.push(row);
            }
        }

        if (typeof onProgress === 'function') {
            onProgress({
                totalProcessed,
                totalUpdated,
                totalFailed,
                lastChunk: chunk,
            });
        }

        if (!chunk.hasMore) break;
        afterId = chunk.nextAfterId || afterId;
    }

    return { totalProcessed, totalUpdated, totalFailed, samples, dryRun };
};
