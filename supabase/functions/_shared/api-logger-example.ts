// API使用ログ記録の実装例
// analyze-image/index.ts にログ記録を追加する例

import { APILogger, estimateGeminiCost } from '../_shared/api-logger.ts'

// 関数の開始時にロガーを初期化
const logger = new APILogger('gemini', 'analyze-image', 'gemini-1.5-flash')

// ユーザー情報を設定（認証後）
const { data: userData } = await supabaseAsUser.auth.getUser()
if (userData?.user) {
    logger.setUser(userData.user.id, userData.user.email)
}

// API呼び出し前にモデル名を設定（必要に応じて）
logger.setModel('gemini-1.5-flash')

try {
    // Gemini API呼び出し
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { inline_data: { mime_type: mimeType, data: base64Image } },
                        { text: prompt },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 4096,
            },
        }),
    })

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`)
    }

    const result = await response.json()
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // トークン使用量を取得
    const usageMetadata = result?.usageMetadata || {}
    const inputTokens = usageMetadata.promptTokenCount || 0
    const outputTokens = usageMetadata.candidatesTokenCount || 0

    // コスト推定
    const estimatedCost = estimateGeminiCost('gemini-1.5-flash', inputTokens, outputTokens)

    // 成功ログを記録
    await logger.logSuccess({
        inputTokens,
        outputTokens,
        estimatedCostJpy: estimatedCost,
        requestSizeBytes: JSON.stringify(prompt).length + base64Image.length,
        responseSizeBytes: text.length,
        metadata: {
            imageSize: file.size,
            mimeType: mimeType,
        }
    })

    return { recipe: parseResponse(text), source: 'gemini' }

} catch (error) {
    // エラーログを記録
    await logger.logError(error.message, {
        errorType: error.name,
        endpoint: endpoint,
    })

    throw error
}


// ============================================
// call-gemini-api/index.ts の実装例
// ============================================

import { APILogger, estimateGeminiCost } from '../_shared/api-logger.ts'

const logger = new APILogger('gemini', 'call-gemini-api', 'gemini-1.5-flash')
logger.setUser(userData.user.id, userData.user.email)

try {
    const response = await fetch(endpoint, { /* ... */ })
    const result = await response.json()

    const inputTokens = result?.usageMetadata?.promptTokenCount || 0
    const outputTokens = result?.usageMetadata?.candidatesTokenCount || 0
    const estimatedCost = estimateGeminiCost('gemini-1.5-flash', inputTokens, outputTokens)

    await logger.logSuccess({
        inputTokens,
        outputTokens,
        estimatedCostJpy: estimatedCost,
    })

    return result

} catch (error) {
    await logger.logError(error.message)
    throw error
}


// ============================================
// DeepL API の実装例（translate/index.ts）
// ============================================

import { APILogger } from '../_shared/api-logger.ts'

const logger = new APILogger('deepl', 'translate', null)

try {
    const response = await fetch(DEEPL_API_URL, { /* ... */ })
    const data = await response.json()

    // DeepLは文字数ベース（トークンではない）
    await logger.logSuccess({
        metadata: {
            sourceText: text,
            targetLang: target_lang,
            characterCount: text.length,
        }
    })

    return data

} catch (error) {
    await logger.logError(error.message)
    throw error
}
