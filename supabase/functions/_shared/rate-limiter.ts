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
    private strict: boolean

    /**
     * @param strict - true にすると RPC 失敗時に 503 相当のエラーをスロー。
     *                 false（デフォルト）はサービス継続優先でスキップ。
     *                 API キー取得など悪用リスクが高いエンドポイントでは true を推奨。
     */
    constructor(
        supabase: any,
        userId: string,
        endpoint: string,
        config: RateLimitConfig = { maxRequests: 10, windowMinutes: 60 },
        strict = false
    ) {
        this.supabase = supabase
        this.userId = userId
        this.endpoint = endpoint
        this.config = config
        this.strict = strict
    }

    /**
     * レート制限をチェックし、制限を超えている場合はエラーをスロー
     *
     * PostgreSQL の INSERT ... ON CONFLICT DO UPDATE RETURNING を使って
     * チェックとインクリメントを1つのアトミックな操作で行います。
     * これにより、並行リクエストが両方ともチェックを通過してしまう
     * TOCTOU（Time-of-Check/Time-of-Use）競合状態を防止します。
     */
    async check(): Promise<void> {
        const { data, error } = await this.supabase.rpc('check_and_increment_rate_limit', {
            p_user_id:       this.userId,
            p_endpoint:      this.endpoint,
            p_max_requests:  this.config.maxRequests,
            p_window_minutes: this.config.windowMinutes,
        })

        if (error) {
            console.error('レート制限チェックエラー:', error)
            if (this.strict) {
                // strict モード: DB 障害時も無制限アクセスを許可しない
                throw new Error('レートリミットサービスが一時的に利用できません。しばらく待ってから再試行してください。')
            }
            // 非 strict モード: サービス継続優先でスキップ
            return
        }

        const result = Array.isArray(data) ? data[0] : data
        if (!result?.allowed) {
            const windowStart = new Date(result.window_start)
            const resetTime = new Date(windowStart.getTime() + this.config.windowMinutes * 60 * 1000)
            const minutesRemaining = Math.ceil((resetTime.getTime() - Date.now()) / 60000)

            throw new Error(
                `レート制限を超えました。${minutesRemaining}分後に再試行してください。` +
                `（制限: ${this.config.maxRequests}回/${this.config.windowMinutes}分）`
            )
        }
    }

    /**
     * ユーザーの残りリクエスト数を取得
     */
    async getRemaining(): Promise<number> {
        // Use the same fixed-window bucket calculation as the RPC so we read
        // the row that check() will actually upsert into.
        const nowEpoch = Date.now() / 1000
        const bucketSeconds = this.config.windowMinutes * 60
        const windowStartEpoch = Math.floor(nowEpoch / bucketSeconds) * bucketSeconds
        const windowStart = new Date(windowStartEpoch * 1000).toISOString()

        const { data: records } = await this.supabase
            .from('api_rate_limits')
            .select('request_count')
            .eq('user_id', this.userId)
            .eq('endpoint', this.endpoint)
            .eq('window_start', windowStart)
            .limit(1)

        if (!records || records.length === 0) {
            return this.config.maxRequests
        }

        const currentRecord = records[0] as RateLimitRecord
        return Math.max(0, this.config.maxRequests - currentRecord.request_count)
    }
}
