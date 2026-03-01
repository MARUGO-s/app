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
            await this.supabase
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
            await this.supabase
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
            await this.supabase
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
    if (!normalized) return 'gemini-1.5-flash'
    if (normalized.includes('flash-lite')) return 'gemini-2.5-flash-lite'
    if (normalized.includes('2.5-pro') || normalized.includes('pro')) return 'gemini-2.5-pro'
    if (normalized.includes('2.0-flash')) return 'gemini-2.0-flash'
    if (normalized.includes('1.5-flash') || normalized.includes('flash')) return 'gemini-1.5-flash'
    return 'gemini-1.5-flash'
}

export function getGeminiRatePerMillion(modelName: string): GeminiRate {
    const key = normalizeGeminiModelName(modelName)
    return GEMINI_RATES_JPY_PER_1M[key] || GEMINI_RATES_JPY_PER_1M['gemini-1.5-flash']
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
        totalCostJpy: Math.round(totalCostRaw * 100) / 100,
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
    _modelName: string,
    inputTokens: number,
    outputTokens: number
): number {
    const inputYenPer1M = 16.5
    const outputYenPer1M = 51
    const inputCost = (inputTokens / 1_000_000) * inputYenPer1M
    const outputCost = (outputTokens / 1_000_000) * outputYenPer1M
    return Math.round((inputCost + outputCost) * 100) / 100
}
