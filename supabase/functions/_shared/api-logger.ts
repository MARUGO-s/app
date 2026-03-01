import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * API使用ログを記録するヘルパークラス
 */
export class APILogger {
    private supabase: any
    private startTime: number
    private apiName: string
    private endpoint: string
    private userId: string | null
    private userEmail: string | null
    private modelName: string | null

    constructor(
        apiName: string,
        endpoint: string,
        modelName: string | null = null
    ) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        this.supabase = createClient(supabaseUrl, supabaseServiceKey)
        this.startTime = Date.now()
        this.apiName = apiName
        this.endpoint = endpoint
        this.modelName = modelName
        this.userId = null
        this.userEmail = null
    }

    /**
     * ユーザー情報を設定
     */
    setUser(userId: string | null, userEmail: string | null = null) {
        this.userId = userId
        this.userEmail = userEmail
    }

    /**
     * モデル名を設定
     */
    setModel(modelName: string) {
        this.modelName = modelName
    }

    /**
     * 成功ログを記録
     */
    async logSuccess(options: {
        requestSizeBytes?: number
        responseSizeBytes?: number
        inputTokens?: number
        outputTokens?: number
        estimatedCostJpy?: number
        metadata?: any
    } = {}) {
        const durationMs = Date.now() - this.startTime

        try {
            const { error } = await this.supabase
                .from('api_usage_logs')
                .insert({
                    api_name: this.apiName,
                    endpoint: this.endpoint,
                    model_name: this.modelName,
                    user_id: this.userId,
                    user_email: this.userEmail,
                    request_size_bytes: options.requestSizeBytes,
                    response_size_bytes: options.responseSizeBytes,
                    input_tokens: options.inputTokens,
                    output_tokens: options.outputTokens,
                    status: 'success',
                    duration_ms: durationMs,
                    estimated_cost_jpy: options.estimatedCostJpy,
                    metadata: options.metadata
                })
            if (error) {
                console.error('Failed to log API usage (insert error):', error)
            }
        } catch (error) {
            console.error('Failed to log API usage:', error)
        }
    }

    /**
     * エラーログを記録
     */
    async logError(errorMessage: string, metadata?: any) {
        const durationMs = Date.now() - this.startTime

        try {
            const { error } = await this.supabase
                .from('api_usage_logs')
                .insert({
                    api_name: this.apiName,
                    endpoint: this.endpoint,
                    model_name: this.modelName,
                    user_id: this.userId,
                    user_email: this.userEmail,
                    status: 'error',
                    error_message: errorMessage,
                    duration_ms: durationMs,
                    metadata
                })
            if (error) {
                console.error('Failed to log API error (insert error):', error)
            }
        } catch (error) {
            console.error('Failed to log API error:', error)
        }
    }

    /**
     * レート制限エラーを記録
     */
    async logRateLimit(metadata?: any) {
        const durationMs = Date.now() - this.startTime

        try {
            const { error } = await this.supabase
                .from('api_usage_logs')
                .insert({
                    api_name: this.apiName,
                    endpoint: this.endpoint,
                    model_name: this.modelName,
                    user_id: this.userId,
                    user_email: this.userEmail,
                    status: 'rate_limited',
                    duration_ms: durationMs,
                    metadata
                })
            if (error) {
                console.error('Failed to log rate limit (insert error):', error)
            }
        } catch (error) {
            console.error('Failed to log rate limit:', error)
        }
    }
}

/**
 * Gemini APIのコスト推定
 */
export type GeminiRate = { input: number; output: number }

const GEMINI_RATES_JPY_PER_1M: Record<string, GeminiRate> = {
    // 料金（1Mトークンあたりの円、2026年2月時点の概算）
    'gemini-2.5-flash-lite': { input: 2, output: 6 },
    'gemini-1.5-flash': { input: 5, output: 15 },
    'gemini-2.0-flash': { input: 10, output: 30 },
    'gemini-2.5-pro': { input: 150, output: 400 },
    'gemini-pro': { input: 75, output: 200 },
}

function normalizeGeminiModelName(modelName: string): string {
    const normalized = String(modelName || '').trim().toLowerCase()
    if (!normalized) return 'gemini-2.5-flash-lite'
    if (normalized.includes('flash-lite')) return 'gemini-2.5-flash-lite'
    if (normalized.includes('2.5-pro') || normalized.includes('pro')) return 'gemini-2.5-pro'
    if (normalized.includes('2.0-flash')) return 'gemini-2.0-flash'
    if (normalized.includes('1.5-flash') || normalized.includes('flash')) return 'gemini-1.5-flash'
    return 'gemini-2.5-flash-lite'
}

