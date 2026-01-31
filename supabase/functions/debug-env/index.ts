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
    console.log('🔍 Debug environment variables function called')

    // 環境変数の確認
    const envInfo = {
      GOOGLE_API_KEY: {
        exists: !!Deno.env.get('GOOGLE_API_KEY'),
        length: Deno.env.get('GOOGLE_API_KEY')?.length || 0,
        firstChars: Deno.env.get('GOOGLE_API_KEY')?.substring(0, 10) || 'N/A'
      },
      VISION_API_KEY: {
        exists: !!Deno.env.get('VISION_API_KEY'),
        length: Deno.env.get('VISION_API_KEY')?.length || 0,
        firstChars: Deno.env.get('VISION_API_KEY')?.substring(0, 10) || 'N/A'
      },
      GROQ_API_KEY: {
        exists: !!Deno.env.get('GROQ_API_KEY'),
        length: Deno.env.get('GROQ_API_KEY')?.length || 0
      }
    }

    console.log('🔍 Environment variables status:', envInfo)

    return new Response(
      JSON.stringify({
        success: true,
        environment: envInfo,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ Debug function error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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