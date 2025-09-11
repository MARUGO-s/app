import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔧 OCR function called')
    
    // 環境変数の確認
    const visionApiKey = Deno.env.get('VISION_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    
    console.log('🔧 Environment variables check:');
    console.log('🔧 VISION_API_KEY exists:', !!visionApiKey);
    console.log('🔧 GEMINI_API_KEY exists:', !!geminiApiKey);
    
    if (!visionApiKey) {
      throw new Error('VISION_API_KEY environment variable is not set');
    }
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    
    const body = await req.json()
    console.log('🔧 Request body keys:', Object.keys(body))
    
    const { imageData, fileName, url } = body

    if (!imageData) {
      throw new Error('Image data is required')
    }

    console.log('🔍 OCR request for:', fileName)
    console.log('🔍 Image data length:', imageData.length)
    console.log('🔍 URL:', url)

    // Cloud Vision APIでOCR実行
    console.log('🔧 Starting Vision API extraction...')
    const text = await extractTextFromImage(imageData)
    console.log('🔧 Vision API extraction completed, text length:', text.length)
    
    if (!text || text.trim().length === 0) {
      throw new Error('No text was extracted from the image. Please ensure the image contains clear, readable text.')
    }
    
    // テキストの最初の部分をログ出力（デバッグ用）
    console.log('📄 Extracted text preview (first 500 chars):', text.substring(0, 500))
    
    // レシピ関連キーワードの検索
    const recipeKeywords = ['材料', '手順', '作り方', '調理', '料理', 'レシピ', '分量', '手順', 'Ingredients', 'Steps', 'Method', 'Recipe'];
    const foundKeywords = recipeKeywords.filter(keyword => text.includes(keyword));
    console.log('🔍 Found recipe keywords:', foundKeywords)
    
    // Gemini APIでレシピ解析
    console.log('🔧 Starting Gemini API analysis...')
    const recipeData = await analyzeRecipe(text, url)
    console.log('🔧 Gemini API analysis completed')

    return new Response(
      JSON.stringify({
        ok: true,
        recipeData: recipeData,
        debug: {
          textLength: text.length,
          foundKeywords: foundKeywords,
          textPreview: text.substring(0, 500)
        }
      }),
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

async function extractTextFromImage(imageData: string): Promise<string> {
  try {
    // Cloud Vision APIのエンドポイント
    const visionApiUrl = 'https://vision.googleapis.com/v1/images:annotate'
    
    // 画像データからBase64部分を抽出
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
    
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Data
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1
            }
          ]
        }
      ]
    }

    // 環境変数を取得
    const visionApiKey = Deno.env.get('VISION_API_KEY');
    if (!visionApiKey) {
      throw new Error('VISION_API_KEY environment variable is not set');
    }
    
    // Cloud Vision APIを呼び出し
    const response = await fetch(`${visionApiUrl}?key=${visionApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    // テキストを抽出
    const text = result.responses?.[0]?.textAnnotations?.[0]?.description || ''
    
    console.log('📝 Extracted text length:', text.length)
    return text
    
  } catch (error) {
    console.error('Text extraction error:', error)
    throw new Error(`Text extraction failed: ${error.message}`)
  }
}

async function analyzeRecipe(text: string, url?: string): Promise<any> {
  try {
    // Gemini APIのエンドポイント
    const geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
    
    // URLに基づいてプロンプトを調整
    let prompt = '';
    
    if (url && url.includes('toptrading.co.jp')) {
      // Top Trading サイト専用のプロンプト
      prompt = `
以下のテキストはTop Tradingのレシピページから抽出されたものです。フランス料理のレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url}

テキスト:
${text}

以下の形式でJSONを返してください:
{
  "title": "料理名（日本語）",
  "originalTitle": "料理名（フランス語、もしあれば）",
  "description": "レシピの説明やコツ",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {
      "item": "材料名（日本語）",
      "originalItem": "材料名（フランス語、もしあれば）",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    {
      "step": "手順の説明（日本語）"
    }
  ],
  "notes": "メモやコツ（もしあれば）"
}

注意事項：
- 材料の分量で「大さじ」「小さじ」がある場合は、以下のように変換してください：
  - 大さじ1 = 15ml または 15g
  - 小さじ1 = 5ml または 5g
- 液体の場合はml、固体の場合はgを使用してください
- フランス語の材料名や料理名があれば、originalItemやoriginalTitleに記載してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
`;
    } else {
      // 一般的なレシピ用のプロンプト
      prompt = `
以下のテキストからレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url || '不明'}

テキスト:
${text}

以下の形式でJSONを返してください:
{
  "title": "料理名（日本語）",
  "originalTitle": "料理名（原語、もしあれば）",
  "description": "レシピの説明やコツ",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {
      "item": "材料名",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    {
      "step": "手順の説明"
    }
  ],
  "notes": "メモやコツ（もしあれば）"
}

注意事項：
- 材料の分量で「大さじ」「小さじ」がある場合は、以下のように変換してください：
  - 大さじ1 = 15ml または 15g
  - 小さじ1 = 5ml または 5g
- 液体の場合はml、固体の場合はgを使用してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
`;
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    }

    // 環境変数を取得
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    
    // Gemini APIを呼び出し
    const response = await fetch(`${geminiApiUrl}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    // レスポンスからテキストを抽出
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    console.log('📄 Gemini response text:', responseText)
    
    // JSONを抽出（```json と ``` の間）
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/)
    const jsonText = jsonMatch ? jsonMatch[1] : responseText
    
    // JSONをパース
    const recipeData = JSON.parse(jsonText)
    
    console.log('🍳 Recipe analysis completed')
    return recipeData
    
  } catch (error) {
    console.error('Recipe analysis error:', error)
    throw new Error(`Recipe analysis failed: ${error.message}`)
  }
}
