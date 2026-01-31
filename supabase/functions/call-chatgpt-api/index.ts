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

const DEFAULT_MODEL = "gpt-3.5-turbo";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestPayload = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY が設定されていません");
    }

    const messages = buildMessagesFromPayload(body);
    if (!messages.length) {
      throw new Error("送信内容が生成できませんでした");
    }

    const modelId = body.model || DEFAULT_MODEL;
    const endpoint = "https://api.openai.com/v1/chat/completions";

    // レシピ解析用のプロンプトを追加
    if (body.mode === "recipe_extraction" && body.text) {
      // フロントエンドから送られてきた詳細なプロンプトをそのまま使用
      messages = [{
        role: "user",
        content: body.text
      }];
      console.log("✅ レシピ解析用プロンプト構築完了:", {
        messageCount: messages.length,
        promptLength: body.text.length
      });
    }

    console.log("🚀 ChatGPT API呼び出し開始:", { model: modelId, messages: messages.length });

    const requestPayload = {
      model: modelId,
      messages: messages,
      temperature: body.temperature || 0.1,
      max_tokens: body.maxTokens || 4000, // より長い応答を許可
      top_p: body.topP || 1,
      presence_penalty: body.presencePenalty || 0,
      frequency_penalty: body.frequencyPenalty || 0,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ ChatGPT API error:", response.status, response.statusText, errorText);
      throw new Error(`ChatGPT API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || "";

    console.log("✅ ChatGPT API レスポンス取得成功:", content.substring(0, 100) + "...");

    // contentをJSONとして解析してrecipeDataとして返す
    let recipeData;
    try {
      recipeData = JSON.parse(content);
    } catch (parseError) {
      console.log("⚠️ JSON解析失敗、生のコンテンツを返します:", parseError.message);
      recipeData = {
        title: "解析エラー",
        description: "ChatGPT APIからの応答を解析できませんでした",
        servings: "1",
        ingredients: [],
        steps: [],
        notes: content
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
    console.error("❌ call-chatgpt-api error:", error);

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
})

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

async function analyzeRecipeWithChatGPT(text: string, url?: string): Promise<any> {
  try {
    // OpenAI APIキーを環境変数から取得
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // URLに基づいてプロンプトを調整
    let prompt = '';
    
    if (url && url.includes('toptrading.co.jp')) {
      // Top Trading サイト専用のプロンプト
      prompt = `
以下のテキストはTop Tradingのレシピページから抽出されたものです。フランス料理のレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url}

テキスト:
${text}

以下の形式でJSONを返してください:
{
  "title": "料理名（日本語）",
  "originalTitle": "料理名（フランス語、もしあれば）",
  "description": "レシピの説明やコツ",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {
      "item": "材料名（日本語）",
      "originalItem": "材料名（フランス語、もしあれば）",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    {
      "step": "手順の説明（日本語）"
    }
  ],
  "notes": "メモやコツ（もしあれば）"
}

注意事項：
- 材料の分量で「大さじ」「小さじ」がある場合は、以下のように変換してください：
  - 大さじ1 = 15ml または 15g
  - 小さじ1 = 5ml または 5g
- 液体の場合はml、固体の場合はgを使用してください
- フランス語の材料名や料理名があれば、originalItemやoriginalTitleに記載してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
`;
    } else {
      // 一般的なレシピ用のプロンプト
      prompt = `
以下のテキストからレシピ情報を抽出してください。JSON形式で返してください。

URL: ${url || '不明'}

テキスト:
${text}

以下の形式でJSONを返してください:
{
  "title": "料理名（日本語）",
  "originalTitle": "料理名（原語、もしあれば）",
  "description": "レシピの説明やコツ",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {
      "item": "材料名",
      "quantity": "分量",
      "unit": "単位"
    }
  ],
  "steps": [
    {
      "step": "手順の説明"
    }
  ],
  "notes": "メモやコツ（もしあれば）"
}

注意事項：
- 材料の分量で「大さじ」「小さじ」がある場合は、以下のように変換してください：
  - 大さじ1 = 15ml または 15g
  - 小さじ1 = 5ml または 5g
- 液体の場合はml、固体の場合はgを使用してください
- 手順は分かりやすい日本語に翻訳してください
- 必ず有効なJSON形式で返してください
- コメントや説明は含めず、JSONのみを返してください
`;
    }

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "あなたはレシピ解析の専門家です。与えられたテキストからレシピ情報を正確に抽出し、指定されたJSON形式で返してください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    }

    // OpenAI APIを呼び出し
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    // レスポンスからテキストを抽出
    const content = result.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI APIからレスポンスが取得できませんでした')
    }

    // JSONを解析
    try {
      const recipeData = JSON.parse(content)
      console.log('✅ ChatGPT API解析成功:', recipeData)
      return recipeData
    } catch (parseError) {
      console.error('❌ JSON解析エラー:', parseError)
      console.error('レスポンス内容:', content)
      
      // JSON解析に失敗した場合のフォールバック
      return {
        title: 'レシピ',
        description: 'レシピの解析に失敗しました',
        servings: '1',
        ingredients: [],
        steps: [],
        notes: 'ChatGPT APIからの応答を解析できませんでした'
      }
    }

  } catch (error) {
    console.error('❌ ChatGPT API呼び出しエラー:', error)
    throw new Error(`ChatGPT API呼び出しに失敗しました: ${error.message}`)
  }
}
