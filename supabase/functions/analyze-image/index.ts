
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { RateLimiter } from "../_shared/rate-limiter.ts";
import { estimateGeminiCost, estimateGroqCost, getGeminiCostBreakdown } from "../_shared/api-logger.ts";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-user-jwt, x-client-info, apikey, content-type',
}

const formatGeminiError = (status: number, errText: string) => {
    const trimmed = String(errText || '').trim();

    try {
        const parsed = JSON.parse(trimmed);
        const message = String(parsed?.error?.message || '').trim();

        // Try to keep just a human-readable first line (+ retry hint if present).
        const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
        const first = lines[0] || message || trimmed;
        const retryLine = lines.find(l => /please retry in/i.test(l)) || '';
        const retryMatch = retryLine.match(/please retry in\s+([0-9.]+)s/i);
        const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;

        if (status === 429) {
            const hasZeroLimit = /limit:\s*0\b/i.test(message) || /limit:\s*0\b/i.test(trimmed);
            if (hasZeroLimit) {
                return 'Geminiのクォータ上限が0になっています (429)。Google側のプラン/課金設定、またはAPIキーの発行元プロジェクト設定を確認してください。';
            }
            const retryNote = retrySeconds != null ? `${retrySeconds}秒後に再試行してください。` : '';
            return `Geminiの利用上限に達しました (429)。${retryNote} Google側のプラン/課金設定を確認してください。`;
        }

        return `Gemini API Error: ${status} ${retryLine && retryLine !== first ? `${first} (${retryLine.replace(/\.$/, '')})` : first}`;
    } catch {
        // ignore
    }

    // Fallback: keep it short to avoid huge UI errors.
    const snippet = trimmed.length > 600 ? `${trimmed.slice(0, 600)}...` : trimmed;
    if (status === 429) {
        const hasZeroLimit = /limit:\s*0\b/i.test(trimmed);
        if (hasZeroLimit) {
            return 'Geminiのクォータ上限が0になっています (429)。Google側のプラン/課金設定、またはAPIキーの発行元プロジェクト設定を確認してください。';
        }
        return `Geminiの利用上限に達しました (429)。Google側のプラン/課金設定を確認してください。`;
    }
    return `Gemini API Error: ${status} ${snippet || 'Unknown error'}`;
};

function normalizeImageMimeType(file: File) {
    const type = String(file?.type || '').toLowerCase();
    if (type.startsWith('image/')) return type;

    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
}

function normalizeGeminiModelForEstimation(modelName: string) {
    const m = String(modelName || '').trim().toLowerCase();
    if (m.startsWith('gemini-2.5-flash-lite')) return 'gemini-2.5-flash-lite';
    if (m.startsWith('gemini-1.5-flash')) return 'gemini-1.5-flash';
    if (m.startsWith('gemini-2.0-flash-lite')) return 'gemini-2.0-flash';
    if (m.startsWith('gemini-2.0-flash')) return 'gemini-2.0-flash';
    if (m.startsWith('gemini-2.5-pro')) return 'gemini-2.5-pro';
    if (m.startsWith('gemini-pro')) return 'gemini-pro';
    return modelName;
}

const PRO_MODEL_SEGMENT_RE = /(^|[-_])pro($|[-_])/i;
const LITE_MODEL_SEGMENT_RE = /(^|[-_])flash[-_]?lite($|[-_])/i;
const FORCED_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-lite';

function isBlockedGeminiModel(modelName: string) {
    return PRO_MODEL_SEGMENT_RE.test(String(modelName || '').trim());
}

function resolveGeminiImageOverrideModel(modelName: string) {
    const m = String(modelName || '').trim();
    if (!m) return '';
    if (isBlockedGeminiModel(m)) {
        console.warn(`Gemini image model override blocked (pro family): ${m}`);
        return '';
    }
    // Cost safety: keep Gemini image path on Flash-Lite by default.
    if (!LITE_MODEL_SEGMENT_RE.test(m)) {
        console.warn(`Gemini image model override ignored (lite enforced): ${m} -> ${FORCED_GEMINI_IMAGE_MODEL}`);
        return FORCED_GEMINI_IMAGE_MODEL;
    }
    return m;
}

// --------------------------------------------------------------------------
// Helper: Log API Usage
// --------------------------------------------------------------------------
type ApiUsageStatus = 'success' | 'error' | 'rate_limited';

type ApiUsageLogEntry = {
    apiName: string;
    endpoint: string;
    modelName?: string | null;
    userId?: string | null;
    userEmail?: string | null;
    requestSizeBytes?: number | null;
    responseSizeBytes?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    status: ApiUsageStatus;
    errorMessage?: string | null;
    durationMs?: number | null;
    estimatedCostJpy?: number | null;
    metadata?: any;
};

type RequestLogContext = {
    requestId: string;
    engine: string;
    userId: string | null;
    userEmail: string | null;
    clientIp: string | null;
};

async function logApiUsage(supabase: any, entry: ApiUsageLogEntry) {
    if (!supabase) return;
    try {
        const payload = {
            api_name: entry.apiName,
            endpoint: entry.endpoint,
            model_name: entry.modelName ?? null,
            user_id: entry.userId ?? null,
            user_email: entry.userEmail ?? null,
            request_size_bytes: entry.requestSizeBytes ?? null,
            response_size_bytes: entry.responseSizeBytes ?? null,
            input_tokens: entry.inputTokens ?? null,
            output_tokens: entry.outputTokens ?? null,
            status: entry.status,
            error_message: entry.errorMessage ? String(entry.errorMessage).slice(0, 500) : null,
            duration_ms: entry.durationMs ?? null,
            estimated_cost_jpy: entry.estimatedCostJpy ?? null,
            metadata: entry.metadata ?? null,
        };

        const { error } = await supabase.from('api_usage_logs').insert(payload);
        if (error) console.error('Failed to log API usage:', error);
    } catch (err) {
        console.error('Error logging API usage:', err);
    }
}

