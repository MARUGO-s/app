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

type OpenAIProxyRequest = {
  prompt?: string;
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseFormat?: { type: string } | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_OUTPUT_TOKENS = 8_000;

serve(async (req) => {
  console.log("call-openai-api function invoked");
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
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
        success: false,
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
        success: false,
        error: "トークンが無効または期限切れです。再ログインしてください。",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    await enforceApiRateLimit(userId, "call-openai-api", {
      maxRequests: 60,
      windowMinutes: 10,
    });
  } catch (error) {
    const status = error instanceof ApiRateLimitError ? error.status : 503;
    return new Response(
      JSON.stringify({
        success: false,
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
    const body = await readJsonBodyLimited<OpenAIProxyRequest>(
      req,
      MAX_REQUEST_BYTES,
    );
    if (body.messages && !Array.isArray(body.messages)) {
      throw new HttpRequestError("messages の形式が不正です。", 400);
    }
    if (body.messages && body.messages.length > 64) {
      throw new HttpRequestError("メッセージ件数が上限を超えています。", 413);
    }
    const {
      prompt,
      messages,
      model,
      temperature,
      maxTokens,
      topP,
      presencePenalty,
      frequencyPenalty,
      responseFormat,
    } = body;

    if (
      (!prompt || typeof prompt !== "string") &&
      (!messages || !Array.isArray(messages) || messages.length === 0)
    ) {
      throw new Error("有効なプロンプトまたはメッセージがありません");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ||
      Deno.env.get("chatgpt");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const payload: Record<string, unknown> = {
      model: Deno.env.get("OPENAI_CHAT_MODEL") || "gpt-4o-mini",
      messages: messages || [{ role: "user", content: prompt || "" }],
      temperature: typeof temperature === "number" ? temperature : 0.7,
      max_tokens: Math.min(
        Math.max(typeof maxTokens === "number" ? maxTokens : 4000, 1),
        MAX_OUTPUT_TOKENS,
      ),
    };

    if (typeof topP === "number") payload.top_p = topP;
    if (typeof presencePenalty === "number") {
      payload.presence_penalty = presencePenalty;
    }
    if (typeof frequencyPenalty === "number") {
      payload.frequency_penalty = frequencyPenalty;
    }
    if (responseFormat) payload.response_format = responseFormat;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await response.body?.cancel();
      console.error(
        "❌ OpenAI API error:",
        response.status,
        response.statusText,
      );
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();
    const messageContent: string | undefined = result?.choices?.[0]?.message
      ?.content;

    return new Response(
      JSON.stringify({
        success: true,
        content: messageContent ?? "",
        raw: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ call-openai-api error:", error);

    return new Response(
      JSON.stringify({
        success: false,
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
