import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts"
import { RateLimiter } from "../_shared/rate-limiter.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

// provider/endpoint ごとの転送先。ここに無い組み合わせは拒否する。
// Sakana AI はサブスク用と従量課金（API）用でキーが別なので、格納先Secretも分ける。
// keyEnvs は先頭から順に探し、最初に見つかったものを使う（SAKANA_API_KEY は共通フォールバック）。
const SAKANA_ENDPOINTS = (keyEnvs: string[], providerName: string) => ({
  chat: {
    url: 'https://api.sakana.ai/v1/chat/completions',
    keyEnvs,
    providerName,
  },
  responses: {
    url: 'https://api.sakana.ai/v1/responses',
    keyEnvs,
    providerName,
  },
})

const PROVIDER_ENDPOINTS: Record<string, Record<string, { url: string; keyEnvs: string[]; providerName: string }>> = {
  'sakana-subscription': SAKANA_ENDPOINTS(
    ['SAKANA_SUBSCRIPTION_API_KEY', 'SAKANA_API_KEY'],
    'Sakana AI（サブスク）'
  ),
  'sakana-payg': SAKANA_ENDPOINTS(
    ['SAKANA_PAYG_API_KEY', 'SAKANA_API_KEY'],
    'Sakana AI（従量課金）'
  ),
  // 旧クライアント互換: 'sakana' はサブスク扱い
  sakana: SAKANA_ENDPOINTS(
    ['SAKANA_SUBSCRIPTION_API_KEY', 'SAKANA_API_KEY'],
    'Sakana AI'
  ),
  groq: {
    chat: {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      keyEnvs: ['GROQ_API_KEY'],
      providerName: 'Groq',
    },
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // JWT 検証
  const token = getAuthToken(req)
  if (!token) {
    return jsonResponse({ success: false, error: '認証が必要です。再ログインしてください。' }, 401)
  }

  let jwtPayload: Record<string, unknown>
  try {
    jwtPayload = await verifySupabaseJWT(token) as Record<string, unknown>
  } catch {
    return jsonResponse({ success: false, error: 'トークンが無効または期限切れです。再ログインしてください。' }, 401)
  }

  const userId = String(jwtPayload.sub || '')
  if (!userId) {
    return jsonResponse({ success: false, error: '認証情報が不正です。' }, 401)
  }

  // DB ベースのレートリミット（AI改善案は1回の生成で8回前後呼ぶため窓を広めに取る）
  // この関数はAPIキーを返さない転送専用のため、RPC障害時はブロックしない（非strict）
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const limiter = new RateLimiter(supabase, userId, 'recipe-ai-proxy', {
      maxRequests: 120,
      windowMinutes: 10,
    }, false)
    await limiter.check()
  } catch (rateLimitError) {
    return jsonResponse({ success: false, error: String((rateLimitError as Error).message) }, 429)
  }

  try {
    const { provider, endpoint, body } = await req.json()

    const target = PROVIDER_ENDPOINTS[String(provider)]?.[String(endpoint)]
    if (!target) {
      return jsonResponse({ success: false, error: '許可されていないプロバイダーまたはエンドポイントです。' }, 400)
    }
    if (!body || typeof body !== 'object') {
      return jsonResponse({ success: false, error: 'リクエストボディが不正です。' }, 400)
    }

    const apiKey = target.keyEnvs.map((env) => Deno.env.get(env)).find((value) => value)
    if (!apiKey) {
      return jsonResponse({ success: false, error: `${target.providerName} のAPIキーがサーバーに設定されていません。管理者に連絡してください。` }, 500)
    }

    const upstream = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const responseText = await upstream.text()
    return new Response(responseText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: upstream.status,
    })
  } catch (error) {
    console.error('❌ recipe-ai-proxy エラー:', error)
    return jsonResponse({ success: false, error: 'サーバーエラーが発生しました。' }, 500)
  }
})
