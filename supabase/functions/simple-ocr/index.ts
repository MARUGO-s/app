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
    console.log('🔧 Simple OCR function called')
    
    const body = await req.json()
    console.log('🔧 Request body keys:', Object.keys(body))
    
    const { imageData, fileName } = body

    if (!imageData) {
      throw new Error('Image data is required')
    }

    console.log('🔍 OCR request for:', fileName)
    console.log('🔍 Image data length:', imageData.length)

    // 環境変数の確認
    const visionApiKey = Deno.env.get('VISION_API_KEY')
    console.log('🔧 Vision API Key exists:', !!visionApiKey)

    // 簡単なレスポンスを返す
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Simple OCR function is working',
        fileName: fileName,
        imageDataLength: imageData.length,
        hasVisionApiKey: !!visionApiKey
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

