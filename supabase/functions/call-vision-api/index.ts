import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
import { buildGeminiGenerateContentEndpointCandidates } from "../_shared/gemini-model.ts";
import {
  HttpRequestError,
  readJsonBodyLimited,
} from "../_shared/http-security.ts";
import {
  ApiRateLimitError,
  enforceApiRateLimit,
} from "../_shared/api-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_REQUEST_BYTES = 12 * 1024 * 1024;

const isGeminiModelUnavailable = (status: number, errorText: string) => {
  const body = String(errorText || "").toLowerCase();
  if (status === 404) return true;
  if (
    status === 400 &&
    (body.includes("not found") ||
      (body.includes("model") && body.includes("supported")))
  ) return true;
  return false;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const token = getAuthToken(req);
    if (!token) {
      return new Response(
        JSON.stringify({ error: "認証が必要です。再ログインしてください。" }),
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
    } catch (_e) {
      return new Response(
        JSON.stringify({
          error: "トークンが無効または期限切れです。再ログインしてください。",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    try {
      await enforceApiRateLimit(userId, "call-vision-api", {
        maxRequests: 60,
        windowMinutes: 60,
      });
    } catch (error) {
      if (error instanceof ApiRateLimitError) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: error.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "利用制限を確認できません。" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("📸 Vision API Function started");
    const requestBody = await readJsonBodyLimited<{ contents?: unknown }>(
      req,
      MAX_REQUEST_BYTES,
    );

    const { contents } = requestBody;

    if (!contents) {
      throw new Error("コンテンツが提供されていません");
    }

    const processedContents = Array.isArray(contents) ? contents : [contents];
    if (processedContents.length === 0 || processedContents.length > 8) {
      throw new HttpRequestError("画像件数が上限を超えています。", 413);
    }

    console.log("📸 Vision API リクエスト受信:", {
      contentsLength: processedContents.length,
      contentsType: typeof contents,
    });

    // Google API キー（環境変数から取得）
    // VISION_API_KEYを優先的に使用し、なければGOOGLE_API_KEYを使用
    const googleApiKey = Deno.env.get("VISION_API_KEY") ||
      Deno.env.get("GOOGLE_API_KEY");
    if (!googleApiKey) {
      throw new Error(
        "Google Vision API キーが設定されていません (VISION_API_KEY or GOOGLE_API_KEY)",
      );
    }

    console.log(
      "🔑 Using API key from:",
      Deno.env.get("VISION_API_KEY") ? "VISION_API_KEY" : "GOOGLE_API_KEY",
    );

    console.log("📸 処理済みコンテンツ:", {
      count: processedContents.length,
    });

    // Google Gemini Vision API を呼び出し（最安モデル→第二候補）
    const candidates = buildGeminiGenerateContentEndpointCandidates("v1");
    let result: any = null;
    let lastError: {
      status: number;
      statusText: string;
      errorText: string;
      model: string;
    } | null = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const endpoint = candidate.url;
      console.log("🔄 Calling Gemini API:", { model: candidate.model });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": googleApiKey,
        },
        body: JSON.stringify({
          contents: processedContents,
        }),
      });

      console.log(
        "📡 Gemini API Response status:",
        response.status,
        response.statusText,
        `model=${candidate.model}`,
      );

      if (!response.ok) {
        const errorData = await response.text();
        lastError = {
          status: response.status,
          statusText: response.statusText,
          errorText: errorData,
          model: candidate.model,
        };
        console.error("❌ Gemini API エラー詳細:", {
          model: candidate.model,
          status: response.status,
          statusText: response.statusText,
        });

        if (
          i < candidates.length - 1 &&
          isGeminiModelUnavailable(response.status, errorData)
        ) {
          console.warn(
            `⚠️ Primary model unavailable. Retry fallback model: ${
              candidates[i + 1].model
            }`,
          );
          continue;
        }

        throw new Error(
          `Gemini API エラー: ${response.status} ${response.statusText}`,
        );
      }

      result = await response.json();
      break;
    }

    if (!result) {
      const e = lastError;
      throw new Error(
        `Gemini API エラー: ${e?.status ?? 500} ${e?.statusText ?? "Unknown"}`,
      );
    }

    // Gemini API の応答をそのまま返す
    if (
      result.candidates && result.candidates[0] && result.candidates[0].content
    ) {
      const extractedText = result.candidates[0].content.parts[0].text || "";

      console.log("✅ Google Vision API テキスト抽出成功:", {
        length: extractedText.length,
      });

      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    throw new Error(
      "Google Vision API から有効なテキストを取得できませんでした",
    );
  } catch (error: unknown) {
    console.error("❌ Google Vision API エラー:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof HttpRequestError
          ? error.message
          : "画像解析中にエラーが発生しました。",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof HttpRequestError ? error.status : 500,
      },
    );
  }
});
