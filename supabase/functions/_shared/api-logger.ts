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
export function estimateGeminiCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number
): number {
    // 料金（1Mトークンあたりの円、2026年2月時点の概算）
    const rates: Record<string, { input: number; output: number }> = {
        'gemini-1.5-flash': { input: 5, output: 15 },
        'gemini-2.0-flash': { input: 10, output: 30 },
        'gemini-2.5-pro': { input: 150, output: 400 },
        'gemini-pro': { input: 75, output: 200 }
    }

    const rate = rates[modelName] || rates['gemini-1.5-flash']

    const inputCost = (inputTokens / 1_000_000) * rate.input
    const outputCost = (outputTokens / 1_000_000) * rate.output

    return Math.round((inputCost + outputCost) * 100) / 100
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
