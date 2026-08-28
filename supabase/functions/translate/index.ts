import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
import {
  HttpRequestError,
  readJsonBodyLimited,
} from "../_shared/http-security.ts";
import {
  ApiRateLimitError,
  enforceApiRateLimit,
} from "../_shared/api-rate-limit.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-user-jwt, x-client-info, apikey, content-type",
};

const MAX_TRANSLATION_BYTES = 120_000;
const MAX_TEXT_ITEMS = 500;
const TRANSLATION_TIMEOUT_MS = 30_000;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

console.log("DeepL Translation Function Initialized");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getAuthToken(req);
  if (!token) {
    return jsonResponse(
      { error: "認証が必要です。再ログインしてください。" },
      401,
    );
  }
  let userId = "";
  try {
    const payload = await verifySupabaseJWT(token);
    userId = String(payload.sub || "");
  } catch {
    return jsonResponse(
      { error: "トークンが無効または期限切れです。再ログインしてください。" },
      401,
    );
  }

  try {
    await enforceApiRateLimit(userId, "translate", {
      maxRequests: 60,
      windowMinutes: 10,
    });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: "利用制限を確認できません。" }, 503);
  }

  let body: { text?: unknown; target_lang?: unknown };
  try {
    body = await readJsonBodyLimited<{
      text?: unknown;
      target_lang?: unknown;
    }>(req, MAX_TRANSLATION_BYTES + 10_000);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: "リクエストを読み取れませんでした。" }, 400);
  }

  const text = Array.isArray(body.text)
    ? body.text.filter((item): item is string => typeof item === "string")
    : typeof body.text === "string"
    ? [body.text]
    : [];
  const targetLanguage = String(body.target_lang || "").trim().toUpperCase();

  if (
    text.length === 0 ||
    text.length > MAX_TEXT_ITEMS ||
    !text.some((item) => item.trim().length > 0)
  ) {
    return jsonResponse({ error: "翻訳テキストが不正です。" }, 400);
  }
  if (!/^[A-Z]{2,3}(?:-[A-Z]{2})?$/.test(targetLanguage)) {
    return jsonResponse({ error: "翻訳先言語が不正です。" }, 400);
  }

  const requestPayload = { text, target_lang: targetLanguage };
  if (
    new TextEncoder().encode(JSON.stringify(requestPayload)).length >
      MAX_TRANSLATION_BYTES
  ) {
    return jsonResponse(
      { error: "翻訳テキストがサイズ上限を超えています。" },
      413,
    );
  }

  const apiKey = Deno.env.get("DEEPL_API_KEY");
  if (!apiKey) {
    console.error("DeepL configuration is missing");
    return jsonResponse({ error: "翻訳機能を利用できません。" }, 500);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TRANSLATION_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException &&
      error.name === "AbortError";
    console.error("DeepL request failed", timedOut ? "timeout" : error);
    return jsonResponse(
      {
        error: timedOut
          ? "翻訳がタイムアウトしました。"
          : "翻訳サービスに接続できませんでした。",
      },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const upstreamError = (await response.text()).slice(0, 1000);
    console.error("DeepL API error", response.status, upstreamError);
    return jsonResponse({ error: "翻訳サービスでエラーが発生しました。" }, 502);
  }

  try {
    const data = await response.json();
    return jsonResponse(data);
  } catch (error) {
    console.error("DeepL response parse failed", error);
    return jsonResponse({ error: "翻訳結果を読み取れませんでした。" }, 502);
  }
});
