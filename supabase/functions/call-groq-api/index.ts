import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
import {
  HttpRequestError,
  readJsonBodyLimited,
} from "../_shared/http-security.ts";
import {
  ApiRateLimitError,
  enforceApiRateLimit,
} from "../_shared/api-rate-limit.ts";

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
  recipe?: any;
  targetLanguage?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const DEFAULT_MODEL = "openai/gpt-oss-120b"; // llama-3.3-70b-versatile は 2026-08-16 廃止のため移行
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_OUTPUT_TOKENS = 8_000;

function buildMessagesFromPayload(payload: RequestPayload): ChatMessage[] {
  if (payload.messages && payload.messages.length > 0) {
    return payload.messages;
  }

  // 翻訳モードの場合は特別な処理
  if (payload.mode === "recipe_translation") {
    // 翻訳用のプロンプトを構築
    const translationPrompt = buildTranslationPrompt(payload);
    return [
      {
        role: "system",
        content:
          "あなたは料理レシピの翻訳専門家です。与えられたレシピを指定された言語に翻訳し、JSON形式で返してください。",
      },
      {
        role: "user",
        content: translationPrompt,
      },
    ];
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

function buildTranslationPrompt(payload: RequestPayload): string {
  // 翻訳用のプロンプトを構築
  const recipe = payload.recipe;
  if (!recipe) {
    throw new Error("翻訳するレシピデータが提供されていません");
  }

  const targetLanguage = payload.targetLanguage || "ja";
  const languageNames: Record<string, string> = {
    "ja": "日本語",
    "en": "英語",
    "fr": "フランス語",
    "it": "イタリア語",
    "de": "ドイツ語",
    "es": "スペイン語",
    "ko": "韓国語",
    "zh": "中国語",
  };

  const targetLangName = languageNames[targetLanguage] || targetLanguage;

  return `以下のレシピを${targetLangName}に翻訳してください。

【翻訳対象レシピ】
タイトル: ${recipe.title || ""}
説明: ${recipe.description || ""}
人数: ${recipe.servings || ""}

材料:
${
    (recipe.ingredients || []).map((ing: any) =>
      `- ${ing.item || ing.name || ""} ${ing.quantity || ""} ${ing.unit || ""}`
    ).join("\n")
  }

手順:
${
    (recipe.steps || []).map((step: any, index: number) =>
      `${index + 1}. ${step.step || step.text || step.instruction || ""}`
    ).join("\n")
  }

メモ: ${recipe.notes || ""}

【翻訳形式】
以下のJSON形式で翻訳結果を返してください：

\`\`\`json
{
  "title": "翻訳されたタイトル",
  "description": "翻訳された説明",
  "servings": "翻訳された人数",
  "ingredients": [
    {"item": "翻訳された材料名", "quantity": "分量", "unit": "単位"}
  ],
  "steps": [
    {"step": "翻訳された手順"}
  ],
  "notes": "翻訳されたメモ"
}
\`\`\`

【重要】
- 料理名は自然な翻訳にしてください
- 材料名は一般的な名称に翻訳してください
- 手順は調理方法を正確に翻訳してください
- 分量や単位は適切に変換してください
- レスポンスは必ず\`\`\`jsonで始まり\`\`\`で終わる形式で返してください`;
}

function buildRecipeExtractionPrompt(
  text: string,
  url?: string,
  siteLanguage?: string,
  isJapaneseSite?: boolean,
): string {
  // テキストを短縮（最初の3000文字のみ使用）
  const shortText = text.length > 3000 ? text.substring(0, 3000) + "..." : text;

  return `レシピを抽出してJSONで返してください。

テキスト: ${shortText}

出力形式:
{
  "title": "料理名",
  "description": "説明",
  "servings": "人数",
  "ingredients": [{"item": "材料名", "quantity": "分量", "unit": "単位"}],
  "steps": [{"step": "手順"}],
  "notes": "メモ"
}

必ず\`\`\`jsonで始まり\`\`\`で終わる形式で返してください。`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const token = getAuthToken(req);
  if (!token) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "認証が必要です。再ログインしてください。",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  let userId = "";
  try {
    const payload = await verifySupabaseJWT(token);
    userId = String(payload.sub || "");
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "トークンが無効または期限切れです。再ログインしてください。",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    await enforceApiRateLimit(userId, "call-groq-api", {
      maxRequests: 60,
      windowMinutes: 10,
    });
  } catch (error) {
    const status = error instanceof ApiRateLimitError ? error.status : 503;
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof ApiRateLimitError
          ? error.message
          : "利用制限を確認できません。",
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await readJsonBodyLimited<RequestPayload>(
      req,
      MAX_REQUEST_BYTES,
    );
    if (body.messages && !Array.isArray(body.messages)) {
      throw new HttpRequestError("messages の形式が不正です。", 400);
    }
    if (body.messages && body.messages.length > 64) {
      throw new HttpRequestError("メッセージ件数が上限を超えています。", 413);
    }
    console.log("📝 リクエストボディ詳細:", {
      bodyLength: JSON.stringify(body).length,
      hasText: !!body.text,
      hasRecipe: !!body.recipe,
      hasMessages: !!body.messages,
      hasPrompt: !!body.prompt,
      mode: body.mode,
      siteLanguage: body.siteLanguage,
      isJapaneseSite: body.isJapaneseSite,
    });

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      throw new Error("GROQ_API_KEY が設定されていません");
    }

    let messages = buildMessagesFromPayload(body);
    if (!messages.length) {
      throw new Error("送信内容が生成できませんでした");
    }

    const modelId = Deno.env.get("GROQ_CHAT_MODEL") || DEFAULT_MODEL;
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";

    // レシピ解析用のプロンプトを追加
    if (body.mode === "recipe_extraction" && body.text) {
      // フロントエンドから送られてきた詳細なプロンプトをそのまま使用
      messages = [
        {
          role: "user",
          content: body.text,
        },
      ];
      console.log("✅ レシピ解析用プロンプト構築完了:", {
        messageCount: messages.length,
        promptLength: body.text.length,
      });
    }

    console.log("🚀 Groq API呼び出し開始:", {
      model: modelId,
      messages: messages.length,
    });

    const requestPayload = {
      model: modelId,
      messages: messages,
      temperature: body.temperature || 0.1,
      max_tokens: Math.min(
        Math.max(Number(body.maxTokens) || 4000, 1),
        MAX_OUTPUT_TOKENS,
      ),
      top_p: body.topP || 1,
      presence_penalty: body.presencePenalty || 0,
      frequency_penalty: body.frequencyPenalty || 0,
    };

    console.log("🔧 Groq APIリクエストペイロード:", {
      model: requestPayload.model,
      messageCount: requestPayload.messages.length,
      maxTokens: requestPayload.max_tokens,
      payloadSize: JSON.stringify(requestPayload).length,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      await response.body?.cancel();
      console.error("❌ Groq API error:", response.status, response.statusText);

      // 認証エラーの場合
      if (response.status === 401) {
        console.error(
          "🔑 認証エラー: APIキーが無効または期限切れの可能性があります",
        );
        throw new Error(
          `Groq API 認証エラー: APIキーが無効または期限切れです。APIキーを確認してください。`,
        );
      }

      // レート制限エラーの場合は特別なメッセージを返す
      if (response.status === 429) {
        throw new Error(
          `Groq API レート制限に達しました。しばらく待ってから再試行してください。`,
        );
      }

      // ペイロードサイズエラーの場合
      if (response.status === 413) {
        throw new Error(
          `Groq API リクエストサイズが大きすぎます。より短いテキストで試してください。`,
        );
      }

      throw new Error(
        `Groq API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || "";

    console.log("✅ Groq API レスポンス取得成功:", {
      contentLength: content.length,
      hasChoices: !!result.choices,
      choiceCount: result.choices?.length || 0,
    });

    // contentをJSONとして解析してrecipeDataとして返す
    let recipeData;
    try {
      console.log("🔍 JSON解析開始:", {
        contentLength: content.length,
        hasJsonMarkdown: content.includes("```json"),
        hasJsonBraces: content.includes("{") && content.includes("}"),
      });

      // Groq APIは直接JSONを返す場合があるので、まず直接パースを試す
      try {
        recipeData = JSON.parse(content);
        console.log("✅ 直接JSON解析成功");
      } catch (directParseError) {
        console.log(
          "⚠️ 直接JSON解析失敗、マークダウン形式を処理:",
          getErrorMessage(directParseError),
        );

        // 直接パースに失敗した場合は、マークダウン形式を処理
        let jsonContent = content;

        // ```json...```の形式を除去
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim();
          console.log("✅ マークダウン形式からJSON抽出成功");
        } else {
          // ```jsonがない場合は、最初の{から最後の}までを抽出
          const firstBrace = content.indexOf("{");
          const lastBrace = content.lastIndexOf("}");
          if (firstBrace >= 0 && lastBrace > firstBrace) {
            jsonContent = content.slice(firstBrace, lastBrace + 1).trim();
            console.log("✅ ブレース形式からJSON抽出成功");
          }
        }

        recipeData = JSON.parse(jsonContent);
        console.log("✅ マークダウン形式JSON解析成功");
      }
    } catch (parseError) {
      const parseErrorMessage = getErrorMessage(parseError);
      console.log(
        "⚠️ JSON解析失敗、生のコンテンツを返します:",
        parseErrorMessage,
      );
      // より詳細なエラー情報を提供
      const errorDetails = {
        parseError: parseErrorMessage,
        contentLength: content.length,
        hasJsonMarkdown: content.includes("```json"),
        hasJsonBraces: content.includes("{") && content.includes("}"),
      };

      console.log("⚠️ エラー詳細:", errorDetails);

      recipeData = {
        title: "解析エラー",
        description:
          `Groq APIからの応答を解析できませんでした: ${parseErrorMessage}`,
        servings: "1",
        ingredients: [],
        steps: [],
        notes: content,
        errorDetails: errorDetails,
      };
    }

    console.log("✅ レスポンス構築完了:", {
      hasTitle: !!recipeData.title,
      hasIngredients: !!recipeData.ingredients,
      hasSteps: !!recipeData.steps,
      ingredientCount: recipeData.ingredients?.length || 0,
      stepCount: recipeData.steps?.length || 0,
    });

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
    console.error("❌ call-groq-api error:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof HttpRequestError
          ? error.message
          : "AI処理中にエラーが発生しました。",
      }),
      {
        status: error instanceof HttpRequestError ? error.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
