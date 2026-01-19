// Setup type definitions for Deno environment
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

console.log("DeepL Translation Function Initialized")

Deno.serve(async (req) => {
    // Handle CORS Preflight details if necessary (Supabase handles basic CORS)
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            }
        })
    }

    try {
        const { text, target_lang } = await req.json()

        if (!text || !target_lang) {
            return new Response(JSON.stringify({ error: 'Missing text or target_lang' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
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
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // CORS for client call
            },
        })

    } catch (error) {
        console.error("Edge Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        })
    }
})
