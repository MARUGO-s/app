export const DEFAULT_GEMINI_CHEAPEST_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

const PRO_MODEL_SEGMENT_RE = /(^|[-_])pro($|[-_])/i;
const PREVIEW_MODEL_SEGMENT_RE = /3\.1-flash-lite-preview/i;

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

/**
 * Google は 2026-05-25 に gemini-3.1-flash-lite-preview を停止。
 * GA 版 gemini-3.1-flash-lite へ正規化する。
 */
function migrateDeprecatedGeminiModel(candidate: string, defaultModel: string) {
    const trimmed = String(candidate || '').trim();
    if (!trimmed) return defaultModel;

    if (PREVIEW_MODEL_SEGMENT_RE.test(trimmed) || trimmed === 'gemini-3.1-flash-lite-preview') {
        console.warn(
            `[gemini-model] Deprecated preview model "${trimmed}" migrated to ${DEFAULT_GEMINI_CHEAPEST_MODEL}`,
        );
        return DEFAULT_GEMINI_CHEAPEST_MODEL;
    }

    return trimmed;
}

function sanitizeModel(candidate: string, defaultModel: string) {
    const migrated = migrateDeprecatedGeminiModel(candidate, defaultModel);
    if (!migrated) return defaultModel;
    if (PRO_MODEL_SEGMENT_RE.test(migrated)) {
        console.warn(`Refusing high-cost Gemini model: ${migrated}. Fallback to ${defaultModel}`);
        return defaultModel;
    }
    return migrated;
}

/**
 * 全Gemini呼び出しで使う「最安モデル」を返す。
 * - 未設定時は gemini-3.1-flash-lite (GA)
 * - preview 系は GA に自動移行
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
