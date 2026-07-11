import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts"
import { RateLimiter } from "../_shared/rate-limiter.ts"
import {
  APILogger,
  getGroqCostBreakdown,
  getOpenAiCostBreakdown,
  getPerplexityCostBreakdown,
} from "../_shared/api-logger.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const toPositiveInt = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const normalizeApiName = (provider: string) => {
  if (provider === 'groq') return 'groq'
  if (provider === 'openai') return 'openai'
  if (provider === 'perplexity') return 'perplexity'
  return 'sakana'
}

const extractUsageFromPayload = (payload: Record<string, unknown> | null) => {
  if (!payload || typeof payload !== 'object') {
    return { inputTokens: 0, outputTokens: 0 }
  }

  const usage = (payload as Record<string, unknown>)?.usage
  if (usage && typeof usage === 'object') {
    const typedUsage = usage as Record<string, unknown>
    return {
      inputTokens: toPositiveInt(
        typedUsage.input_tokens
        ?? typedUsage.prompt_tokens
        ?? typedUsage.promptTokenCount
      ),
      outputTokens: toPositiveInt(
        typedUsage.output_tokens
        ?? typedUsage.completion_tokens
        ?? typedUsage.output_text_tokens
        ?? typedUsage.candidatesTokenCount
      ),
    }
  }

  return { inputTokens: 0, outputTokens: 0 }
}

