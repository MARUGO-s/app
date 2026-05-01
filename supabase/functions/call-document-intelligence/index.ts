import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = getAuthToken(req);
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: '認証が必要です。再ログインしてください。' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    await verifySupabaseJWT(token);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'トークンが無効または期限切れです。再ログインしてください。' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('📄 Document Intelligence API Function started');
    
    // リクエストボディを一度だけ読み込む
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('📄 Document Intelligence リクエスト受信:', JSON.stringify(requestBody, null, 2));
    } catch (parseError) {
      console.error('❌ リクエストボディ解析エラー:', parseError);
      throw new Error(`リクエストボディの解析に失敗しました: ${parseError.message}`);
    }

    const { image, processorType = 'RECIPE_PROCESSOR', aiProvider = 'groq' } = requestBody;

    if (!image) {
      throw new Error('画像データが提供されていません');
    }

    const normalizedImage = typeof image === 'string'
      ? image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim()
      : '';

    console.log('📸 Received image payload info:', {
      originalLength: typeof image === 'string' ? image.length : null,
      normalizedLength: normalizedImage ? normalizedImage.length : null,
      hasPrefix: typeof image === 'string' ? image.startsWith('data:image') : false,
      processorType,
      aiProvider
    });

    // Azure Document Intelligence API キー（環境変数から取得）
    const apiKey = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY') || Deno.env.get('AZURE_DI_KEY');
    const endpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT') || Deno.env.get('AZURE_DI_ENDPOINT');
    
    if (!apiKey || !endpoint) {
      throw new Error('Azure Document Intelligence の APIキー/エンドポイントが設定されていません（AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / AZURE_DOCUMENT_INTELLIGENCE_KEY もしくは AZURE_DI_ENDPOINT / AZURE_DI_KEY）');
    }

    console.log('🔑 Using Azure Document Intelligence API');

    console.log('🔄 Calling Document Intelligence API:', endpoint);

    const response = await fetch(`${endpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Source: normalizedImage || image,
        pages: ["1"]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Azure Document Intelligence API エラー:', response.status, errorText);
      throw new Error(`Azure Document Intelligence API エラー: ${response.status} - ${errorText}`);
    }

    let result;
    try {
      // Azure Document Intelligence APIは非同期処理
      if (response.status === 202) {
        const operationLocation = response.headers.get('Operation-Location');
        if (!operationLocation) {
          throw new Error('Operation-Location ヘッダーが見つかりません');
        }
        
        console.log('🔄 非同期処理開始、結果をポーリング中...');
        
        // 結果をポーリング（最大30秒）
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const resultResponse = await fetch(operationLocation, {
            headers: {
              'Ocp-Apim-Subscription-Key': apiKey
            }
          });
          
          if (resultResponse.ok) {
            const resultData = await resultResponse.json();
            console.log('📄 結果確認レスポンス:', resultData);
            
            if (resultData.status === 'succeeded') {
              result = resultData;
              break;
            } else if (resultData.status === 'failed') {
              throw new Error(`分析が失敗しました: ${resultData.error?.message || 'Unknown error'}`);
            }
            // 'running' の場合は継続
          } else {
            throw new Error(`結果取得エラー: ${resultResponse.status} ${resultResponse.statusText}`);
          }
        }
        
        if (!result) {
          throw new Error('分析がタイムアウトしました');
        }
      } else {
        // 同期処理の場合
        const responseText = await response.text();
        console.log('📄 Azure Document Intelligence API レスポンステキスト:', responseText);
        
        if (responseText.trim()) {
          result = JSON.parse(responseText);
          console.log('📄 Azure Document Intelligence API レスポンス:', result);
        } else {
          result = { message: 'Empty response body' };
          console.log('⚠️ 空のレスポンスボディ');
        }
      }
    } catch (jsonError) {
      console.error('❌ JSON解析エラー:', jsonError);
      throw new Error(`JSON解析エラー: ${jsonError.message}`);
    }

    // AI専用処理: 選択されたAIでテキストを解析
    let finalRecipeData = null;
    
    try {
      console.log(`🤖 AI専用処理: ${aiProvider}でテキスト解析を開始...`);
      console.log(`🔍 選択されたAI: ${aiProvider}`);
      
      const aiApiKey = aiProvider === 'groq' 
        ? Deno.env.get('GROQ_API_KEY')
        : Deno.env.get('OPENAI_API_KEY');
        
      console.log(`🔑 APIキー取得: ${aiApiKey ? '成功' : '失敗'}`);
        
      if (!aiApiKey) {
        throw new Error(`${aiProvider} API キーが設定されていません`);
      }
      
      // 抽出されたテキストを取得
      const extractedText = getExtractedTextFromResult(result);
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('抽出されたテキストが空です');
      }
      
      // AI APIでテキストを解析
      const aiRecipeData = await callAIForTextAnalysis(extractedText, aiProvider, aiApiKey);

      if (aiRecipeData) {
        finalRecipeData = aiRecipeData;
        console.log(`✅ ${aiProvider} API解析完了:`, aiRecipeData);
      } else {
        throw new Error('AI解析に失敗しました');
      }
    } catch (aiError) {
      console.error(`❌ ${aiProvider} API処理エラー:`, aiError);
      throw new Error(`AI解析に失敗しました: ${aiError.message}`);
    }

    // レスポンスを短縮（生データは含めない）
    const responseData = {
      success: true,
      data: finalRecipeData,
      // デバッグ用の情報のみ含める
      debug: {
        status: 'success',
        extractedAt: new Date().toISOString(),
        dataSize: JSON.stringify(finalRecipeData).length,
        aiProvider: aiProvider
      }
    };

    return new Response(
      JSON.stringify(responseData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('❌ Document Intelligence API エラー:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        debug: {
          status: 'error',
          timestamp: new Date().toISOString(),
          errorType: error.name
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// 抽出されたテキストを取得する関数
function getExtractedTextFromResult(result: any): string {
  try {
    if (result.analyzeResult?.pages) {
      const textLines: string[] = [];
      for (const page of result.analyzeResult.pages) {
        if (page.lines) {
          for (const line of page.lines) {
            if (line.content) {
              textLines.push(line.content);
            }
          }
        }
      }
      return textLines.join('\n');
    }
    return '';
  } catch (error) {
    console.warn('⚠️ テキスト抽出エラー:', error);
    return '';
  }
}

// AI APIでテキストを解析する関数
async function callAIForTextAnalysis(text: string, aiProvider: string, apiKey: string): Promise<any> {
  const prompt = getOptimizedPrompt(text, aiProvider);

  if (aiProvider === 'groq') {
    console.log('🤖 Groq API呼び出し開始');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log('✅ Groq API応答取得成功');
        console.log('📄 Groq API生レスポンス:', content);

        const parsed = parseAIJsonResponse(content, text);
        if (parsed) {
          return parsed;
        }
      }
    } else {
      const errorText = await response.text();
      console.error('❌ Groq API エラー:', response.status, errorText);
      throw new Error(`Groq API エラー: ${response.status} - ${errorText}`);
    }
  } else if (aiProvider === 'chatgpt') {
    console.log('🤖 ChatGPT API呼び出し開始');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log('✅ ChatGPT API応答取得成功');
        console.log('📄 ChatGPT API生レスポンス:', content);

        const parsed = parseAIJsonResponse(content, text);
        if (parsed) {
          return parsed;
        }
      }
    } else {
      const errorText = await response.text();
      console.error('❌ ChatGPT API エラー:', response.status, errorText);
      throw new Error(`ChatGPT API エラー: ${response.status} - ${errorText}`);
    }
  }

  return null;
}

function parseAIJsonResponse(content: string, originalText: string): any {
  if (!content) {
    return fallbackRecipeFromText(originalText);
  }

  const candidates: string[] = [];
  const trimmed = content.trim();

  // 1. そのまま（バッククォート除去）
  candidates.push(trimmed.replace(/```(?:json)?/gi, '```'));
  candidates.push(trimmed.replace(/`/g, '').trim());

  // 2. コードフェンス内
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidates.push(fenceMatch[1].trim());
  }

  // 3. 最初の { から最後の } まで（バランス確認）
  const balanced = extractBalancedJson(trimmed);
  if (balanced) {
    candidates.push(balanced);
  }

  const tried = new Set<string>();

  for (const candidate of candidates) {
    const jsonText = candidate.trim();
    if (!jsonText || tried.has(jsonText)) {
      continue;
    }
    tried.add(jsonText);

    try {
      const parsed = JSON.parse(jsonText);
      return normalizeRecipeData(parsed, originalText);
    } catch (err) {
      console.warn('⚠️ JSON解析失敗候補:', jsonText.substring(0, 120));
      console.warn('⚠️ エラー内容:', err);
    }
  }

  console.warn('⚠️ JSON解析に失敗したためフォールバック解析を実行');
  return fallbackRecipeFromText(originalText);
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function normalizeRecipeData(recipe: any, originalText: string): any {
  if (!recipe || typeof recipe !== 'object') {
    return fallbackRecipeFromText(originalText);
  }

  const normalized: any = {
    title: String(recipe.title || 'OCRレシピ').trim(),
    description: String(recipe.description || '').trim(),
    servings: recipe.servings ?? '',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    notes: String(recipe.notes || '').trim()
  };

  normalized.ingredients = normalized.ingredients
    .map((ing: any) => normalizeIngredientEntry(ing))
    .filter((ing: any) => ing.item || ing.quantity || ing.unit || ing.price);

  normalized.steps = normalized.steps.map((step: any) => String(step || '').trim()).filter(Boolean);

  if (!normalized.ingredients.length) {
    const fallback = fallbackRecipeFromText(originalText);
    normalized.ingredients = fallback.ingredients;
    if (!normalized.description) {
      normalized.description = fallback.description;
    }
  }

  if (!normalized.steps.length) {
    normalized.steps = [];
  }

  return normalized;
}

function fallbackRecipeFromText(text: string): any {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 200);

  if (!lines.length) {
    return {
      title: 'OCRレシピ',
      description: '',
      servings: '',
      ingredients: [],
      steps: [],
      notes: ''
    };
  }

  const title = lines[0];
  const ingredients: Array<{ item: string; quantity: string; unit: string; price?: string }> = [];
  const steps: string[] = [];

  const unitPattern = /(?:g|kg|ml|L|cc|個|本|枚|カップ|大さじ|小さじ|杯|片|切れ|缶|袋)/;

  lines.forEach((line) => {
    if (/^\d+[\.、\)]/.test(line) || /工程|手順|STEP|混ぜ|焼|煮|炒め|茹で/.test(line)) {
      steps.push(line.replace(/^\d+[\.、\)]\s*/, ''));
      return;
    }

    if (/(材料|ingredient)/i.test(line)) {
      return;
    }

    const approximateMatch = line.match(/^(.*?)[：:\s]*?(適量|少々|お好み|ひとつまみ|お好みで)(?:[\s).）]*.*)?$/);
    if (approximateMatch) {
      const item = approximateMatch[1]
        .replace(/[（(].*$/g, '')
        .replace(/[:：]/g, '')
        .trim() || line.replace(/(適量|少々|お好み|ひとつまみ|お好みで).*/g, '').trim();
      const quantity = approximateMatch[2] || '適量';
      const priceMatch = line.match(/(¥\s*\d+(?:[,.]\d+)?|\d+(?:[,.]\d+)?\s*円)/);
      ingredients.push({
        item: item || '材料',
        quantity,
        unit: '',
        price: normalizePriceValue(priceMatch ? priceMatch[1] : '')
      });
      return;
    }

    if (/\d/.test(line) && unitPattern.test(line)) {
      const match = line.match(/^(.*?)(\d+(?:[\.\/]\d+)?)(.*)$/);
      if (match) {
        const priceMatch = line.match(/(\d+(?:,\d+)?\s*円|¥\s*\d+(?:[,.]\d+)?)/);
        const price = normalizePriceValue(priceMatch ? priceMatch[1] : '');
        const unit = match[3]
          .replace(priceMatch ? priceMatch[0] : '', '')
          .replace(/[:：-]/g, '')
          .trim();

        ingredients.push({
          item: match[1].trim(),
          quantity: match[2].trim(),
          unit,
          price
        });
        return;
      }
    }

    const priceOnlyMatch = line.match(/^(.*?)[：:\s]*?(¥\s*\d+(?:[,.]\d+)?|\d+(?:[,.]\d+)?\s*円)(?:\s|$)/);
    if (priceOnlyMatch) {
      const item = priceOnlyMatch[1]
        .replace(/[（(].*$/g, '')
        .replace(/[:：]/g, '')
        .replace(/[…\.・]+/g, ' ')
        .trim();
      const price = normalizePriceValue(priceOnlyMatch[2]);
      ingredients.push({
        item: item || '材料',
        quantity: '',
        unit: '',
        price
      });
      return;
    }

    if (/\s+\d+\s*$/.test(line)) {
      const match = line.match(/^(.*?)(\d+)$/);
      if (match) {
        ingredients.push({
          item: match[1].trim(),
          quantity: match[2].trim(),
          unit: '',
          price: ''
        });
        return;
      }
    }
  });

  const normalizedIngredients = ingredients
    .map((ing) => normalizeIngredientEntry(ing))
    .filter((ing) => ing.item || ing.quantity || ing.unit || ing.price);

  const normalizedSteps = steps
    .map((step) => String(step || '').trim())
    .filter(Boolean);

  return {
    title: title || 'OCRレシピ',
    description: lines.slice(1, 4).join('\n'),
    servings: '',
    ingredients: normalizedIngredients,
    steps: normalizedSteps,
    notes: ''
  };
}

// AIごとに最適化されたプロンプトを取得する関数
function getOptimizedPrompt(text: string, aiProvider: string): string {
  if (aiProvider === 'groq') {
    return getGroqPrompt(text);
  } else if (aiProvider === 'chatgpt') {
    return getChatGPTPrompt(text);
  }
  return getDefaultPrompt(text);
}

const UNIT_CONVERSION_GUIDANCE = `単位変換ルール:
- 次の日本特有の計量単位は必ず SI 単位に換算してください。
  - 大さじ1 = 15ml
  - 小さじ1 = 5ml
  - 1カップ = 200ml
  - 1合 = 180ml
  - 1cc / 1mL = 1ml
  - 1杯 = 200ml（特記がない場合）
- 換算後は quantity に数値、unit に g または ml などの SI 単位のみを使用してください。
- 密度が不明な場合は液体系は ml、粉類・固体は g を優先し、元の表記は notes に補足してください。
- 換算が困難な場合（例: 適量・少々・お好みなど）は quantity に元の表記を残し、unit は空欄にしてください。`;

const UNIT_NORMALIZATION_TABLE = [
  { pattern: /大さじ/i, unit: 'ml', factor: 15 },
  { pattern: /小さじ/i, unit: 'ml', factor: 5 },
  { pattern: /カップ/i, unit: 'ml', factor: 200 },
  { pattern: /\b(?:cc|ｃｃ|ml|ｍｌ)\b/i, unit: 'ml', factor: 1 },
  { pattern: /杯/i, unit: 'ml', factor: 200 }
];

function normalizePriceValue(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  const numeric = String(value)
    .replace(/[¥円]/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!numeric) {
    return '';
  }
  const numberValue = Number(numeric.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(numberValue)) {
    return numeric;
  }
  return numberValue.toLocaleString('ja-JP');
}

function formatNumber(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return '';
  }
  const formatted = value % 1 === 0 ? value.toString() : value.toFixed(2);
  return formatted.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function parseQuantity(value: string): number | null {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;

  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator !== 0) {
      return numerator / denominator;
    }
  }

  const mixedFraction = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const whole = parseFloat(mixedFraction[1]);
    const numerator = parseFloat(mixedFraction[2]);
    const denominator = parseFloat(mixedFraction[3]);
    if (denominator !== 0) {
      return whole + numerator / denominator;
    }
  }

  const numeric = parseFloat(trimmed.replace(',', '.'));
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  return null;
}

function removeUnitSuffixFromItem(item: string): { item: string; detectedUnit: string | null } {
  if (!item) return { item: '', detectedUnit: null };
  let detected: string | null = null;
  let cleaned = item.replace(/[…\.・]+/g, ' ').trim();

  UNIT_NORMALIZATION_TABLE.forEach(({ pattern }) => {
    if (pattern.test(cleaned)) {
      detected = cleaned.match(pattern)?.[0] || detected;
      cleaned = cleaned.replace(pattern, '').trim();
    }
  });

  cleaned = cleaned.replace(/[:：・\.\-\s]+$/g, '').trim();

  return { item: cleaned, detectedUnit: detected };
}

function normalizeIngredientEntry(raw: any): { item: string; quantity: string; unit: string; price: string } {
  if (!raw) {
    return { item: '', quantity: '', unit: '', price: '' };
  }

  if (typeof raw === 'string') {
    return normalizeIngredientEntry({ item: raw, quantity: '', unit: '', price: '' });
  }

  let item = String(raw.item || '').trim();
  let quantity = raw.quantity != null ? String(raw.quantity).trim() : '';
  let unit = raw.unit != null ? String(raw.unit).trim() : '';
  let price = normalizePriceValue(raw.price != null ? String(raw.price).trim() : '');

  if (!unit) {
    const extraction = removeUnitSuffixFromItem(item);
    item = extraction.item;
    if (extraction.detectedUnit) {
      unit = extraction.detectedUnit;
    }
  } else {
    const cleaned = removeUnitSuffixFromItem(item);
    item = cleaned.item;
  }

  if (quantity.match(/(適量|少々|お好み|ひとつまみ|適宜)/)) {
    return {
      item,
      quantity,
      unit: '',
      price
    };
  }

  const matchedRule = UNIT_NORMALIZATION_TABLE.find(({ pattern }) => unit && pattern.test(unit));
  if (matchedRule) {
    const numericQuantity = parseQuantity(quantity);
    if (numericQuantity != null) {
      const converted = numericQuantity * matchedRule.factor;
      quantity = formatNumber(converted);
    }
    unit = matchedRule.unit;
  }

  return {
    item,
    quantity,
    unit,
    price
  };
}

// Groq用プロンプト（高速・効率的）
function getGroqPrompt(text: string): string {
  return `レシピテキストを解析して、JSON形式で構造化してください。

テキスト:
${text}

出力形式:
{
  "title": "レシピタイトル",
  "description": "レシピの説明",
  "servings": "人数",
  "ingredients": [
    {"item": "材料名", "quantity": "分量", "unit": "単位", "price": "単価"}
  ],
  "steps": [
    "手順1",
    "手順2"
  ],
  "notes": "ポイントやコツ"
}

重要:
- 材料は正確に分離
- 手順は番号順
- 分量・単位を正確に抽出
- 重複を排除
- 不要な情報は除外
- 「ポイント」「コツ」「注意」などのコメントは notes にまとめて記載
- 行に含まれる価格（例: 230円、¥680など）は price フィールドに数値と通貨記号ごと記載
${UNIT_CONVERSION_GUIDANCE}`;
}

// ChatGPT用プロンプト（高精度・詳細）
function getChatGPTPrompt(text: string): string {
  return `以下のレシピテキストを詳細に解析し、構造化されたレシピデータを生成してください。

テキスト:
${text}

以下のJSON形式で返してください:
{
  "title": "レシピタイトル",
  "description": "レシピの説明",
  "servings": "人数",
  "ingredients": [
    {"item": "材料名", "quantity": "分量", "unit": "単位", "price": "単価"}
  ],
  "steps": [
    "手順1",
    "手順2"
  ],
  "notes": "ポイントやコツ"
}

注意事項:
- 材料は正確に分離してください
- 手順は番号順に整理してください
- 分量と単位は正確に抽出してください
- 重複する材料や手順は排除してください
- 不要な情報（UI要素、番号など）は除外してください
- 材料名に含まれる不要な文字（:selected:、:unselected:など）は除去してください
- 手順は実際の調理手順のみを抽出し、分量や単位のみの行は除外してください
- 「ポイント」「コツ」「注意」などのコメントは notes にまとめて記載してください
- 行に含まれる価格（例: 230円、¥680 など）は price フィールドに数値と通貨記号ごと記載してください
${UNIT_CONVERSION_GUIDANCE}`;
}

// デフォルトプロンプト
function getDefaultPrompt(text: string): string {
  return `レシピテキストを解析して、構造化されたレシピデータを生成してください。

テキスト:
${text}

以下のJSON形式で返してください:
{
  "title": "レシピタイトル",
  "description": "レシピの説明",
  "servings": "人数",
  "ingredients": [
    {"item": "材料名", "quantity": "分量", "unit": "単位", "price": "単価"}
  ],
  "steps": [
    "手順1",
    "手順2"
  ],
  "notes": "ポイントやコツ"
}

補足:
- 「ポイント」「コツ」「注意」などのコメントは notes にまとめて記載すること
- 行に含まれる価格（例: 230円、¥680など）は price に記載すること
${UNIT_CONVERSION_GUIDANCE}`;
}