// --------------------------------------------------------------------------
// Gemini API Integration
// --------------------------------------------------------------------------
async function analyzeImageWithGemini(file: File, supabaseClient: any, ctx: RequestLogContext) {
    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VISION_API_KEY');
    if (!apiKey) {
        console.warn("Skipping Gemini: No API Key found");
        return null;
    }

    const overrideModel = resolveGeminiImageOverrideModel(Deno.env.get('GEMINI_IMAGE_MODEL') || '');
    const modelCandidates = Array.from(new Set([
        // Cost safety: always try the Lite stable model first.
        FORCED_GEMINI_IMAGE_MODEL,
        // Allow explicit Lite override (including preview) while still enforcing no-Pro.
        overrideModel,
        // Fallback candidates when the key/project does not have Lite access.
        'gemini-2.5-flash-lite-preview-09-2025',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash',
    ].filter(Boolean))).filter((m) => !isBlockedGeminiModel(m));

    try {
        const MAX_GEMINI_IMAGE_BYTES = 4_000_000;
        if (file.size > MAX_GEMINI_IMAGE_BYTES) {
            return { error: `画像サイズが大きすぎるためGeminiをスキップします (${Math.round(file.size / 1_000_000)}MB)` };
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Image = encode(arrayBuffer);
        const mimeType = normalizeImageMimeType(file);

        const prompt = `
あなたは世界最高峰のパティシエかつ料理研究家です。
渡された画像（手書きのメモやスクリーンショット）から料理のレシピ情報を正確に読み取ってください。

【最重要: 手書き文字の認識】
- 手書きの文字、特に数字や単位、独特な略し方（例: "tsp"や"大"など）を文脈から推測して正確に読み取ってください。
- 画像が少しぼやけていたり、斜めになっていても、最大限補正して読み取ってください。
- 読み取れない箇所がある場合は、前後の文脈から推測するか、正直に空欄にしてください。

【出力フォーマット】
以下のJSONフォーマットで出力してください。JSON以外の余計な文章（「分かりました」など）は一切不要です。
\`\`\`json
{
  "title": "料理名",
  "description": "料理の説明や特徴（もし画像にあれば）",
  "ingredients": [
    {
      "name": "材料名",
      "quantity": "分量数値（例: 200, 1/2）",
      "unit": "単位（例: g, ml, 個, 大さじ, cup）。単位がない場合は空文字",
      "group": "グループ名（あれば。例: A, ソース用, トッピング）。なければnull"
    }
  ],
  "steps": [
    "手順1の文章...",
    "手順2の文章...",
    "手順3の文章..."
  ]
}
\`\`\`

【詳細ルール】
1. タイトル: 画像内で一番目立つ料理名を採用してください。
2. 材料:
   - 「A」「●」などでグループ化されている場合は \`group\` フィールドに入れてください。
   - "卵 1個" -> name: "卵", quantity: "1", unit: "個"
   - "塩コショウ 少々" -> name: "塩コショウ", quantity: "", unit: "少々" (quantityは数字のみが望ましいですが、"少々"などの場合はunitに入れてquantityは空でも可)
   - 【単位変換】: "大さじ", "小さじ", "カップ" (ccも含む) などの体積単位は、可能な限り "ml" (ミリリットル) または "g" (グラム) に換算してください。
     - 大さじ1 -> 15ml
     - 小さじ1 -> 5ml
     - 1カップ -> 200ml
     - "大さじ2" -> quantity: "30", unit: "ml"
     - 液体の場合はml、固体の場合は可能ならgに換算（難しければmlのままで可）。算出できない場合は元の単位のままでも良いですが、積極的な換算を試みてください。
3. 手順: 番号（1, ①, Step1）などのプレフィックスは削除して文章のみにしてください。
4. 画像から読み取れる情報のみを使用してください。存在しない情報を捏造しないでください。
`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55_000);

        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }]
        };

        const apiVersions = ['v1beta', 'v1'] as const;
        let lastErrorText = '';
        let lastStatus: number | null = null;
        let lastTried = '';

        try {
	            for (const modelId of modelCandidates) {
	                for (const apiVersion of apiVersions) {
	                    const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelId}:generateContent?key=${apiKey}`;
	                    lastTried = `${apiVersion}:${modelId}`;
	                    const t0 = Date.now();
	                    const response = await fetch(endpoint, {
	                        method: 'POST',
	                        headers: { 'Content-Type': 'application/json' },
	                        body: JSON.stringify(requestBody),
	                        signal: controller.signal,
	                    });
	                    const durationMs = Date.now() - t0;

	                    if (!response.ok) {
	                        const errText = await response.text();
	                        lastErrorText = errText;
	                        lastStatus = response.status;
	                        console.error("Gemini API Error:", { apiVersion, modelId, status: response.status, errText });

	                        // If the model isn't available for this API key/API version, try the next option.
	                        if (response.status === 404) continue;

	                        // Other errors (quota/auth) won't be fixed by switching models.
	                        const formatted = formatGeminiError(response.status, errText);
	                        if (supabaseClient) {
	                            logApiUsage(supabaseClient, {
	                                apiName: 'gemini',
	                                endpoint: 'analyze-image',
	                                modelName: modelId,
	                                userId: ctx.userId,
	                                userEmail: ctx.userEmail,
	                                requestSizeBytes: file.size,
	                                status: 'error',
	                                errorMessage: formatted,
	                                durationMs,
	                                metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp, apiVersion },
	                            }).catch(console.error);
	                        }
	                        return { error: formatted };
	                    }

                    const data = await response.json();
                    const candidate = data.candidates?.[0];
                    if (!candidate) return { error: "No candidate returned from Gemini" };

                    const rawText = candidate.content?.parts?.[0]?.text;
                    if (!rawText) return { error: "No text content in Gemini response" };

                    // Extract JSON from code blocks if present
                    let jsonStr = rawText;
                    if (jsonStr.includes('```json')) {
                        jsonStr = jsonStr.split('```json')[1].split('```')[0];
                    } else if (jsonStr.includes('```')) {
                        jsonStr = jsonStr.split('```')[1].split('```')[0];
	                    }

	                    try {
	                        const usage = data.usageMetadata || {};
	                        const tokensIn = usage.promptTokenCount || 0;
	                        const tokensOut = usage.candidatesTokenCount || 0;
	                        const billing = getGeminiCostBreakdown(
	                            normalizeGeminiModelForEstimation(modelId),
	                            tokensIn,
	                            tokensOut,
	                        );
	                        const estimatedCost = estimateGeminiCost(
	                            billing.normalizedModel,
	                            tokensIn,
	                            tokensOut,
	                        );

	                        // Log success
	                        if (supabaseClient) {
	                            logApiUsage(supabaseClient, {
	                                apiName: 'gemini',
	                                endpoint: 'analyze-image',
	                                modelName: modelId,
	                                userId: ctx.userId,
	                                userEmail: ctx.userEmail,
	                                requestSizeBytes: file.size,
	                                inputTokens: tokensIn,
	                                outputTokens: tokensOut,
	                                status: 'success',
	                                durationMs,
	                                estimatedCostJpy: estimatedCost,
	                                metadata: {
	                                    requestId: ctx.requestId,
	                                    engine: ctx.engine,
	                                    clientIp: ctx.clientIp,
	                                    apiVersion,
	                                    billing_type: 'token_weighted',
	                                    billing_breakdown: {
	                                        model: billing.normalizedModel,
	                                        rate_per_1m_jpy: billing.ratePer1M,
	                                        input_tokens: billing.inputTokens,
	                                        output_tokens: billing.outputTokens,
	                                        input_cost_jpy: billing.inputCostJpy,
	                                        output_cost_jpy: billing.outputCostJpy,
	                                        total_cost_jpy: billing.totalCostJpy,
	                                    },
	                                },
	                            }).catch(console.error);
	                        }

	                        return {
	                            recipe: JSON.parse(jsonStr.trim()),
	                            rawText: rawText?.slice?.(0, 20_000) ?? rawText,
                            usage: usage,
                            model: modelId,
                        };
	                    } catch (parseErr) {
	                        console.error("JSON Parse Failed:", parseErr);
	                        if (supabaseClient) {
	                            logApiUsage(supabaseClient, {
	                                apiName: 'gemini',
	                                endpoint: 'analyze-image',
	                                modelName: modelId,
	                                userId: ctx.userId,
	                                userEmail: ctx.userEmail,
	                                requestSizeBytes: file.size,
	                                status: 'error',
	                                errorMessage: "JSON Parse Failed",
	                                durationMs,
	                                metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp, apiVersion },
	                            }).catch(console.error);
	                        }
	                        return {
	                            error: "JSON Parse Failed",
	                            rawText: rawText?.slice?.(0, 20_000) ?? rawText
	                        };
                    }
                }
            }

            // All candidates were 404 (model not found)
            const suffix = lastTried ? ` (last tried: ${lastTried})` : '';
            return { error: `${formatGeminiError(lastStatus ?? 404, lastErrorText || 'Model not found')}${suffix}` };
        } finally {
            clearTimeout(timeoutId);
        }

    } catch (e) {
        console.error("Gemini Analysis Failed:", e);
        if (supabaseClient) {
            logApiUsage(supabaseClient, {
                apiName: 'gemini',
                endpoint: 'analyze-image',
                modelName: overrideModel || null,
                userId: ctx.userId,
                userEmail: ctx.userEmail,
                requestSizeBytes: file.size,
                status: 'error',
                errorMessage: e?.message || String(e),
                metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp },
            }).catch(console.error);
        }
        if (e?.name === 'AbortError') {
            return { error: 'Gemini API がタイムアウトしました' };
        }
        return { error: e?.message || String(e) };
    }
}

