export const DEFAULT_GEMINI_CHEAPEST_MODEL = 'gemini-2.5-flash-lite';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-1.5-flash';

const PRO_MODEL_SEGMENT_RE = /(^|[-_])pro($|[-_])/i;

function readModelFromEnv() {
    const envValue = String(
        Deno.env.get('GEMINI_CHEAPEST_MODEL') || '',
    ).trim();
    return envValue;
}

function readFallbackModelFromEnv() {
    return String(
        Deno.env.get('GEMINI_FALLBACK_MODEL')
        || Deno.env.get('GEMINI_SECONDARY_MODEL')
        || '',
    ).trim();
}

function sanitizeModel(candidate: string, defaultModel: string) {
    const trimmed = String(candidate || '').trim();
    if (!trimmed) return defaultModel;
    if (PRO_MODEL_SEGMENT_RE.test(trimmed)) {
        console.warn(`Refusing high-cost Gemini model: ${trimmed}. Fallback to ${defaultModel}`);
        return defaultModel;
    }
    return trimmed;
}

/**
 * 全Gemini呼び出しで使う「最安モデル」を返す。
 * - 未設定時は gemini-2.5-flash-lite
 * - Pro 系は高コストなので拒否して既定に戻す
 */
export function resolveCheapestGeminiModel() {
    return sanitizeModel(readModelFromEnv(), DEFAULT_GEMINI_CHEAPEST_MODEL);
}

/**
 * 最安モデル + 第二候補（重複排除）を返す。
 */
export function resolveGeminiModelCandidates() {
    const primary = resolveCheapestGeminiModel();
    const fallback = sanitizeModel(readFallbackModelFromEnv(), DEFAULT_GEMINI_FALLBACK_MODEL);
    return Array.from(new Set([primary, fallback]));
}

export function buildGeminiGenerateContentEndpoint(apiVersion: 'v1' | 'v1beta' = 'v1beta') {
    const model = resolveCheapestGeminiModel();
    return {
        model,
        url: `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`,
    };
}

export function buildGeminiGenerateContentEndpointCandidates(apiVersion: 'v1' | 'v1beta' = 'v1beta') {
    return resolveGeminiModelCandidates().map((model) => ({
        model,
        url: `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`,
    }));
}
