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
    console.log('📸 Vision API Function started')
    const requestBody = await req.json()
    console.log('📸 Vision API リクエスト受信:', JSON.stringify(requestBody, null, 2))

    const { contents } = requestBody

    if (!contents) {
      throw new Error('コンテンツが提供されていません')
    }

    console.log('📸 Vision API リクエスト受信:', {
      contentsLength: Array.isArray(contents) ? contents.length : 1,
      contentsType: typeof contents,
      firstContentParts: contents[0]?.parts?.length || 0
    })

    // Google API キー（環境変数から取得）
    // VISION_API_KEYを優先的に使用し、なければGOOGLE_API_KEYを使用
    const googleApiKey = Deno.env.get('VISION_API_KEY') || Deno.env.get('GOOGLE_API_KEY')
    if (!googleApiKey) {
      throw new Error('Google Vision API キーが設定されていません (VISION_API_KEY or GOOGLE_API_KEY)')
    }

    console.log('🔑 Using API key from:', Deno.env.get('VISION_API_KEY') ? 'VISION_API_KEY' : 'GOOGLE_API_KEY')

    // 複数画像対応: contentsが配列の場合はそのまま、単一の場合は配列に変換
    const processedContents = Array.isArray(contents) ? contents : [contents]
    
    console.log('📸 処理済みコンテンツ:', {
      count: processedContents.length,
      firstContentParts: processedContents[0]?.parts?.length || 0
    })

    // Google Gemini Vision API を呼び出し
    console.log('🔄 Calling Gemini API with endpoint:', `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent`)

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: processedContents
      })
    })

    console.log('📡 Gemini API Response status:', response.status, response.statusText)

    if (!response.ok) {
      const errorData = await response.text()
      console.error('❌ Gemini API エラー詳細:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData,
        apiKeyExists: !!googleApiKey,
        apiKeyLength: googleApiKey ? googleApiKey.length : 0,
        requestBody: JSON.stringify({
          contents: processedContents
        }, null, 2)
      })
      throw new Error(`Gemini API エラー: ${response.status} ${response.statusText} - ${errorData}`)
    }

    const result = await response.json()
    console.log('📸 Google Vision API レスポンス:', result)

    // Gemini API の応答をそのまま返す
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const extractedText = result.candidates[0].content.parts[0].text || ''

      console.log('✅ Google Vision API テキスト抽出成功:', extractedText.substring(0, 100) + '...')

      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    throw new Error('Google Vision API から有効なテキストを取得できませんでした')

  } catch (error) {
    console.error('❌ Google Vision API エラー:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      cause: error.cause
    })

    return new Response(
      JSON.stringify({
        error: error.message,
        errorType: error.name,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