// --------------------------------------------------------------------------
// Azure Document Intelligence Fallback
// --------------------------------------------------------------------------
async function analyzeImageWithAzure(file: File) {
    const AZURE_DI_KEY = Deno.env.get('AZURE_DI_KEY') || Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_DI_ENDPOINT = Deno.env.get('AZURE_DI_ENDPOINT') || Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');

    if (!AZURE_DI_KEY || !AZURE_DI_ENDPOINT) {
        return { error: 'Azureの認証情報が設定されていません（AZURE_DI_ENDPOINT / AZURE_DI_KEY もしくは AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / AZURE_DOCUMENT_INTELLIGENCE_KEY）' };
    }

    try {
        const apiUrl = `${AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
        const azureContentType = normalizeImageMimeType(file);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_DI_KEY,
                'Content-Type': azureContentType,
            },
            body: file,
        });

        if (!response.ok) {
            const errText = await response.text();
            return { error: `Azure API Failed: ${response.statusText} (${errText})` };
        }

        const operationLocation = response.headers.get('Operation-Location');
        if (!operationLocation) {
            return { error: 'Azureからの応答に Operation-Location が含まれていません。' };
        }

        // Poll for results
        let result = null;
        let status = 'notStarted';
        let retries = 0;
        while (status !== 'succeeded' && status !== 'failed' && retries < 30) {
            await new Promise(r => setTimeout(r, 1000));
            const pollRes = await fetch(operationLocation, {
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_DI_KEY },
            });
            const pollData = await pollRes.json();
            status = pollData.status;

            if (status === 'succeeded') {
                result = pollData.analyzeResult;
            } else if (status === 'failed') {
                return { error: 'Azureでの解析処理が失敗しました。' };
            }
            retries++;
        }

        if (!result) {
            return { error: '解析がタイムアウトしました。' };
        }

        const fullText = result.content || "";
        const lines = (result.pages?.[0]?.lines || []).map((l: any) => l.content);
        const recipe = parseAzureResult(lines, fullText);

        return {
            recipe,
            rawText: fullText?.slice?.(0, 20_000) ?? fullText,
            fullText,
            lines,
            source: 'azure'
        };

    } catch (e) {
        console.error("Azure Analysis Failed:", e);
        return { error: e?.message || String(e) };
    }
}

// --------------------------------------------------------------------------
// Groq (Vision): Image -> recipe JSON (no OCR dependency)
// --------------------------------------------------------------------------
async function analyzeImageWithGroqVision(file: File, supabaseClient: any, ctx: RequestLogContext) {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
        console.warn("Skipping Groq Vision: No GROQ_API_KEY found");
        return null;
    }

    const overrideModel = String(Deno.env.get('GROQ_VISION_MODEL') || '').trim();
    const modelId = overrideModel || 'meta-llama/llama-4-scout-17b-16e-instruct';

    try {
        // Groqのbase64画像は 4MB (base64文字列) 制限があるため、元画像は余裕を持って抑える。
        const MAX_GROQ_IMAGE_BYTES = 3_000_000;
        if (file.size > MAX_GROQ_IMAGE_BYTES) {
            return { error: `画像サイズが大きすぎるためGroq(Vision)をスキップします (${Math.round(file.size / 1_000_000)}MB)` };
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Image = encode(arrayBuffer);
        const MAX_GROQ_BASE64_CHARS = 4_000_000;
        if (base64Image.length > MAX_GROQ_BASE64_CHARS) {
            return { error: `画像が大きすぎるためGroq(Vision)をスキップします (base64=${Math.round(base64Image.length / 1_000_000)}MB)` };
        }
        const mimeType = normalizeImageMimeType(file);

        const prompt = `
あなたは世界最高峰のパティシエかつ料理研究家です。
渡された画像（手書きのメモやスクリーンショット）から料理のレシピ情報を正確に読み取ってください。

【最重要: 手書き文字の認識】
- 手書きの文字、特に数字や単位、独特な略し方（例: "tsp"や"大"など）を文脈から推測して正確に読み取ってください。
- 画像が少しぼやけていたり、斜めになっていても、最大限補正して読み取ってください。
- 読み取れない箇所がある場合は、前後の文脈から推測するか、正直に空欄にしてください。

【出力フォーマット】
以下のJSONフォーマットで出力してください。JSON以外の余計な文章（「分かりました」など）は一切不要です。
{
  "title": "料理名",
  "description": "料理の説明や特徴（もし画像にあれば）",
  "ingredients": [
    {
      "name": "材料名",
      "quantity": "分量数値（例: 200, 1/2）",
      "unit": "単位（例: g, ml, 個, 大さじ, cup）。単位がない場合は空文字",
      "group": "グループ名（あれば。例: A, ソース用, トッピング）。なければnull"
    }
  ],
  "steps": [
    "手順1の文章...",
    "手順2の文章...",
    "手順3の文章..."
  ]
}

【詳細ルール】
1. タイトル: 画像内で一番目立つ料理名を採用してください。
2. 材料:
   - 「A」「●」などでグループ化されている場合は group フィールドに入れてください。
   - "卵 1個" -> name: "卵", quantity: "1", unit: "個"
   - "塩コショウ 少々" -> name: "塩コショウ", quantity: "", unit: "少々"
   - 可能な範囲で体積単位は ml に換算してください（大さじ1=15ml、小さじ1=5ml、1カップ=200ml）。
3. 手順: 番号（1, ①, Step1）などのプレフィックスは削除して文章のみにしてください。
4. 画像から読み取れる情報のみを使用してください。存在しない情報を捏造しないでください。
`;

        const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        const requestPayload = {
            model: modelId,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                    ]
                }
            ],
            temperature: 0.1,
            max_completion_tokens: 4000,
            top_p: 1,
            response_format: { type: "json_object" },
        };

	        const t0 = Date.now();
	        const response = await fetch(endpoint, {
	            method: 'POST',
	            headers: {
	                'Content-Type': 'application/json',
	                'Authorization': `Bearer ${apiKey}`,
	            },
	            body: JSON.stringify(requestPayload),
	        });
	        const durationMs = Date.now() - t0;

	        if (!response.ok) {
	            const errText = await response.text();
	            if (supabaseClient) {
	                logApiUsage(supabaseClient, {
	                    apiName: 'groq',
	                    endpoint: 'analyze-image',
	                    modelName: modelId,
	                    userId: ctx.userId,
	                    userEmail: ctx.userEmail,
	                    requestSizeBytes: file.size,
	                    status: 'error',
	                    errorMessage: `Groq(Vision) API Error: ${response.status} ${errText}`,
	                    durationMs,
	                    metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp },
	                }).catch(console.error);
	            }
	            return { error: `Groq(Vision) API Error: ${response.status} ${errText}` };
	        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';
        if (!content) return { error: 'Groq(Vision)の応答が空でした' };

        try {
            const parsed = parseJsonFromLLM(content);
            const normalized = normalizeRecipeFromLLM(parsed);
            const { recipe, hasContent } = ensureRecipeTitle(normalized);
            if (!hasContent) {
                return { error: 'Groq(Vision)のJSONにレシピ内容（材料・手順）がありませんでした', rawText: String(content).slice(0, 20_000) };
            }

            // Log success with Groq cost estimate
            try {
	                const usage = data?.usage || {};
	                const tokensIn = usage?.prompt_tokens || 0;
	                const tokensOut = usage?.completion_tokens || 0;
	                const estimatedCostJpy = estimateGroqCost(modelId, tokensIn, tokensOut);
	                if (supabaseClient) {
	                    logApiUsage(supabaseClient, {
	                        apiName: 'groq',
	                        endpoint: 'analyze-image',
	                        modelName: modelId,
	                        userId: ctx.userId,
	                        userEmail: ctx.userEmail,
	                        requestSizeBytes: file.size,
	                        inputTokens: tokensIn,
	                        outputTokens: tokensOut,
	                        status: 'success',
	                        durationMs,
	                        estimatedCostJpy,
	                        metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp },
	                    }).catch(console.error);
	                }
	            } catch {
	                // ignore
	            }

            return {
                recipe,
                rawText: String(content).slice(0, 20_000),
                model: modelId,
            };
	        } catch (e) {
	            if (supabaseClient) {
	                logApiUsage(supabaseClient, {
	                    apiName: 'groq',
	                    endpoint: 'analyze-image',
	                    modelName: modelId,
	                    userId: ctx.userId,
	                    userEmail: ctx.userEmail,
	                    requestSizeBytes: file.size,
	                    status: 'error',
	                    errorMessage: e?.message || String(e),
	                    durationMs,
	                    metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp, stage: 'parse_json' },
	                }).catch(console.error);
	            }
	            return { error: `Groq(Vision)のJSON解析に失敗しました: ${e?.message || String(e)}`, rawText: String(content).slice(0, 20_000) };
	        }
    } catch (e) {
        console.error("Groq(Vision) Analysis Failed:", e);
        return { error: e?.message || String(e) };
    }
}

// --------------------------------------------------------------------------
// Groq (Text) Fallback: Structure OCR text into recipe JSON
// --------------------------------------------------------------------------
function extractBalancedJson(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
        const c = text[i];

        if (escape) {
            escape = false;
            continue;
        }
        if (c === '\\') {
            escape = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

function parseJsonFromLLM(raw: string): any {
    const trimmed = String(raw || '').trim();
    if (!trimmed) throw new Error('Empty response');

    // 1) Direct JSON
    try {
        return JSON.parse(trimmed);
    } catch {
        // continue
    }

    // 2) ```json ... ```
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[1]) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch {
            // continue
        }
    }

    // 3) Balanced braces extraction
    const balanced = extractBalancedJson(trimmed);
    if (balanced) {
        return JSON.parse(balanced);
    }

    // 4) Fallback: first { to last }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
        return JSON.parse(trimmed.slice(first, last + 1));
    }

    throw new Error('JSON Parse Failed');
}

function normalizeRecipeFromLLM(recipe: any) {
    const normalized: any = {
        title: String(recipe?.title ?? recipe?.name ?? '').trim(),
        description: String(recipe?.description ?? '').trim(),
        ingredients: [] as any[],
        steps: [] as string[],
    };

    const rawIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    normalized.ingredients = rawIngredients.map((ing: any) => {
        if (typeof ing === 'string') {
            return { name: ing.trim(), quantity: '', unit: '', group: null };
        }
        if (!ing || typeof ing !== 'object') {
            return { name: '', quantity: '', unit: '', group: null };
        }
        const name = String(ing.name ?? ing.item ?? ing.material ?? ing.ingredient ?? '').trim();
        const quantity = String(ing.quantity ?? ing.qty ?? '').trim();
        const unit = String(ing.unit ?? '').trim();
        const group = ing.group == null || ing.group === '' ? null : String(ing.group).trim();
        return { name, quantity, unit, group };
    }).filter((ing: any) => ing.name || ing.quantity || ing.unit);

    const rawSteps = Array.isArray(recipe?.steps) ? recipe.steps : [];
    normalized.steps = rawSteps.map((s: any) => {
        if (typeof s === 'string') return s.trim();
        if (s && typeof s === 'object') {
            return String(s.step ?? s.text ?? s.instruction ?? s.name ?? '').trim();
        }
        return '';
    }).filter(Boolean);

    return normalized;
}

/** title が空でも ingredients/steps があればフォールバックを設定する */
function ensureRecipeTitle(recipe: any): { recipe: any; hasContent: boolean } {
    const hasIngredients = Array.isArray(recipe?.ingredients) && recipe.ingredients.length > 0;
    const hasSteps = Array.isArray(recipe?.steps) && recipe.steps.length > 0;
    const hasContent = hasIngredients || hasSteps;
    let title = String(recipe?.title ?? '').trim();
    if (!title && hasContent) {
        const firstGroup = recipe.ingredients?.[0]?.group;
        const firstIngName = recipe.ingredients?.[0]?.name;
        title = (firstGroup && String(firstGroup).trim()) || (firstIngName && String(firstIngName).trim()) || '画像から取り込んだレシピ';
    }
    if (!title) title = '画像から取り込んだレシピ';
    return { recipe: { ...recipe, title }, hasContent };
}

async function analyzeRecipeTextWithGroq(ocrText: string, supabaseClient: any, ctx: RequestLogContext) {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) return { error: 'GROQ_API_KEY が設定されていません' };

    const modelId = String(Deno.env.get('GROQ_RECIPE_MODEL') || '').trim() || 'llama-3.3-70b-versatile';

    // Guard: avoid sending extremely large OCR blobs (413 / token blowups).
    const MAX_OCR_CHARS = 20_000;
    const trimmedText = String(ocrText || '').trim();
    const shortText = trimmedText.length > MAX_OCR_CHARS ? `${trimmedText.slice(0, MAX_OCR_CHARS)}\n...` : trimmedText;
    if (!shortText) return { error: 'OCRテキストが空のためGroq解析をスキップします' };

    const prompt = `
あなたは世界最高峰のパティシエかつ料理研究家です。
以下は画像からOCR抽出したテキストです。OCRには誤認識が含まれる可能性があるため、文脈に沿って最小限の補正を行ってください。
ただし、存在しない情報は捏造せず、不明な箇所は空欄のままにしてください。

【OCRテキスト】
${shortText}

【出力フォーマット】
以下のJSONフォーマットで出力してください。JSON以外の文章は一切出力しないでください。
\`\`\`json
{
  "title": "料理名",
  "description": "料理の説明や特徴（もしテキストにあれば）",
  "ingredients": [
    {
      "name": "材料名",
      "quantity": "分量数値（例: 200, 1/2）",
      "unit": "単位（例: g, ml, 個, 大さじ, cup）。単位がない場合は空文字",
      "group": "グループ名（あれば。例: A, ソース用, トッピング）。なければnull"
    }
  ],
  "steps": [
    "手順1の文章...",
    "手順2の文章..."
  ]
}
\`\`\`

【詳細ルール】
- 手順は番号(1, ①, Step1等)の接頭辞を削除し、文章のみを配列にしてください。
- 材料の「少々」「適量」などは quantity を空、unit に入れても構いません。
- 可能な範囲で体積単位は ml に換算してください（大さじ1=15ml、小さじ1=5ml、1カップ=200ml）。無理な場合は元の表記のままで構いません。
`;

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const requestPayload = {
        model: modelId,
        messages: [
            { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_completion_tokens: 4000,
        top_p: 1,
        response_format: { type: "json_object" },
    };

    const t0 = Date.now();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestPayload),
    });
    const durationMs = Date.now() - t0;

    if (!response.ok) {
        const errText = await response.text();
        if (supabaseClient) {
            logApiUsage(supabaseClient, {
                apiName: 'groq',
                endpoint: 'analyze-image',
                modelName: modelId,
                userId: ctx.userId,
                userEmail: ctx.userEmail,
                requestSizeBytes: shortText.length,
                status: 'error',
                errorMessage: `Groq API Error: ${response.status} ${errText}`,
                durationMs,
                metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp, stage: 'ocr_to_json' },
            }).catch(console.error);
        }
        return { error: `Groq API Error: ${response.status} ${errText}` };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) return { error: 'Groqの応答が空でした' };

    try {
        const parsed = parseJsonFromLLM(content);
        const normalized = normalizeRecipeFromLLM(parsed);
        const { recipe, hasContent } = ensureRecipeTitle(normalized);
        if (!hasContent) {
            return { error: 'GroqのJSONにレシピ内容（材料・手順）がありませんでした', rawText: String(content).slice(0, 20_000) };
        }

        // Log success with Groq cost estimate
        try {
            const usage = data?.usage || {};
            const tokensIn = usage?.prompt_tokens || 0;
            const tokensOut = usage?.completion_tokens || 0;
            const estimatedCostJpy = estimateGroqCost(modelId, tokensIn, tokensOut);
            if (supabaseClient) {
                logApiUsage(supabaseClient, {
                    apiName: 'groq',
                    endpoint: 'analyze-image',
                    modelName: modelId,
                    userId: ctx.userId,
                    userEmail: ctx.userEmail,
                    requestSizeBytes: shortText.length,
                    inputTokens: tokensIn,
                    outputTokens: tokensOut,
                    status: 'success',
                    durationMs,
                    estimatedCostJpy,
                    metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp, stage: 'ocr_to_json' },
                }).catch(console.error);
            }
        } catch {
            // ignore logging errors
        }

        return {
            recipe,
            rawText: String(content).slice(0, 20_000),
            model: modelId,
        };
    } catch (e) {
        if (supabaseClient) {
            logApiUsage(supabaseClient, {
                apiName: 'groq',
                endpoint: 'analyze-image',
                modelName: modelId,
                userId: ctx.userId,
                userEmail: ctx.userEmail,
                requestSizeBytes: shortText.length,
                status: 'error',
                errorMessage: e?.message || String(e),
                durationMs,
                metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp, stage: 'ocr_to_json', parse: true },
            }).catch(console.error);
        }
        return { error: `GroqのJSON解析に失敗しました: ${e?.message || String(e)}`, rawText: String(content).slice(0, 20_000) };
    }
}


serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Enforce JWT in-code (deploy with --no-verify-jwt; we verify here so 401s are under our control)
        const token = getAuthToken(req);
        if (!token) {
            return new Response(
                JSON.stringify({ error: '認証が必要です。再ログインしてください。' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
        let userId: string | null = null;
        let userEmail: string | null = null;
        try {
            const payload = await verifySupabaseJWT(token);
            userId = typeof payload.sub === 'string' ? payload.sub : null;
            userEmail = typeof (payload as any).email === 'string' ? (payload as any).email : null;
        } catch (e) {
            const msg = e?.message ?? String(e);
            return new Response(
                JSON.stringify({ error: 'トークンが無効または期限切れです。再ログインしてください。', detail: msg }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const clientIpHeader = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip');
        const clientIp = clientIpHeader ? String(clientIpHeader).split(',')[0].trim() : null;
        const requestId = crypto.randomUUID();

        // Initialize Supabase Client (optional)
        // - In production, Supabase injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
        // - In local `supabase functions serve`, env vars that start with SUPABASE_ may be skipped.
        //   Logging is optional, so we should not fail the whole request when the client can't be initialized.
        let supabaseClient: any = null;
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            if (supabaseUrl && serviceKey) {
                supabaseClient = createClient(supabaseUrl, serviceKey);
            }
        } catch (e) {
            console.warn('Failed to init Supabase client (logging will be disabled):', e?.message || String(e));
            supabaseClient = null;
        }

        const formData = await req.formData();
        const imageFile = formData.get('image');

        if (!imageFile || !(imageFile instanceof File)) {
            return new Response(
                JSON.stringify({ error: 'No image file provided' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const logs: string[] = [];
        logs.push('🚀 画像解析プロセスを開始しました...');
        logs.push('📸 画像を受信しました。解析準備中...');

        const sseHeaders = {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
        };

        const toEvent = (payload: any) => `data: ${JSON.stringify(payload)}\n\n`;
        const buildEvents = (finalEvent: any) => ([
            ...logs.map(msg => toEvent({ type: 'log', message: msg })),
            toEvent(finalEvent),
        ]).join('');

        const sendResult = (recipe: any, rawText: string, source: string) => {
            const events = buildEvents({ type: 'result', recipe, rawText, source });
            return new Response(events, { headers: sseHeaders });
        };

        const sendError = (message: string) => {
            const events = buildEvents({ type: 'error', message });
            return new Response(events, { headers: sseHeaders });
        };

	        // Default to Groq-first to minimize Gemini usage/cost unless the client explicitly opts in.
	        const engineRaw = String(formData.get('engine') || 'groq').trim().toLowerCase();
	        const engine = (engineRaw === 'gemini' || engineRaw === 'groq' || engineRaw === 'groq_vision' || engineRaw === 'auto')
	            ? engineRaw
	            : 'auto';

	        const ctx: RequestLogContext = {
	            requestId,
	            engine,
	            userId,
	            userEmail,
	            clientIp,
	        };

	        logs.push(`⚙️ 解析エンジン: ${engine === 'gemini'
	            ? '手書き (Gemini)'
	            : engine === 'groq'
	                ? '印刷/スクショ (Groq)'
                : engine === 'groq_vision'
                    ? 'Groqのみ (画像)'
                    : '自動'
            }`);

        // --------------------------------------------------------------------------
        // Engine: Gemini only (best for handwriting)
        // --------------------------------------------------------------------------
        if (engine === 'gemini') {
            const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VISION_API_KEY');
            if (!geminiKey) {
                const msg = 'Gemini API Keyが設定されていません（GEMINI_API_KEY/GOOGLE_API_KEY）';
                logs.push(`⚠️ ${msg}`);
                return sendError(`画像の解析に失敗しました: ${msg}`);
            }

            // Rate limit (Gemini is the highest-cost path)
            if (supabaseClient) {
                try {
                    const maxReq = Number(Deno.env.get('GEMINI_IMAGE_RATE_LIMIT_MAX') || 30);
                    const windowMin = Number(Deno.env.get('GEMINI_IMAGE_RATE_LIMIT_WINDOW_MIN') || 1440);
                    const limiter = new RateLimiter(supabaseClient, userId, 'analyze-image:gemini', { maxRequests: maxReq, windowMinutes: windowMin });
                    await limiter.check();
                } catch (e) {
                    logApiUsage(supabaseClient, {
                        apiName: 'gemini',
                        endpoint: 'analyze-image',
                        modelName: null,
                        userId: ctx.userId,
                        userEmail: ctx.userEmail,
                        requestSizeBytes: imageFile.size,
                        status: 'rate_limited',
                        errorMessage: e?.message || String(e),
                        metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp },
                    }).catch(console.error);
                    logs.push(`⏳ ${e?.message || String(e)}`);
                    return sendError(e?.message || String(e));
                }
            }

            logs.push('🤖 Gemini で解析中...');

            const geminiResult = await analyzeImageWithGemini(imageFile, supabaseClient, ctx);

            if (geminiResult && geminiResult.recipe && geminiResult.recipe.title) {
                logs.push('✅ Geminiによる解析に成功しました！');
                return sendResult(geminiResult.recipe, geminiResult.rawText || '', 'gemini');
            }

            const reason = geminiResult?.error || 'JSONの抽出に失敗';
            logs.push(`⚠️ Gemini解析失敗: ${reason}`);
            return sendError(`画像の解析に失敗しました: ${reason}`);
        }

        // --------------------------------------------------------------------------
        // Engine: Groq preferred (best for printed/screenshot)
        // --------------------------------------------------------------------------
        if (engine === 'groq') {
            const groqKey = Deno.env.get('GROQ_API_KEY');
            if (!groqKey) {
                const msg = 'GROQ_API_KEY が設定されていません';
                logs.push(`⚠️ ${msg}`);
                return sendError(`画像の解析に失敗しました: ${msg}`);
            }

            const hasAzure = !!(
                (Deno.env.get('AZURE_DI_KEY') || Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY')) &&
                (Deno.env.get('AZURE_DI_ENDPOINT') || Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT'))
            );
            let visionReason: string | null = null;
            let azureReason: string | null = null;

            logs.push('🤖 Groq(Vision) で解析中...');
            const groqVisionResult = await analyzeImageWithGroqVision(imageFile, supabaseClient, ctx);
            if (groqVisionResult?.recipe?.title) {
                logs.push('✅ Groq(Vision)による解析に成功しました！');
                return sendResult(groqVisionResult.recipe, groqVisionResult.rawText || '', 'groq');
            }

            visionReason = groqVisionResult?.error || 'JSONの抽出に失敗';
            logs.push(`⚠️ Groq(Vision)解析失敗: ${visionReason}`);

            // Fallback: Azure OCR -> Groq (Text)
            if (hasAzure) {
                logs.push('📄 Azure OCRでテキスト抽出中...');
                const azureResult = await analyzeImageWithAzure(imageFile);
                const ocrText = String((azureResult as any)?.fullText || (azureResult as any)?.rawText || '').trim();

                if (ocrText) {
                    logs.push('🤖 Groqでレシピを構造化中...');
                    const groqResult = await analyzeRecipeTextWithGroq(ocrText, supabaseClient, ctx);
                    if (groqResult?.recipe?.title) {
                        logs.push('✅ Groqによる構造化に成功しました！');
                        return sendResult(groqResult.recipe, String((azureResult as any)?.rawText || '').slice(0, 20_000), 'groq');
                    }

                    const reason = groqResult?.error || 'Groq解析に失敗しました';
                    azureReason = `OCR→Groq: ${reason}`;
                    logs.push(`⚠️ ${azureReason}`);
                } else {
                    const reason = (azureResult as any)?.error || 'Azure OCRに失敗しました';
                    azureReason = `Azure OCR: ${reason}`;
                    logs.push(`⚠️ ${azureReason}`);
                }
            } else {
                azureReason = 'Azure OCR未設定';
            }

            const reasons = [visionReason, azureReason].filter(Boolean).join(' / ');
            return sendError(`画像の解析に失敗しました: ${reasons}`);
        }

        // --------------------------------------------------------------------------
        // Engine: Groq vision only (no OCR)
        // --------------------------------------------------------------------------
        if (engine === 'groq_vision') {
            const groqKey = Deno.env.get('GROQ_API_KEY');
            if (!groqKey) {
                const msg = 'GROQ_API_KEY が設定されていません';
                logs.push(`⚠️ ${msg}`);
                return sendError(`画像の解析に失敗しました: ${msg}`);
            }

            logs.push('🤖 Groq(Vision) で解析中...');
            const groqVisionResult = await analyzeImageWithGroqVision(imageFile, supabaseClient, ctx);
            if (groqVisionResult?.recipe?.title) {
                logs.push('✅ Groq(Vision)による解析に成功しました！');
                return sendResult(groqVisionResult.recipe, groqVisionResult.rawText || '', 'groq');
            }

            const visionReason = groqVisionResult?.error || 'JSONの抽出に失敗';
            logs.push(`⚠️ Groq(Vision)解析失敗: ${visionReason}`);
            return sendError(`画像の解析に失敗しました: ${visionReason}`);
        }

        // --------------------------------------------------------------------------
        // Engine: Auto (Groq preferred -> Azure OCR -> OCR→Groq -> Gemini last)
        // --------------------------------------------------------------------------
        const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VISION_API_KEY');
        const groqKey = Deno.env.get('GROQ_API_KEY');
        const hasAzure = !!(
            (Deno.env.get('AZURE_DI_KEY') || Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY')) &&
            (Deno.env.get('AZURE_DI_ENDPOINT') || Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT'))
        );

        // 1) Groq(Vision) first (cheap, good for printed)
        let groqVisionFailureReason: string | null = null;
        if (groqKey) {
            logs.push('🤖 Groq(Vision) で解析中...');
            const groqVisionResult = await analyzeImageWithGroqVision(imageFile, supabaseClient, ctx);
            if (groqVisionResult?.recipe?.title) {
                logs.push('✅ Groq(Vision)による解析に成功しました！');
                return sendResult(groqVisionResult.recipe, groqVisionResult.rawText || '', 'groq');
            }
            const reason = groqVisionResult?.error || 'JSONの抽出に失敗';
            groqVisionFailureReason = reason;
            logs.push(`⚠️ Groq(Vision)解析失敗: ${reason}`);
        } else {
            groqVisionFailureReason = 'GROQ_API_KEY が設定されていません';
            logs.push('⚠️ GROQ_API_KEY が見つかりません。Groqをスキップします。');
        }

        // 2) Azure OCR (+ OCR -> Groq) fallback
        let groqTextFailureReason: string | null = null;
        let azureFailureReason: string | null = null;
        if (hasAzure) {
            logs.push('📄 Azure OCRでテキスト抽出中...');
            const azureResult = await analyzeImageWithAzure(imageFile);
            const ocrText = String((azureResult as any)?.fullText || (azureResult as any)?.rawText || '').trim();

            if (groqKey && ocrText) {
                logs.push('🤖 Groqでレシピを構造化中...');
                const groqResult = await analyzeRecipeTextWithGroq(ocrText, supabaseClient, ctx);
                if (groqResult?.recipe?.title) {
                    logs.push('✅ Groqによる構造化に成功しました！');
                    return sendResult(groqResult.recipe, String((azureResult as any)?.rawText || '').slice(0, 20_000), 'groq');
                }
                const reason = groqResult?.error || 'Groq解析に失敗しました';
                groqTextFailureReason = `OCR→Groq: ${reason}`;
                logs.push(`⚠️ ${groqTextFailureReason}`);
            }

            const azureRecipe = (azureResult as any)?.recipe;
            const hasUsefulAzureRecipe = !!(
                azureRecipe &&
                String(azureRecipe?.title || '').trim() &&
                ((azureRecipe?.ingredients?.length ?? 0) > 0 || (azureRecipe?.steps?.length ?? 0) > 0)
            );
            if (hasUsefulAzureRecipe) {
                logs.push('✅ Azure解析に成功しました！');
                return sendResult(azureRecipe, String((azureResult as any)?.rawText || '').slice(0, 20_000), String((azureResult as any)?.source || 'azure'));
            }

            azureFailureReason = (azureResult as any)?.error || 'Azure解析に失敗しました';
            logs.push(`⚠️ Azure解析失敗: ${azureFailureReason}`);
        } else {
            azureFailureReason = 'Azure OCR未設定';
        }

        // 3) Gemini last (best for handwriting, but highest cost)
        let geminiFailureReason: string | null = null;
        if (geminiKey) {
            // Rate limit (Gemini is the highest-cost path)
            if (supabaseClient) {
                try {
                    const maxReq = Number(Deno.env.get('GEMINI_IMAGE_RATE_LIMIT_MAX') || 30);
                    const windowMin = Number(Deno.env.get('GEMINI_IMAGE_RATE_LIMIT_WINDOW_MIN') || 1440);
                    const limiter = new RateLimiter(supabaseClient, userId, 'analyze-image:gemini', { maxRequests: maxReq, windowMinutes: windowMin });
                    await limiter.check();
                } catch (e) {
                    logApiUsage(supabaseClient, {
                        apiName: 'gemini',
                        endpoint: 'analyze-image',
                        modelName: null,
                        userId: ctx.userId,
                        userEmail: ctx.userEmail,
                        requestSizeBytes: imageFile.size,
                        status: 'rate_limited',
                        errorMessage: e?.message || String(e),
                        metadata: { requestId: ctx.requestId, engine: ctx.engine, clientIp: ctx.clientIp },
                    }).catch(console.error);
                    logs.push(`⏳ ${e?.message || String(e)}`);
                    return sendError(e?.message || String(e));
                }
            }

            logs.push('🤖 Gemini で解析中...');
            const geminiResult = await analyzeImageWithGemini(imageFile, supabaseClient, ctx);
            if (geminiResult?.recipe?.title) {
                logs.push('✅ Geminiによる解析に成功しました！');
                return sendResult(geminiResult.recipe, geminiResult.rawText || '', 'gemini');
            }
            const reason = geminiResult?.error || 'JSONの抽出に失敗';
            geminiFailureReason = reason;
            logs.push(`⚠️ Gemini解析失敗: ${reason}`);
        } else {
            geminiFailureReason = 'Gemini API Keyが設定されていません（GEMINI_API_KEY/GOOGLE_API_KEY）';
            logs.push('⚠️ Gemini API Keyが見つかりません。Geminiをスキップします。');
        }

        const reasons = [groqVisionFailureReason, groqTextFailureReason, azureFailureReason, geminiFailureReason].filter(Boolean).join(' / ');
        return sendError(`画像の解析に失敗しました: ${reasons}`);
    } catch (error) {
        console.error(error);
        const errMsg = error?.message ? String(error.message) : String(error);

        const events = `data: ${JSON.stringify({ type: 'error', message: errMsg || '不明なエラーが発生しました' })}\n\n`;

        return new Response(events, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        });
    }
})

// Helper functions for parsing Azure results
function parseAzureResult(lines: string[], fullText: string) {
    const recipe = {
        title: "",
        description: "",
        ingredients: [] as any[],
        steps: [] as string[]
    };

    let currentSection = 'unknown';
    let currentGroup = '';

    if (lines.length > 0) recipe.title = lines[0];

    const ingKeywords = ['材料', 'Ingredients', '用意するもの', '買い物リスト'];
    const stepKeywords = ['作り方', 'つくり方', '手順', 'Directions', 'Method', 'Steps', 'How to cook'];
    const excludeKeywords = ['保存方法', '使いみち', 'ポイント', 'advice', 'memo'];

    const ingredientPattern = /(\d+|g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円)/i;
    const stepNumberPattern = /^(\d+[\.\)\s]|①|②|③|❶|❷|❸|I\s|II\s|■|●|・)/;
    const sentencePattern = /[。\.]$/;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (ingKeywords.some(k => line.includes(k))) { currentSection = 'ingredients'; continue; }
        if (stepKeywords.some(k => line.includes(k))) { currentSection = 'steps'; continue; }
        if (excludeKeywords.some(k => line.includes(k))) { currentSection = 'unknown'; recipe.description += "\\n" + line + "\\n"; continue; }

        let isStepLine = stepNumberPattern.test(line);
        const isSentence = sentencePattern.test(line);
        const isIngLine = ingredientPattern.test(line) && line.length < 50 && !isSentence;

        if (isStepLine) {
            const startsWithUnit = /^\d+\s*(g|ml|kg|cc|tbsp|tsp|cup|個|本|枚|円|%)/i.test(line);
            if (startsWithUnit) isStepLine = false;
        }

        if (isStepLine) currentSection = 'steps';
        else if (isIngLine && currentSection !== 'ingredients') currentSection = 'ingredients';

        if (currentSection === 'ingredients') {
            if (isSentence && !isStepLine) {
                if (currentSection === 'ingredients') {
                    currentSection = 'steps';
                    recipe.steps.push(line);
                    continue;
                }
            }
            recipe.ingredients.push({ name: line, quantity: '', unit: '', group: currentGroup });
        } else if (currentSection === 'steps') {
            recipe.steps.push(line);
        } else {
            recipe.description += line + "\\n";
        }
    }
    recipe.description = recipe.description.trim();
    return recipe;
}
