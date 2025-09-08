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
    const { text, sourceLanguage = 'auto', targetLanguage = 'ja' } = await req.json()

    if (!text) {
      throw new Error('翻訳するテキストが提供されていません')
    }

    // ChatGPT APIキー（一時的に直接設定）
    const chatgptApiKey = Deno.env.get('CHATGPT_API_KEY') || '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'
    if (!chatgptApiKey) {
      throw new Error('ChatGPT APIキーが設定されていません')
    }

    // 翻訳用プロンプトを作成
    const prompt = `以下の${sourceLanguage}語のテキストを${targetLanguage}語に翻訳してください。

原文: ${text}

翻訳のみを返してください。説明やコメントは含めないでください。
料理・レシピ関連の用語がある場合は、適切に翻訳してください。`

    // ChatGPT APIを呼び出し
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatgptApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたは翻訳の専門家です。与えられたテキストを正確に翻訳してください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`ChatGPT API エラー: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const translatedText = data.choices[0].message.content.trim()

    console.log('🌐 翻訳結果:', translatedText)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          originalText: text,
          translatedText: translatedText,
          sourceLanguage: sourceLanguage,
          targetLanguage: targetLanguage
        },
        debug: {
          model: 'gpt-4o-mini',
          originalLength: text.length,
          translatedLength: translatedText.length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('❌ 翻訳エラー:', error)
    
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
