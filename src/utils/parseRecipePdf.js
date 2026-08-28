import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../supabase';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 180_000;

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('PDFの読み込みに失敗しました'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
});

const stripDataUrlPrefix = (dataUrl) => {
    const s = String(dataUrl || '');
    const comma = s.indexOf(',');
    if (comma >= 0) return s.slice(comma + 1).trim();
    return s.trim();
};

const extractServerError = async (response) => {
    let detail = '';
    try {
        const text = await response.text();
        if (text) {
            try {
                const parsed = JSON.parse(text);
                detail = parsed?.error || parsed?.message || text;
            } catch {
                detail = text;
            }
        }
    } catch {
        // ignore
    }
    return detail || `サーバーエラー (${response.status})`;
};

/**
 * PDFから複数レシピを抽出（Gemini / parse-recipe-pdf Edge Function）
 * @param {File} pdfFile
 * @returns {Promise<Array<{ title: string, name: string, description: string, ingredients: object[], steps: string[] }>>}
 */
export async function parseRecipePdfFile(pdfFile) {
    if (!pdfFile) throw new Error('PDFファイルを選択してください');
    if (pdfFile.type && pdfFile.type !== 'application/pdf' && !String(pdfFile.name || '').toLowerCase().endsWith('.pdf')) {
        throw new Error('PDFファイルを選択してください');
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
        throw new Error('PDFは20MB以下にしてください');
    }

    const dataUrl = await readFileAsDataUrl(pdfFile);
    const fileBase64 = stripDataUrlPrefix(dataUrl);

    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    const session = refreshData?.session;
    if (refreshErr || !session?.access_token) {
        const msg = refreshErr?.message || '';
        const needReLogin = /refresh_token|session|expired|invalid/i.test(msg);
        throw new Error(needReLogin
            ? 'セッションの有効期限が切れています。再ログインしてください。'
            : (msg || 'ログイン情報が取得できませんでした。'));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/parse-recipe-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${session.access_token}`,
                'X-User-JWT': session.access_token,
            },
            body: JSON.stringify({
                fileBase64,
                fileName: pdfFile.name || 'recipe.pdf',
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error('PDF解析がタイムアウトしました。ページ数を減らすか、しばらくして再試行してください。');
        }
        throw new Error(err?.message || 'サーバーに接続できませんでした');
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(await extractServerError(response));
    }

    const payload = await response.json();
    if (!payload?.ok) {
        throw new Error(payload?.error || 'PDFからレシピを抽出できませんでした');
    }

    const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
    if (recipes.length === 0) {
        throw new Error('PDFからレシピを抽出できませんでした');
    }

    return {
        recipes,
        partial: Boolean(payload.partial),
        warning: payload.warning || null,
    };
}
