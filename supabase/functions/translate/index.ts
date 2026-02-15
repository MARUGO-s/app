// Setup type definitions for Deno environment
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts"

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-user-jwt, x-client-info, apikey, content-type',
}

console.log("DeepL Translation Function Initialized")

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // JWT検証（--no-verify-jwt でデプロイし、ここで検証する）
        const token = getAuthToken(req)
        if (!token) {
            return new Response(JSON.stringify({ error: '認証が必要です。再ログインしてください。' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }
        try {
            await verifySupabaseJWT(token)
        } catch (_e) {
            return new Response(JSON.stringify({ error: 'トークンが無効または期限切れです。再ログインしてください。' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const { text, target_lang } = await req.json()

        if (!text || !target_lang) {
            return new Response(JSON.stringify({ error: 'Missing text or target_lang' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Get API Key from Secrets (Server-side environment variable)
        const apiKey = Deno.env.get('DEEPL_API_KEY')
        if (!apiKey) {
            throw new Error('DEEPL_API_KEY not set in secrets')
        }

        const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"

        // Call DeepL API
        const response = await fetch(DEEPL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text, // DeepL accepts array of strings
                target_lang: target_lang
            })
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(`DeepL API Error: ${errorData.message || response.statusText}`)
        }

        const data = await response.json()

        // Return result
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Edge Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
