import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RequestPayload = {
  prompt?: string;
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  text?: string;
  url?: string;
  mode?: string;
  siteLanguage?: string;
  isJapaneseSite?: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gemini-2.0-flash-exp";

function buildMessagesFromPayload(payload: RequestPayload): ChatMessage[] {
  if (payload.messages && payload.messages.length > 0) {
    return payload.messages;
  }

  const prompt = payload.prompt?.trim() || payload.text?.trim();
  if (prompt) {
    return [
      {
        role: "user",
        content: prompt,
      },
    ];
  }

  throw new Error("有効なプロンプトが提供されていません");
}

function buildRecipeExtractionPrompt(text: string, url?: string, siteLanguage?: string, isJapaneseSite?: boolean): string {
  return `
以下のテキストからレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url || '不明'}
サイト言語: ${siteLanguage || 'ja'}
日本語サイト: ${isJapaneseSite ? 'はい' : 'いいえ'}

テキスト:
${text}

【出力形式】
{
  "title": "元ページの料理名を原文のまま記載",
  "description": "説明文。無ければ空文字",
  "servings": "人数のみを数字で記載。なければ空文字",
  "ingredients": [
    {"item": "材料名（カッコ内の補足も含む）", "quantity": "換算後の数値、範囲、または空文字", "unit": "単位"}
  ],
  "steps": [
    {"step": "手順の原文そのまま"}
  ],
  "notes": "メモ。無ければ空文字",
  "image_url": "メイン画像URL。無ければ空文字"
}

【換算基準（必ず遵守）】
- 大さじ1 = 液体 15ml / 固形・粉末 15g
- 小さじ1 = 液体 5ml / 固形・粉末 5g
- 1カップ = 液体 200ml / 小麦粉など粉類 120g / 砂糖 200g
- 分数表記は換算後に小数へ（例: 大さじ1と1/2 → 液体なら 22.5ml）
- 小数は四捨五入せず計算値を保持（最大で小数第一位まで）

【重要】
- JSONのみを返し、解説や注釈は禁止
- すべてのフィールドを出力し、欠損データは空文字または空配列
- 手順や材料が見つからなくても新しい内容を作らず、該当配列を空のまま返す
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestPayload = await req.json();
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY が設定されていません");
    }

    let messages = buildMessagesFromPayload(body);
    if (!messages.length) {
      throw new Error("送信内容が生成できませんでした");
    }

    // レシピ解析用のプロンプトを追加
    if (body.mode === "recipe_extraction" && body.text) {
      const recipePrompt = buildRecipeExtractionPrompt(body.text, body.url, body.siteLanguage, body.isJapaneseSite);
      // Gemini APIではsystem roleがサポートされていないため、user roleで統合
      messages = [{
        role: "user",
        content: `あなたはレシピ解析の専門家です。与えられたテキストからレシピ情報を正確に抽出し、指定されたJSON形式で返してください。\n\n${recipePrompt}`
      }];
    }

    const modelId = body.model || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

    // Gemini API用のリクエスト形式に変換
    // Gemini APIはsystem roleをサポートしていないため、system roleをuser roleに統合
    const processedMessages = messages.map(msg => {
      if (msg.role === 'system') {
        return {
          role: 'user',
          content: msg.content
        };
      }
      return {
        role: msg.role === 'assistant' ? 'model' : msg.role,
        content: msg.content
      };
    });

    const geminiRequest = {
      contents: processedMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        temperature: body.temperature || 0.7,
        maxOutputTokens: body.maxTokens || 4096,
        topP: body.topP || 1,
      }
    };

    console.log("🚀 Gemini API呼び出し開始:", { model: modelId, messages: messages.length });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(geminiRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Gemini API error:", response.status, response.statusText, errorText);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    const content = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("✅ Gemini API レスポンス取得成功:", content.substring(0, 100) + "...");

    // contentをJSONとして解析してrecipeDataとして返す
    let recipeData;
    try {
      // ```jsonマークダウンを除去してJSONを抽出
      let jsonContent = content;
      
      // ```json...```の形式を除去
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      } else {
        // ```jsonがない場合は、最初の{から最後の}までを抽出
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          jsonContent = content.slice(firstBrace, lastBrace + 1).trim();
        }
      }
      
      recipeData = JSON.parse(jsonContent);
    } catch (parseError) {
      console.log("⚠️ JSON解析失敗、生のコンテンツを返します:", parseError.message);
      console.log("⚠️ 元のコンテンツ:", content.substring(0, 200) + "...");
      
      // より詳細なエラー情報を提供
      const errorDetails = {
        parseError: parseError.message,
        contentLength: content.length,
        contentPreview: content.substring(0, 500),
        hasJsonMarkdown: content.includes('```json'),
        hasJsonBraces: content.includes('{') && content.includes('}')
      };
      
      console.log("⚠️ エラー詳細:", errorDetails);
      
      recipeData = {
        title: "解析エラー",
        description: `Gemini APIからの応答を解析できませんでした: ${parseError.message}`,
        servings: "1",
        ingredients: [],
        steps: [],
        notes: content,
        errorDetails: errorDetails
      };
    }

    return new Response(
      JSON.stringify({
        ok: true,
        recipeData: recipeData,
        raw: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ call-gemini-api error:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
