import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { url } = await req.json()

    if (!url) {
      throw new Error('URL is required')
    }

    console.log('📸 Screenshot request for:', url)

    // Puppeteerを使用してスクリーンショットを撮影
    const screenshot = await captureScreenshot(url)
    
    // Cloud Vision APIでOCR実行
    const text = await extractTextFromImage(screenshot)
    
    // Gemini APIでレシピ解析
    const recipeData = await analyzeRecipe(text)

    return new Response(
      JSON.stringify({
        ok: true,
        data: recipeData,
        screenshot: screenshot
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

async function captureScreenshot(url: string): Promise<string> {
  try {
    // Puppeteerを使用してスクリーンショットを撮影
    const puppeteer = await import('https://deno.land/x/puppeteer@16.2.0/mod.ts')
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // ページサイズを設定
    await page.setViewport({ width: 1200, height: 800 })
    
    // ページにアクセス
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    
    // 少し待機してページの読み込みを完了
    await page.waitForTimeout(3000)
    
    // スクリーンショットを撮影
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: false
    })
    
    await browser.close()
    
    // Base64エンコード
    const base64 = btoa(String.fromCharCode(...new Uint8Array(screenshot)))
    return `data:image/jpeg;base64,${base64}`
    
  } catch (error) {
    console.error('Screenshot capture error:', error)
    throw new Error(`Screenshot capture failed: ${error.message}`)
  }
}

async function extractTextFromImage(imageData: string): Promise<string> {
  try {
    // Cloud Vision APIキーを環境変数から取得
    const VISION_API_KEY = Deno.env.get('VISION_API_KEY')
    
    if (!VISION_API_KEY) {
      throw new Error('VISION_API_KEY not configured')
    }
    
    // Base64データ部分のみを抽出
    const base64Image = imageData.split(',')[1]
    
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: base64Image
          },
          features: [{
            type: 'TEXT_DETECTION',
            maxResults: 1
          }]
        }]
      })
    })

    if (!response.ok) {
      throw new Error(`Cloud Vision API error: ${response.status}`)
    }

    const result = await response.json()
    
    if (result.responses && result.responses[0] && result.responses[0].textAnnotations) {
      return result.responses[0].textAnnotations[0].description
    } else {
      return ''
    }
    
  } catch (error) {
    console.error('OCR error:', error)
    throw new Error(`OCR failed: ${error.message}`)
  }
}

async function analyzeRecipe(text: string): Promise<any> {
  try {
    // Gemini APIキーを環境変数から取得
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured')
    }
    
    const prompt = `
以下のレシピページのテキストを解析して、JSON形式で構造化データを抽出してください。

テキスト:
${text}

以下のJSON形式で返してください:
{
  "title": "レシピのタイトル",
  "description": "レシピの説明（あれば）",
  "ingredients": [
    {
      "item": "材料名",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    "手順1",
    "手順2",
    "手順3"
  ]
}

注意事項:
- 材料の分量と単位を正確に分離してください
- 手順は番号付きリストから抽出してください
- 日本語以外の場合は日本語に翻訳してください
- 単位は標準的な形式（g、ml、個、本など）に統一してください
`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
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
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const result = await response.json()
    
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const text = result.candidates[0].content.parts[0].text
      
      // JSONを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      } else {
        throw new Error('JSON data not found in response')
      }
    } else {
      throw new Error('Invalid response from Gemini API')
    }
    
  } catch (error) {
    console.error('Recipe analysis error:', error)
    throw new Error(`Recipe analysis failed: ${error.message}`)
  }
}