const extractOpenAiWebSearchCallCount = (payload: Record<string, unknown> | null) => {
  if (!Array.isArray(payload?.output)) return 0
  return payload.output.filter((item) => (
    item && typeof item === 'object' && (item as Record<string, unknown>).type === 'web_search_call'
  )).length
}

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
  openai: {
    responses: {
      url: 'https://api.openai.com/v1/responses',
      keyEnvs: ['OPENAI_API_KEY', 'chatgpt', 'CHATGPT_API_KEY'],
      providerName: 'OpenAI',
    },
  },
  perplexity: {
    chat: {
      url: 'https://api.perplexity.ai/chat/completions',
      keyEnvs: ['PERPLEXITY_API_KEY'],
      providerName: 'Perplexity',
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
  const userEmail = typeof jwtPayload.email === 'string' ? jwtPayload.email : null
  if (!userId) {
    return jsonResponse({ success: false, error: '認証情報が不正です。' }, 401)
  }

  let apiLogger: APILogger | null = null
  let requestMetadata: Record<string, unknown> | null = null
  let requestSizeBytes = 0

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
    try {
      apiLogger = new APILogger('recipe-ai-proxy', 'recipe-ai-proxy', null)
      apiLogger.setUser(userId, userEmail)
      await apiLogger.logRateLimit({
        provider: null,
        proxy_stage: 'local_rate_limit',
        error: String((rateLimitError as Error).message || rateLimitError),
      })
    } catch {
      // ignore logging failure
    }
    return jsonResponse({ success: false, error: String((rateLimitError as Error).message) }, 429)
  }

  try {
    const { provider, endpoint, body } = await req.json()
    const normalizedProvider = String(provider || '')
    const requestModel = typeof body?.model === 'string' ? body.model : null
    apiLogger = new APILogger(normalizeApiName(normalizedProvider), 'recipe-ai-proxy', requestModel)
    apiLogger.setUser(userId, userEmail)
    requestSizeBytes = JSON.stringify(body ?? {}).length
    requestMetadata = {
      provider: normalizedProvider,
      proxy_endpoint: String(endpoint || ''),
      request_model: requestModel,
      tool_count: Array.isArray(body?.tools) ? body.tools.length : 0,
      message_count: Array.isArray(body?.messages) ? body.messages.length : 0,
      has_reasoning: Boolean(body?.reasoning),
      has_response_format: Boolean(body?.response_format || body?.text?.format),
    }

    const target = PROVIDER_ENDPOINTS[normalizedProvider]?.[String(endpoint)]
    if (!target) {
      if (apiLogger) {
        await apiLogger.logError('許可されていないプロバイダーまたはエンドポイントです。', {
          ...requestMetadata,
          proxy_stage: 'validate_target',
        })
      }
      return jsonResponse({ success: false, error: '許可されていないプロバイダーまたはエンドポイントです。' }, 400)
    }
    if (!body || typeof body !== 'object') {
      if (apiLogger) {
        await apiLogger.logError('リクエストボディが不正です。', {
          ...requestMetadata,
          proxy_stage: 'validate_body',
        })
      }
      return jsonResponse({ success: false, error: 'リクエストボディが不正です。' }, 400)
    }

    const apiKey = target.keyEnvs.map((env) => Deno.env.get(env)).find((value) => value)
    if (!apiKey) {
      if (apiLogger) {
        await apiLogger.logError(`${target.providerName} のAPIキーがサーバーに設定されていません。`, {
          ...requestMetadata,
          proxy_stage: 'load_api_key',
          provider_name: target.providerName,
        })
      }
      return jsonResponse({ success: false, error: `${target.providerName} のAPIキーがサーバーに設定されていません。管理者に連絡してください。` }, 500)
    }

    // OpenAI Responses API does not support Web Search when JSON mode is active.
    // If we detect both, we strip the web_search tool to prevent API errors.
    const upstreamBody = { ...body }
    if (normalizedProvider === 'openai') {
      const hasJsonFormat = upstreamBody.response_format?.type === 'json_object' || upstreamBody.text?.format?.type === 'json_object'
      if (hasJsonFormat && Array.isArray(upstreamBody.tools)) {
        upstreamBody.tools = upstreamBody.tools.filter((t: any) => t.type !== 'web_search')
        if (upstreamBody.tools.length === 0) {
          delete upstreamBody.tools
          delete upstreamBody.tool_choice
        }
      }
    }

    const upstream = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    })

    const responseText = await upstream.text()
    const responseSizeBytes = responseText.length
    const parsedPayload = safeJsonParse(responseText)
    const usage = extractUsageFromPayload(parsedPayload)
    const openAiWebSearchCalls = normalizedProvider === 'openai'
      ? extractOpenAiWebSearchCallCount(parsedPayload)
      : 0
    const perplexitySearchContextSize = String(body?.web_search_options?.search_context_size || 'low').toLowerCase()
    const billing = normalizedProvider === 'groq'
      ? getGroqCostBreakdown(requestModel || '', usage.inputTokens, usage.outputTokens)
      : normalizedProvider === 'openai'
        ? getOpenAiCostBreakdown(requestModel || '', usage.inputTokens, usage.outputTokens, openAiWebSearchCalls)
        : normalizedProvider === 'perplexity'
          ? getPerplexityCostBreakdown(requestModel || '', usage.inputTokens, usage.outputTokens, perplexitySearchContextSize)
          : null

    if (apiLogger) {
      const metadata = {
        ...requestMetadata,
        provider_name: target.providerName,
        upstream_url: target.url,
        upstream_status: upstream.status,
        usage,
        billing_type: billing
          ? (normalizedProvider === 'perplexity' ? 'token_plus_request_fee' : 'token_weighted')
          : null,
        billing_breakdown: billing ? {
          model: billing.normalizedModel,
          pricing_status: billing.knownPricing ? 'priced' : 'unpriced',
          pricing_note: billing.pricingNote,
          rate_per_1m_jpy: billing.ratePer1M,
          input_tokens: billing.inputTokens,
          output_tokens: billing.outputTokens,
          input_cost_jpy: billing.inputCostJpy,
          output_cost_jpy: billing.outputCostJpy,
          web_search_calls: 'webSearchCalls' in billing ? billing.webSearchCalls : 0,
          web_search_cost_jpy: 'webSearchCostJpy' in billing ? billing.webSearchCostJpy : 0,
          request_fee_jpy: 'requestFeeJpy' in billing ? billing.requestFeeJpy : 0,
          search_context_size: 'searchContextSize' in billing ? billing.searchContextSize : null,
          usd_to_jpy: 'usdToJpy' in billing ? billing.usdToJpy : null,
          total_cost_jpy: billing.totalCostJpy,
        } : null,
      }

      if (upstream.ok) {
        await apiLogger.logSuccess({
          requestSizeBytes,
          responseSizeBytes,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostJpy: billing?.knownPricing ? billing.totalCostJpy : undefined,
          metadata,
        })
      } else if (upstream.status === 429) {
        await apiLogger.logRateLimit(metadata)
      } else {
        await apiLogger.logError(`upstream ${upstream.status}`, {
          ...metadata,
          upstream_response_preview: responseText.slice(0, 800),
        })
      }
    }

    return new Response(responseText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: upstream.status,
    })
  } catch (error) {
    console.error('❌ recipe-ai-proxy エラー:', error)
    if (apiLogger) {
      await apiLogger.logError(
        error instanceof Error ? error.message : String(error),
        {
          ...(requestMetadata || {}),
          proxy_stage: 'unhandled_exception',
        },
      )
    }
    return jsonResponse({ success: false, error: 'サーバーエラーが発生しました。' }, 500)
  }
})
