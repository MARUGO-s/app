import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RequestPayload = {
  mode?: string;
  recipeData?: any;
  targetLanguage?: string;
  prompt?: string;
  text?: string;
  image?: string;
  images?: string[];
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "llama-3.1-8b-instant";
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

function mapGroqModel(model?: string): string {
  if (!model) {
    return DEFAULT_MODEL;
  }
  const normalized = model.toLowerCase();
  if (normalized === "llama" || normalized === "default") {
    return DEFAULT_MODEL;
  }
  return model;
}

function normalizeSectionTitle(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

function ensureSectionsOnIngredients(source: any[], translated: any[]): any[] {
  if (!Array.isArray(translated)) return [];
  const sourceSections = Array.isArray(source)
    ? source.map(src => normalizeSectionTitle(src?.sectionTitle))
    : [];
  return translated.map((ing, index) => {
    const base = ing && typeof ing === 'object' ? { ...ing } : { item: typeof ing === 'string' ? ing : '' };
    const translatedSection = normalizeSectionTitle(base.sectionTitle || (base as any).section_title);
    const sourceSection = sourceSections[index] || '';
    const finalSection = translatedSection || sourceSection;
    if (finalSection) {
      base.sectionTitle = finalSection;
    } else if (base.sectionTitle) {
      base.sectionTitle = normalizeSectionTitle(base.sectionTitle);
    }
    if ('section_title' in base) {
      delete (base as any).section_title;
    }
    return base;
  });
}

function buildTranslationPrompt(recipeData: any, targetLanguageName: string, targetLanguageCode?: string): string {
  const title = recipeData?.title || '';
  const description = recipeData?.description || '';
  const servings = recipeData?.servings || '';
  const ingredients = Array.isArray(recipeData?.ingredients) ? recipeData.ingredients : [];
  const steps = Array.isArray(recipeData?.steps) ? recipeData.steps : [];

  const hasSections = ingredients.some((ing: any) => (ing?.sectionTitle || '').toString().trim().length > 0);

  const ingredientGroups = new Map<string, any[]>();
  ingredients.forEach((ing: any) => {
    const section = (ing?.sectionTitle || '').toString().trim();
    const key = section || '';
    if (!ingredientGroups.has(key)) {
      ingredientGroups.set(key, []);
    }
    ingredientGroups.get(key)?.push(ing);
  });

  const ingredientLines = Array.from(ingredientGroups.entries())
    .map(([sectionTitle, list]) => {
      const header = sectionTitle ? `Section: ${sectionTitle}` : '';
      const body = list
        .map((ing: any) => {
          const item = ing?.item || ing?.name || '';
          const quantity = ing?.quantity || ing?.amount || '';
          const unit = ing?.unit || '';
          const price = ing?.price || '';
          return `- ${item} | quantity: ${quantity} | unit: ${unit} | price: ${price}`;
        })
        .join('\n');
      return header ? `${header}\n${body}` : body;
    })
    .join('\n');

  const stepLines = steps
    .map((step: any, index: number) => {
      const text = typeof step === 'string' ? step : step?.instruction || step?.step || '';
      return `${index + 1}. ${text}`;
    })
    .join('\n');

  return `You are a professional culinary translator. Translate the following recipe into ${targetLanguageName} language (language code: ${targetLanguageCode || 'ja'}). 

CRITICAL INSTRUCTIONS:
1. All output text must be in ${targetLanguageName}, not in the original language or any other language
2. Return ONLY a valid JSON object - no explanations, no markdown, no code blocks
3. Use the exact JSON schema provided below
4. Do not wrap the JSON in backticks or any other formatting
${hasSections ? '\n5. Preserve the original ingredient sections. Include the "sectionTitle" field for every ingredient, using the same section titles provided in the source data.' : ''}

JSON Schema (return exactly this structure):
{
  "title": "translated title in ${targetLanguageName}",
  "description": "translated description in ${targetLanguageName}", 
  "servings": "translated servings in ${targetLanguageName}",
  "ingredients": [{ "item": "ingredient name in ${targetLanguageName}", "quantity": "amount", "unit": "unit in ${targetLanguageName}", "sectionTitle": "section name (omit or leave empty if not provided)" }],
  "steps": ["step 1 in ${targetLanguageName}", "step 2 in ${targetLanguageName}"]
}

Original Recipe Data:
Title: ${title}
Servings: ${servings}
Description: ${description}

Ingredients:
${ingredientLines}

Steps:
${stepLines}

IMPORTANT: Your response must be ONLY the JSON object starting with { and ending with }. No other text allowed.`;
}

function extractJsonFromContent(content: string): string {
  const fencedMatch = content.match(/```json[\s\S]*?```/i);
  if (fencedMatch) {
    return fencedMatch[0].replace(/```json|```/gi, '').trim();
  }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }
  return content.trim();
}

function parseTranslationResponse(result: any, languageCode?: string, languageName?: string): any {
  const content = result?.choices?.[0]?.message?.content || '';
  const jsonText = extractJsonFromContent(content);
  if (!jsonText) {
    throw new Error('翻訳結果のJSONが空です');
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (languageCode && !parsed.language_code) {
      parsed.language_code = languageCode;
    }
    if (languageName && !parsed.language_name) {
      parsed.language_name = languageName;
    }
    return parsed;
  } catch (error) {
    console.error('❌ 翻訳JSON解析エラー:', error, jsonText);
    throw new Error(`翻訳結果の解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildMessagesFromPayload(payload: RequestPayload): any[] {
  if (payload.messages && payload.messages.length > 0) {
    return payload.messages;
  }

  // textパラメータもpromptパラメータも受け入れる
  const prompt = payload.prompt?.trim() || payload.text?.trim();

  if (payload.image || payload.images) {
    // 画像解析の場合
    const content: any[] = [];

    if (prompt) {
      content.push({
        type: "text",
        text: prompt,
      });
    }

    if (payload.image) {
      // base64データのクリーンアップ
      const cleanBase64 = payload.image.replace(/^data:image\/[a-z]+;base64,/, '');
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${cleanBase64}`,
        },
      });
    }

    if (payload.images && payload.images.length > 0) {
      payload.images.forEach(imageBase64 => {
        // base64データのクリーンアップ
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${cleanBase64}`,
          },
        });
      });
    }

    return [
      {
        role: "user",
        content: content,
      },
    ];
  } else if (prompt) {
    // テキストのみの場合
    return [
      {
        role: "user",
        content: prompt,
      },
    ];
  }

  throw new Error("有効なプロンプトが提供されていません");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    console.log("📝 受信したリクエストボディ:", JSON.stringify(requestBody, null, 2));

    // APIキーをまず確認
    const apiKey = Deno.env.get("GROQ_API_KEY");
    console.log("🔑 API Key exists:", !!apiKey, apiKey ? "first 10 chars: " + apiKey.substring(0, 10) : "NO KEY");

    if (!apiKey) {
      console.error("❌ GROQ_API_KEY is not set in environment variables");
      return new Response(
        JSON.stringify({
          success: false,
          error: "GROQ_API_KEY is not configured in Supabase environment variables",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // bodyオブジェクト内のパラメータを取得
    const body: RequestPayload = requestBody.body || requestBody;
    console.log("📝 処理するボディ:", JSON.stringify(body, null, 2));

    const isRecipeTranslation = body.mode === 'recipe_translation';
    let messages: any[] = [];

    if (isRecipeTranslation) {
      const targetLanguageCode = body.targetLanguage || 'ja';
      const targetLanguageName = body.targetLanguageName || '日本語';
      const prompt = buildTranslationPrompt(body.recipeData || {}, targetLanguageName, targetLanguageCode);
      messages = [
        {
          role: 'system',
          content: `You are a professional culinary translator specializing in ${targetLanguageName} translation. Your task is to translate recipes into ${targetLanguageName} (language code: ${targetLanguageCode}). 

CRITICAL RULES:
1. Output ONLY valid JSON - no explanations, no markdown, no code blocks
2. ALL translated text must be in ${targetLanguageName}
3. Do not wrap JSON in backticks or any formatting
4. Start response with { and end with }
5. Follow the exact JSON schema provided in the user prompt`
        },
        {
          role: 'user',
          content: prompt
        }
      ];
    } else {
      messages = buildMessagesFromPayload(body);
    }
    console.log("📝 生成されたメッセージ:", JSON.stringify(messages, null, 2));
    
    if (!messages.length) {
      throw new Error("送信内容が生成できませんでした");
    }

    const hasImages = body.image || (body.images && body.images.length > 0);
    const modelId = isRecipeTranslation
      ? mapGroqModel(body.model)
      : (body.model || (hasImages ? DEFAULT_VISION_MODEL : DEFAULT_MODEL));
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";

    console.log("🔍 Debug info:", {
      hasImages,
      modelId,
      messagesLength: messages.length,
      imageCount: body.images ? body.images.length : (body.image ? 1 : 0)
    });

    const requestPayload = {
      model: mapGroqModel(modelId),
      messages: messages,
      temperature: body.temperature || 0.7,
      max_tokens: body.maxTokens || 4096,
      top_p: body.topP || 1,
      presence_penalty: body.presencePenalty || 0,
      frequency_penalty: body.frequencyPenalty || 0,
    };

    console.log("🚀 Groq API呼び出し開始:", {
      model: modelId,
      messages: messages.length,
      endpoint: endpoint,
      payloadSize: JSON.stringify(requestPayload).length
    });

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });
      console.log("📡 HTTP Response received:", response.status, response.statusText);
    } catch (fetchError) {
      console.error("❌ Fetch failed:", fetchError);
      throw new Error(`Network error: ${fetchError.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Groq API error details:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        errorBody: errorText
      });
      throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    if (isRecipeTranslation) {
      const targetLanguageCode = body.targetLanguage || 'ja';
      const targetLanguageName = body.targetLanguageName || '日本語';
      
      try {
        const translation = parseTranslationResponse(result, targetLanguageCode, targetLanguageName);
        if (Array.isArray(translation?.ingredients)) {
          translation.ingredients = ensureSectionsOnIngredients(body.recipeData?.ingredients || [], translation.ingredients);
        }
        console.log('✅ Groq翻訳成功:', translation?.title);
        
        return new Response(
          JSON.stringify({
            success: true,
            content: JSON.stringify(translation), // JSON文字列として返す
            data: {
              ...translation,
              language_code: translation.language_code || targetLanguageCode,
              language_name: translation.language_name || targetLanguageName
            },
            raw: result
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } catch (parseError) {
        console.error('❌ 翻訳レスポンス解析エラー:', parseError);
        
        // フォールバック: 生のコンテンツを返す
        const rawContent = result?.choices?.[0]?.message?.content || '';
        console.log('📝 生のコンテンツを返します:', rawContent);
        
        return new Response(
          JSON.stringify({
            success: true,
            content: rawContent, // 生のコンテンツを返す
            raw: result,
            parseError: parseError.message
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const content = result?.choices?.[0]?.message?.content || "";
    console.log("✅ Groq API レスポンス取得成功:", content.substring(0, 100) + "...");

    return new Response(
      JSON.stringify({
        success: true,
        content,
        raw: result
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ call-groq-api error:", error);
    console.error("❌ Error details:", {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        timestamp: new Date().toISOString()
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
