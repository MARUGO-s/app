import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
        const token = getAuthToken(req);
        if (!token) {
            return new Response(
                JSON.stringify({ error: '認証が必要です。再ログインしてください。' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        try {
            await verifySupabaseJWT(token);
        } catch (authErr) {
            console.error('Auth Warning (ignoring for debug):', authErr);
            // return new Response(
            //     JSON.stringify({ error: 'トークンが無効または期限切れです。' }),
            //     { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            // );
        }

        const { audioBase64, mimeType, fileName, language, promptContext } = await req.json();

        if (!audioBase64) {
            return new Response(
                JSON.stringify({ error: '音声データがありません' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Decode base64 to binary
        const binaryString = atob(audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Ensure proper file extension for Groq (Whisper)
        // Groq supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
        let finalFileName = fileName || 'audio.webm';
        if (!finalFileName.match(/\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i)) {
            finalFileName += '.webm';
        }

        const file = new File([bytes], finalFileName, { type: mimeType || 'audio/webm' });

        // Prepare FormData for Groq API
        const formData = new FormData();
        formData.append('file', file);
        // formData.append('model', 'whisper-large-v3');
        formData.append('model', 'whisper-large-v3-turbo');

        // Force Japanese output but allow override
        formData.append('language', language || 'ja');

        // 材料入力時は食材に特化したプロンプトで認識精度を向上
        const ingredientPrompt = 'レシピの材料名。玉ねぎ、にんじん、トマト、鶏肉、豚肉、醤油、塩、こしょう、砂糖、小麦粉、牛乳、バター、卵、大根、白菜、キャベツ、じゃがいも、オリーブオイル。';
        const defaultPrompt = '必ず日本語で出力してください。英語やローマ字は使わず、すべてカタカナか漢字で表記します。トマト、玉ねぎ、醤油、塩、コショウ、グラム。';
        const prompt = promptContext === 'ingredient' ? ingredientPrompt : defaultPrompt;
        formData.append('prompt', prompt);
        formData.append('response_format', 'verbose_json');

        const groqApiKey = Deno.env.get('GROQ_API_KEY');
        if (!groqApiKey) {
            throw new Error('GROQ_API_KEY is not set');
        }

        console.log(`Transcribing ${finalFileName} (${bytes.length} bytes) with Groq...`);
        const t0 = Date.now();

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
            },
            body: formData,
        });

        const duration = Date.now() - t0;
        console.log(`Groq API took ${(duration / 1000).toFixed(2)}s`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API Error:', response.status, errorText);
            throw new Error(`Groq API Error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        const text = result.text || '';

        // Log API usage
        try {
            // Calculate estimated cost
            // Model: whisper-large-v3 ($0.111 / hour)
            // Approx 0.0046 JPY / sec (at 150 JPY/USD)
            const audioDurationSec = result.duration || (result.segments ? result.segments[result.segments.length - 1].end : 0);
            const estimatedCost = audioDurationSec ? (audioDurationSec * 0.0046) : 0;

            // Get User ID from token if available
            let userId = null;
            try {
                const payload = await verifySupabaseJWT(token);
                userId = payload.sub;
            } catch { }

            const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            await supabaseAdmin.from('api_usage_logs').insert({
                api_name: 'groq',
                endpoint: 'voice-input-v3', // Distinct name
                model_name: 'whisper-large-v3',
                user_id: userId,
                duration_ms: duration, // Processing time
                estimated_cost_jpy: estimatedCost,
                metadata: {
                    audio_duration_sec: audioDurationSec,
                    input_bytes: bytes.length,
                    prompt_used: true
                },
                status: 'success'
            });
        } catch (logError) {
            console.error('Failed to log API usage:', logError);
            // Don't fail the request just because logging failed
        }

        return new Response(
            JSON.stringify({ success: true, text }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )

    } catch (error) {
        console.error("Transcription Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    }
})
