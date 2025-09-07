import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, language = 'ja', url } = await req.json()

    if (!text) {
      throw new Error('テキストが提供されていません')
    }

    // Gemini APIキー（直接設定）
    const geminiApiKey = 'AIzaSyAUsJcsyFY1vcBlrDNn1DYLRor_oqLErx4'

    // 言語に応じたプロンプトを作成
    let prompt = ''
    if (language === 'es') {
      prompt = `以下のスペイン語のレシピページからレシピ情報を抽出し、日本語に翻訳してください。

ページURL: ${url || '不明'}
ページ内容: ${text.substring(0, 8000)}

以下のJSON形式で回答してください（必ず有効なJSON形式で返してください）：

{
  "title": "レシピのタイトル（日本語）",
  "originalTitle": "Título de la Receta (Español)",
  "description": "レシピの説明（日本語）",
  "servings": "人数",
  "ingredients": [
    {
      "item": "材料名（日本語）",
      "originalItem": "Nombre del Ingrediente (Español)",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    "手順1（日本語）",
    "手順2（日本語）"
  ]
}

**重要**: 必ず材料（ingredients）と手順（steps）を抽出してください。空の配列にしないでください。

注意事項：
- 大さじ・小さじはmlに変換してください（大さじ1=15ml、小さじ1=5ml）
- 分量は数値で統一してください
- 材料名は日本語に翻訳してください
- originalItemには元のスペイン語の材料名をそのまま記載してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
- originalTitleには元のスペイン語のタイトルをそのまま記載してください
- 材料と手順は必ず抽出してください（空の配列にしない）`
    } else {
      prompt = `以下の${language}語のレシピページからレシピ情報を抽出し、日本語に翻訳してください。

ページURL: ${url || '不明'}
ページ内容: ${text.substring(0, 8000)}

以下のJSON形式で回答してください（必ず有効なJSON形式で返してください）：

{
  "title": "レシピのタイトル（日本語）",
  "originalTitle": "Recipe Title (${language})",
  "description": "レシピの説明（日本語）",
  "servings": "人数",
  "ingredients": [
    {
      "item": "材料名（日本語）",
      "originalItem": "Ingredient Name (${language})",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    "手順1（日本語）",
    "手順2（日本語）"
  ]
}

**重要**: 必ず材料（ingredients）と手順（steps）を抽出してください。空の配列にしないでください。

注意事項：
- 大さじ・小さじはmlに変換してください（大さじ1=15ml、小さじ1=5ml）
- 分量は数値で統一してください
- 材料名は日本語に翻訳してください
- originalItemには元の${language}語の材料名をそのまま記載してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
- originalTitleには元の${language}語のタイトルをそのまま記載してください
- 材料と手順は必ず抽出してください（空の配列にしない）`
    }

    // Gemini APIを呼び出し
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Gemini API エラー: ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const content = result.candidates[0].content.parts[0].text
      console.log('📝 Gemini応答テキスト:', content)

      // JSONを抽出
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Gemini APIから有効なJSONが返されませんでした')
      }

      const recipeData = JSON.parse(jsonMatch[0])
      console.log('✅ Gemini API レシピデータ抽出成功:', recipeData)

      return new Response(
        JSON.stringify({
          success: true,
          data: recipeData,
          debug: {
            model: 'gemini-1.5-pro',
            language: language,
            textLength: text.length,
            responseLength: content.length
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    throw new Error('Gemini APIから有効なレスポンスを取得できませんでした')

  } catch (error) {
    console.error('❌ Gemini API エラー:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        debug: {
          timestamp: new Date().toISOString(),
          userAgent: req.headers.get('user-agent')
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

