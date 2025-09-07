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
    console.log('🔧 Test OCR function called')
    
    // 環境変数の確認
    const visionApiKey = Deno.env.get('VISION_API_KEY')
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    
    console.log('🔧 Environment variables:', {
      hasVisionApiKey: !!visionApiKey,
      hasGeminiApiKey: !!geminiApiKey,
      visionApiKeyLength: visionApiKey?.length || 0,
      geminiApiKeyLength: geminiApiKey?.length || 0
    })

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Test OCR function is working',
        env: {
          hasVisionApiKey: !!visionApiKey,
          hasGeminiApiKey: !!geminiApiKey
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

