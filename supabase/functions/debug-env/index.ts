import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";

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

    const token = getAuthToken(req);
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: '認証が必要です。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    try {
      await verifySupabaseJWT(token);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'トークンが無効または期限切れです。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 環境変数の確認
    const envInfo = {
      GOOGLE_API_KEY: {
        exists: !!Deno.env.get('GOOGLE_API_KEY')
      },
      VISION_API_KEY: {
        exists: !!Deno.env.get('VISION_API_KEY')
      },
      GROQ_API_KEY: {
        exists: !!Deno.env.get('GROQ_API_KEY')
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
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
