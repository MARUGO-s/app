import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// テキストからレシピデータを構築するフォールバック関数
function buildRecipeDataFromText(content: string, originalText: string, language: string, url?: string) {
  console.log('🔄 フォールバック処理: テキストからレシピデータを構築')
  
  const recipeData = {
    title: '',
    originalTitle: '',
    description: '',
    servings: '',
    ingredients: [],
    steps: [],
    notes: ''
  }
  
  // タイトルを抽出
  const titlePatterns = [
    /タイトル[：:]\s*(.+)/,
    /レシピ[：:]\s*(.+)/,
    /料理名[：:]\s*(.+)/,
    /(.+?)(?:のレシピ|レシピ|の作り方)/,
    /(.+?)(?:Recipe|recipe)/i
  ]
  
  for (const pattern of titlePatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      recipeData.title = match[1].trim()
      break
    }
  }
  
  // 材料を抽出
  const ingredientPatterns = [
    /材料[：:]\s*([\s\S]*?)(?=手順|作り方|調理|$)/,
    /Ingredients[：:]\s*([\s\S]*?)(?=Steps|Instructions|Method|$)/i,
    /Ingredientes[：:]\s*([\s\S]*?)(?=Pasos|Instrucciones|Método|$)/i
  ]
  
  for (const pattern of ingredientPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const ingredientText = match[1].trim()
      const lines = ingredientText.split('\n').filter(line => line.trim())
      
      recipeData.ingredients = lines.map(line => {
        const trimmed = line.trim().replace(/^[-•*]\s*/, '')
        if (trimmed) {
          return {
            item: trimmed,
            quantity: '',
            unit: ''
          }
        }
        return null
      }).filter(Boolean)
      break
    }
  }
  
  // 手順を抽出
  const stepPatterns = [
    /手順[：:]\s*([\s\S]*?)(?=コツ|ポイント|注意|$)/,
    /作り方[：:]\s*([\s\S]*?)(?=コツ|ポイント|注意|$)/,
    /Steps[：:]\s*([\s\S]*?)(?=Tips|Notes|$)/i,
    /Instructions[：:]\s*([\s\S]*?)(?=Tips|Notes|$)/i,
    /Pasos[：:]\s*([\s\S]*?)(?=Consejos|Notas|$)/i
  ]
  
  for (const pattern of stepPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      const stepText = match[1].trim()
      const lines = stepText.split('\n').filter(line => line.trim())
      
      recipeData.steps = lines.map(line => {
        const trimmed = line.trim().replace(/^\d+[\.\)]\s*/, '')
        if (trimmed) {
          return trimmed
        }
        return null
      }).filter(Boolean)
      break
    }
  }
  
  // 人数を抽出
  const servingPatterns = [
    /(\d+)\s*人前/,
    /(\d+)\s*servings/i,
    /(\d+)\s*personas/i,
    /(\d+)\s*人分/
  ]
  
  for (const pattern of servingPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      recipeData.servings = match[1]
      break
    }
  }
  
  // 説明を抽出
  const descPatterns = [
    /説明[：:]\s*(.+)/,
    /Description[：:]\s*(.+)/i,
    /Descripción[：:]\s*(.+)/i
  ]
  
  for (const pattern of descPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      recipeData.description = match[1].trim()
      break
    }
  }
  
  // タイトルがない場合は元のテキストから抽出を試行
  if (!recipeData.title) {
    const firstLine = originalText.split('\n')[0].trim()
    if (firstLine && firstLine.length < 100) {
      recipeData.title = firstLine
    }
  }
  
  console.log('✅ フォールバック処理完了:', recipeData)
  return recipeData
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

    // ChatGPT APIキー（環境変数から取得、フォールバックで直接埋め込み）
    let chatgptApiKey = Deno.env.get('CHATGPT_API_KEY')
    if (!chatgptApiKey) {
      // フォールバック: 直接埋め込み（本番環境では非推奨）
      chatgptApiKey = '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'
      console.log('⚠️ 環境変数からAPIキーを取得できませんでした。フォールバックを使用します。')
    }

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

    // ChatGPT APIを呼び出し
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatgptApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたはレシピ抽出の専門家です。与えられたテキストからレシピ情報を正確に抽出し、指定されたJSON形式で返してください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`ChatGPT API エラー: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content

    console.log('🤖 ChatGPT API レスポンス:', content)

    // JSONを抽出（より堅牢な処理）
    let recipeData = null
    
    // 1. 完全なJSONオブジェクトを探す
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        recipeData = JSON.parse(jsonMatch[0])
        console.log('✅ JSON抽出成功（正規表現）:', recipeData)
      } catch (e) {
        console.log('⚠️ JSON解析失敗（正規表現）:', e.message)
      }
    }
    
    // 2. 最初のJSONオブジェクトを探す（より緩い条件）
    if (!recipeData) {
      const startIndex = content.indexOf('{')
      const endIndex = content.lastIndexOf('}')
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        try {
          const jsonString = content.substring(startIndex, endIndex + 1)
          recipeData = JSON.parse(jsonString)
          console.log('✅ JSON抽出成功（インデックス）:', recipeData)
        } catch (e) {
          console.log('⚠️ JSON解析失敗（インデックス）:', e.message)
        }
      }
    }
    
    // 3. フォールバック: テキストから手動でレシピデータを構築
    if (!recipeData) {
      console.log('⚠️ JSON抽出失敗、フォールバック処理を実行')
      recipeData = buildRecipeDataFromText(content, text, language, url)
    }
    
    console.log('✅ ChatGPT API レシピデータ抽出完了:', recipeData)

    return new Response(
      JSON.stringify({
        success: true,
        data: recipeData,
        debug: {
          model: 'gpt-4o-mini',
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

  } catch (error) {
    console.error('❌ ChatGPT API エラー:', error)
    
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
