import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
import {
  ApiRateLimitError,
  enforceApiRateLimit,
} from "../_shared/api-rate-limit.ts";
import {
  HttpRequestError,
  readJsonBodyLimited,
} from "../_shared/http-security.ts";
import {
  bytesToBase64,
  formatPublicUrlForLog,
  PublicUrlError,
  readResponseBytesLimited,
  safeFetchPublicUrl,
} from "../_shared/public-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-user-jwt, x-client-info, apikey, content-type",
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Allow": "POST, OPTIONS",
      },
    });
  }

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
  } catch {
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
    await enforceApiRateLimit(userId, "fetch-image", {
      maxRequests: 120,
      windowMinutes: 10,
    });
  } catch (error) {
    const status = error instanceof ApiRateLimitError ? error.status : 503;
    return new Response(
      JSON.stringify({
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
    const { imageUrl } = await readJsonBodyLimited<{ imageUrl?: unknown }>(
      req,
      MAX_REQUEST_BYTES,
    );

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "画像URLが必要です" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { response, finalUrl } = await safeFetchPublicUrl(imageUrl, {
      timeoutMs: 30_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RecipeKeeper/1.0)",
        "Accept":
          "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8",
      },
    });
    console.log("画像を取得:", formatPublicUrlForLog(finalUrl));

    if (!response.ok) {
      throw new PublicUrlError(
        "画像の取得に失敗しました。",
        502,
        "upstream_http_error",
      );
    }

    const mimeType = (response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
      throw new PublicUrlError(
        "対応していない画像形式です。",
        415,
        "unsupported_image_type",
      );
    }

    const imageBytes = await readResponseBytesLimited(
      response,
      MAX_IMAGE_BYTES,
    );
    const base64 = bytesToBase64(imageBytes);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return new Response(
      JSON.stringify({
        success: true,
        dataUrl: dataUrl,
        mimeType: mimeType,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const isPublicUrlError = error instanceof PublicUrlError;
    const isRequestError = error instanceof HttpRequestError;
    const message = isPublicUrlError || isRequestError
      ? error.message
      : "画像の取得中にエラーが発生しました";
    console.error(
      "画像取得エラー:",
      isPublicUrlError
        ? error.code
        : (error instanceof Error ? error.name : "unknown"),
    );
    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: isPublicUrlError || isRequestError ? error.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
