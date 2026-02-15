import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * レート制限ミドルウェア
 * Supabaseのテーブルを使ってAPI呼び出し回数を制限します
 * 
 * 使用方法:
 * const limiter = new RateLimiter(supabaseClient, 'user_id', {
 *   maxRequests: 10,
 *   windowMinutes: 60
 * })
 * await limiter.check()
 */

export interface RateLimitConfig {
    maxRequests: number  // 制限内の最大リクエスト数
    windowMinutes: number  // 時間窓（分）
}

export interface RateLimitRecord {
    user_id: string
    endpoint: string
    request_count: number
    window_start: string
}

export class RateLimiter {
    private supabase: any
    private userId: string
    private endpoint: string
    private config: RateLimitConfig

    constructor(
        supabase: any,
        userId: string,
        endpoint: string,
        config: RateLimitConfig = { maxRequests: 10, windowMinutes: 60 }
    ) {
        this.supabase = supabase
        this.userId = userId
        this.endpoint = endpoint
        this.config = config
    }

    /**
     * レート制限をチェックし、制限を超えている場合はエラーをスロー
     */
    async check(): Promise<void> {
        const now = new Date()
        const windowStart = new Date(now.getTime() - this.config.windowMinutes * 60 * 1000)

        // 現在の時間窓内のリクエスト数を取得
        const { data: records, error: fetchError } = await this.supabase
            .from('api_rate_limits')
            .select('*')
            .eq('user_id', this.userId)
            .eq('endpoint', this.endpoint)
            .gte('window_start', windowStart.toISOString())
            .order('window_start', { ascending: false })
            .limit(1)

        if (fetchError) {
            console.error('レート制限チェックエラー:', fetchError)
            // エラー時はレート制限をスキップ（サービス継続優先）
            return
        }

        // レコードが存在し、制限を超えている場合
        if (records && records.length > 0) {
            const currentRecord = records[0] as RateLimitRecord
            if (currentRecord.request_count >= this.config.maxRequests) {
                const resetTime = new Date(
                    new Date(currentRecord.window_start).getTime() +
                    this.config.windowMinutes * 60 * 1000
                )
                const minutesRemaining = Math.ceil((resetTime.getTime() - now.getTime()) / 60000)

                throw new Error(
                    `レート制限を超えました。${minutesRemaining}分後に再試行してください。` +
                    `（制限: ${this.config.maxRequests}回/${this.config.windowMinutes}分）`
                )
            }

            // カウントを増やす
            await this.supabase
                .from('api_rate_limits')
                .update({
                    request_count: currentRecord.request_count + 1,
                    updated_at: now.toISOString()
                })
                .eq('id', (currentRecord as any).id)
        } else {
            // 新しい時間窓の開始
            await this.supabase
                .from('api_rate_limits')
                .insert({
                    user_id: this.userId,
                    endpoint: this.endpoint,
                    request_count: 1,
                    window_start: now.toISOString(),
                    updated_at: now.toISOString()
                })
        }
    }

    /**
     * ユーザーの残りリクエスト数を取得
     */
    async getRemaining(): Promise<number> {
        const now = new Date()
        const windowStart = new Date(now.getTime() - this.config.windowMinutes * 60 * 1000)

        const { data: records } = await this.supabase
            .from('api_rate_limits')
            .select('*')
            .eq('user_id', this.userId)
            .eq('endpoint', this.endpoint)
            .gte('window_start', windowStart.toISOString())
            .order('window_start', { ascending: false })
            .limit(1)

        if (!records || records.length === 0) {
            return this.config.maxRequests
        }

        const currentRecord = records[0] as RateLimitRecord
        return Math.max(0, this.config.maxRequests - currentRecord.request_count)
    }
}
