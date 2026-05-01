import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts"
import { RateLimiter } from "../_shared/rate-limiter.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_KEYS = ['GROQ_API_KEY', 'CHATGPT_API_KEY', 'GOOGLE_API_KEY', 'VISION_API_KEY']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // JWT 検証
  const token = getAuthToken(req)
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, error: '認証が必要です。再ログインしてください。' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  let jwtPayload: Record<string, unknown>
  try {
    jwtPayload = await verifySupabaseJWT(token) as Record<string, unknown>
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'トークンが無効または期限切れです。再ログインしてください。' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  const userId = String(jwtPayload.sub || '')
  if (!userId) {
    return new Response(
      JSON.stringify({ success: false, error: '認証情報が不正です。' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  // DB ベースのレートリミット（ユーザーID単位・インスタンス再起動に左右されない）
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const limiter = new RateLimiter(supabase, userId, 'get-api-keys', {
      maxRequests: 10,
      windowMinutes: 10,
    }, true /* strict: DB障害時も無制限アクセスを許可しない */)
    await limiter.check()
  } catch (rateLimitError) {
    return new Response(
      JSON.stringify({ success: false, error: String((rateLimitError as Error).message) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
    )
  }

  try {
    const { keyName } = await req.json()

    if (!keyName || typeof keyName !== 'string' || keyName.length === 0 || keyName.length > 50) {
      return new Response(
        JSON.stringify({ success: false, error: '無効なキー名です。' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!ALLOWED_KEYS.includes(keyName)) {
      return new Response(
        JSON.stringify({ success: false, error: '許可されていないキー名です。' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`🔑 APIキーリクエスト: ${keyName} by user ${userId}`)

    let envVarName = keyName
    if (keyName === 'CHATGPT_API_KEY') {
      envVarName = Deno.env.get('OPENAI_API_KEY') ? 'OPENAI_API_KEY'
        : Deno.env.get('chatgpt') ? 'chatgpt'
        : 'CHATGPT_API_KEY'
    }

    const apiKey = Deno.env.get(envVarName)

    return new Response(
      JSON.stringify({ success: true, hasKey: !!apiKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('❌ APIキー取得エラー:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'サーバーエラーが発生しました。' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
