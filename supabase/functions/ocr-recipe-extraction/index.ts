import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
import { buildGeminiGenerateContentEndpointCandidates } from "../_shared/gemini-model.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const isGeminiModelUnavailable = (status: number, errorText: string) => {
  const body = String(errorText || '').toLowerCase()
  if (status === 404) return true
  if (status === 400 && (body.includes('not found') || (body.includes('model') && body.includes('supported')))) return true
  return false
}

serve(async (req) => {
  // CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = getAuthToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: '認証が必要です。再ログインしてください。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    try {
      await verifySupabaseJWT(token);
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'トークンが無効または期限切れです。再ログインしてください。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔧 OCR function called')

    // 環境変数の確認
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');

    console.log('🔧 Environment variables check:');
    console.log('🔧 GOOGLE_API_KEY exists:', !!googleApiKey);

    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set');
    }

    const body = await req.json()
    console.log('🔧 Request body keys:', Object.keys(body))

    const { contents } = body

    if (!contents) {
      throw new Error('Contents are required')
    }

    console.log('🔍 OCR request with contents:', contents.length)

    // Google Gemini API でレシピ構造化
    console.log('🔧 Starting Google Gemini API analysis...')
    const candidates = buildGeminiGenerateContentEndpointCandidates('v1')
    let result: any = null
    let lastError: { status: number; statusText: string; errorText: string; model: string } | null = null

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i]
      const endpoint = `${candidate.url}?key=${googleApiKey}`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: contents
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        lastError = { status: response.status, statusText: response.statusText, errorText: errorData, model: candidate.model }
        if (i < candidates.length - 1 && isGeminiModelUnavailable(response.status, errorData)) {
          console.warn(`⚠️ Primary model unavailable. Retry fallback model: ${candidates[i + 1].model}`)
          continue
        }
        throw new Error(`Google Gemini API エラー: ${response.status} - ${errorData}`)
      }

      result = await response.json()
      break
    }

    if (!result) {
      const e = lastError
      throw new Error(`Google Gemini API エラー: ${e?.status ?? 500} ${e?.statusText ?? 'Unknown'} - ${e?.errorText ?? 'Unknown error'}`)
    }
    console.log('🔧 Google Gemini API analysis completed:', result)

    // Gemini API の応答をそのまま返す
    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error message:', error.message)

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
        stack: error.stack,
        details: {
          name: error.name,
          message: error.message
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