export function getGeminiRatePerMillion(modelName: string): GeminiRate {
    const key = normalizeGeminiModelName(modelName)
    return GEMINI_RATES_JPY_PER_1M[key] || GEMINI_RATES_JPY_PER_1M['gemini-2.5-flash-lite']
}

export function getGeminiCostBreakdown(
    modelName: string,
    inputTokens: number,
    outputTokens: number
) {
    const safeInputTokens = Number.isFinite(Number(inputTokens)) ? Math.max(0, Number(inputTokens)) : 0
    const safeOutputTokens = Number.isFinite(Number(outputTokens)) ? Math.max(0, Number(outputTokens)) : 0
    const normalizedModel = normalizeGeminiModelName(modelName)
    const rate = getGeminiRatePerMillion(normalizedModel)

    const inputCostRaw = (safeInputTokens / 1_000_000) * rate.input
    const outputCostRaw = (safeOutputTokens / 1_000_000) * rate.output
    const totalCostRaw = inputCostRaw + outputCostRaw

    return {
        normalizedModel,
        ratePer1M: rate,
        inputTokens: safeInputTokens,
        outputTokens: safeOutputTokens,
        inputCostJpy: Math.round(inputCostRaw * 10000) / 10000,
        outputCostJpy: Math.round(outputCostRaw * 10000) / 10000,
        totalCostJpy: Math.round(totalCostRaw * 1_000_000) / 1_000_000,
    }
}

export function estimateGeminiCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number
): number {
    return getGeminiCostBreakdown(modelName, inputTokens, outputTokens).totalCostJpy
}

/**
 * Groq APIのコスト推定（1Mトークンあたり円、USD×150で概算）
 * llama-4-scout 等: input $0.11/1M, output $0.34/1M
 */
export function estimateGroqCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number
): number {
    return getGroqCostBreakdown(modelName, inputTokens, outputTokens).totalCostJpy
}

export type GroqRate = { input: number; output: number }

const GROQ_RATES_JPY_PER_1M: Record<string, GroqRate> = {
    // 2026-03 時点の概算（USD -> JPY 換算の内部運用値）
    'meta-llama/llama-4-scout-17b-16e-instruct': { input: 16.5, output: 51 },
    'llama-3.3-70b-versatile': { input: 16.5, output: 51 },
    'default': { input: 16.5, output: 51 },
}

function normalizeGroqModelName(modelName: string): string {
    const normalized = String(modelName || '').trim().toLowerCase()
    if (!normalized) return 'default'
    if (normalized.includes('llama-4-scout-17b-16e-instruct')) return 'meta-llama/llama-4-scout-17b-16e-instruct'
    if (normalized.includes('llama-3.3-70b-versatile')) return 'llama-3.3-70b-versatile'
    return 'default'
}

export function getGroqRatePerMillion(modelName: string): GroqRate {
    const key = normalizeGroqModelName(modelName)
    return GROQ_RATES_JPY_PER_1M[key] || GROQ_RATES_JPY_PER_1M.default
}

export function getGroqCostBreakdown(
    modelName: string,
    inputTokens: number,
    outputTokens: number,
) {
    const safeInputTokens = Number.isFinite(Number(inputTokens)) ? Math.max(0, Number(inputTokens)) : 0
    const safeOutputTokens = Number.isFinite(Number(outputTokens)) ? Math.max(0, Number(outputTokens)) : 0
    const normalizedModel = normalizeGroqModelName(modelName)
    const rate = getGroqRatePerMillion(normalizedModel)

    const inputCostRaw = (safeInputTokens / 1_000_000) * rate.input
    const outputCostRaw = (safeOutputTokens / 1_000_000) * rate.output
    const totalCostRaw = inputCostRaw + outputCostRaw

    return {
        normalizedModel,
        ratePer1M: rate,
        inputTokens: safeInputTokens,
        outputTokens: safeOutputTokens,
        inputCostJpy: Math.round(inputCostRaw * 10000) / 10000,
        outputCostJpy: Math.round(outputCostRaw * 10000) / 10000,
        totalCostJpy: Math.round(totalCostRaw * 1_000_000) / 1_000_000,
    }
}
