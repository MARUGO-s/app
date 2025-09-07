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
    const { prompt, responseSchema } = await req.json()

    if (!prompt) {
      throw new Error('プロンプトが提供されていません')
    }

    // Gemini APIキーを環境変数から取得
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('Gemini APIキーが設定されていません')
    }

    // Gemini APIを呼び出し
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API エラー: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()

    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const text = result.candidates[0].content.parts[0].text
      
      // JSONを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const recipeData = JSON.parse(jsonMatch[0])
        return new Response(
          JSON.stringify(recipeData),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      } else {
        throw new Error('JSONデータが見つかりませんでした')
      }
    } else {
      throw new Error('Gemini APIから有効な応答がありませんでした')
    }

  } catch (error) {
    console.error('エラー:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})

