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
    console.log('🔧 Test Vision API function called')
    
    const body = await req.json()
    console.log('🔧 Request body keys:', Object.keys(body))
    
    const { imageData, fileName } = body

    if (!imageData) {
      throw new Error('Image data is required')
    }

    console.log('🔍 Vision API test for:', fileName)
    console.log('🔍 Image data length:', imageData.length)

    // 環境変数を取得
    const visionApiKey = Deno.env.get('VISION_API_KEY');
    if (!visionApiKey) {
      throw new Error('VISION_API_KEY environment variable is not set');
    }
    
    console.log('🔧 Vision API Key exists:', !!visionApiKey)
    console.log('🔧 Vision API Key length:', visionApiKey.length)

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

    console.log('🔧 Sending request to Vision API...')

    // Cloud Vision APIを呼び出し
    const response = await fetch(`${visionApiUrl}?key=${visionApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    console.log('🔧 Vision API response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('🔧 Vision API error response:', errorText)
      throw new Error(`Vision API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    console.log('🔧 Vision API response received')
    
    // テキストを抽出
    const text = result.responses?.[0]?.textAnnotations?.[0]?.description || ''
    
    console.log('📝 Extracted text length:', text.length)
    console.log('📝 Extracted text preview:', text.substring(0, 100))

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Vision API test successful',
        fileName: fileName,
        imageDataLength: imageData.length,
        extractedTextLength: text.length,
        extractedTextPreview: text.substring(0, 200),
        visionApiResponse: result
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    console.error('❌ Error stack:', error.stack)
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

