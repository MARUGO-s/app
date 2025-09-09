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
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json()

    if (!imageBase64) {
      throw new Error('画像データが提供されていません')
    }

    // Vision APIキー（環境変数から取得）
    const visionApiKey = Deno.env.get('VISION_API_KEY')
    if (!visionApiKey) {
      throw new Error('Vision APIキーが設定されていません')
    }

    // Vision APIを呼び出し
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: imageBase64
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 1
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Vision API エラー: ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()
    console.log('📸 Vision API レスポンス:', result)

    if (result.responses && result.responses[0] && result.responses[0].textAnnotations) {
      const textAnnotations = result.responses[0].textAnnotations
      const fullText = textAnnotations[0]?.description || ''
      
      console.log('✅ Vision API テキスト抽出成功:', fullText.substring(0, 100) + '...')

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            text: fullText,
            annotations: textAnnotations
          },
          debug: {
            model: 'Vision API',
            imageSize: imageBase64.length,
            mimeType: mimeType,
            textLength: fullText.length
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    throw new Error('Vision APIから有効なテキストを取得できませんでした')

  } catch (error) {
    console.error('❌ Vision API エラー:', error)
    
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

