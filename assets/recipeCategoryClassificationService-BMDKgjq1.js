const n=`import { supabase } from '../supabase';

const getFunctionsBaseUrl = () => {
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    return \`\${String(url).replace(/\\/$/, '')}/functions/v1\`;
};

const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error('ログインセッションがありません');
    return token;
};

/**
 * レシピのカテゴリーを Gemini で推定（1チャンク分）
 */
export const classifyRecipeCategoriesChunk = async ({
    limit = 12,
    onlyMissing = false,
    overwrite = true,
    forceRewrite = true,
    dryRun = false,
    afterId = 0,
} = {}) => {
    const token = await getAccessToken();
    const response = await fetch(\`\${getFunctionsBaseUrl()}/classify-recipe-categories\`, {
        method: 'POST',
        headers: {
            Authorization: \`Bearer \${token}\`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit, onlyMissing, overwrite, forceRewrite, dryRun, afterId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error || \`カテゴリーの推定に失敗しました (\${response.status})\`);
    }
    return payload;
};

/**
 * 全レシピのカテゴリーを案Aの固定カテゴリーに Gemini で一括変換
 */
export const classifyAllRecipeCategories = async ({
    onlyMissing = false,
    overwrite = true,
    forceRewrite = true,
    dryRun = false,
    onProgress,
} = {}) => {
    let afterId = 0;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const samples = [];

    while (true) {
        const chunk = await classifyRecipeCategoriesChunk({
            limit: 12,
            onlyMissing,
            overwrite,
            forceRewrite,
            dryRun,
            afterId,
        });

        totalProcessed += chunk.processed || 0;
        totalUpdated += chunk.updated || 0;
        totalSkipped += chunk.skipped || 0;
        totalFailed += chunk.failed || 0;

        for (const row of chunk.results || []) {
            if (samples.length < 20 && row.category && !row.skipped) {
                samples.push(row);
            }
        }

        if (typeof onProgress === 'function') {
            onProgress({
                totalProcessed,
                totalUpdated,
                totalSkipped,
                totalFailed,
                lastChunk: chunk,
            });
        }

        if (!chunk.hasMore) break;
        afterId = chunk.nextAfterId || afterId;
    }

    return {
        totalProcessed,
        totalUpdated,
        totalSkipped,
        totalFailed,
        samples,
        dryRun,
    };
};
`;export{n as default};
