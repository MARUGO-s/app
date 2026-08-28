// analyze-image Edge Function にレート制限を適用する例
// 
// 使用方法:
// 1. このコードを analyze-image/index.ts の先頭部分に統合
// 2. RateLimiterをインポート
// 3. serve関数内でユーザーIDを取得してレート制限をチェック

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { RateLimiter } from '../_shared/rate-limiter.ts'

// ... 既存のコード ...

serve(async (req) => {
    // ... CORS処理 ...

    try {
        // Supabaseクライアントの初期化
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // ユーザーIDを取得（認証トークンから、または匿名の場合はIPアドレス）
        const authHeader = req.headers.get('Authorization')
        let userId = 'anonymous'

        if (authHeader) {
            const { data: { user } } = await supabase.auth.getUser(
                authHeader.replace('Bearer ', '')
            )
            userId = user?.id || 'anonymous'
        }

        // ユーザーIDが取得できない場合はIPアドレスを使用
        if (userId === 'anonymous') {
            const clientIp = req.headers.get('x-forwarded-for') ||
                req.headers.get('x-real-ip') ||
                'unknown'
            userId = `ip:${clientIp}`
        }

        // レート制限チェック（1時間に10回まで）
        const limiter = new RateLimiter(
            supabase,
            userId,
            'analyze-image',
            { maxRequests: 10, windowMinutes: 60 }
        )

        try {
            await limiter.check()
        } catch (rateLimitError) {
            return new Response(
                JSON.stringify({
                    error: rateLimitError.message,
                    type: 'rate_limit_exceeded'
                }),
                {
                    status: 429, // Too Many Requests
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Retry-After': '3600' // 1時間後に再試行
                    }
                }
            )
        }

        // 残りリクエスト数を取得してレスポンスヘッダーに追加
        const remaining = await limiter.getRemaining()

        // ... 既存の画像解析処理 ...

        return new Response(
            // ... レスポンスボディ ...
            {
                headers: {
                    ...corsHeaders,
                    'X-RateLimit-Limit': '10',
                    'X-RateLimit-Remaining': remaining.toString(),
                    'X-RateLimit-Reset': new Date(Date.now() + 60 * 60 * 1000).toISOString()
                }
            }
        )

    } catch (error) {
        // ... エラーハンドリング ...
    }
})


// 推奨設定:
// - analyze-image: 10回/時間 (画像解析は高コスト)
// - parse-delivery-pdf: 20回/時間 (PDFは中コスト)
// - call-gemini-api: 30回/時間 (テキストのみなので低コスト)
