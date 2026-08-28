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
  formatPublicUrlForLog,
  PublicUrlError,
  readResponseTextLimited,
  safeFetchPublicUrl,
} from "../_shared/public-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-user-jwt, x-client-info, apikey, content-type",
};

const MAX_HTML_BYTES = 6 * 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Allow": "POST, OPTIONS",
        },
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
    await enforceApiRateLimit(userId, "fetch-url-content", {
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
    const { url } = await readJsonBodyLimited<{ url?: unknown }>(
      req,
      MAX_REQUEST_BYTES,
    );

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { response, finalUrl } = await safeFetchPublicUrl(url, {
      timeoutMs: 45_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    console.log("URLを取得:", formatPublicUrlForLog(finalUrl));

    if (!response.ok) {
      throw new PublicUrlError(
        "URLの取得先からエラーが返されました。",
        502,
        "upstream_http_error",
      );
    }

    const mimeType = (response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const allowedMimeTypes = new Set([
      "",
      "text/html",
      "application/xhtml+xml",
      "text/plain",
      "application/xml",
      "text/xml",
    ]);
    if (!allowedMimeTypes.has(mimeType)) {
      throw new PublicUrlError(
        "HTMLまたはテキスト以外のURLは取得できません。",
        415,
        "unsupported_content_type",
      );
    }

    const html = await readResponseTextLimited(response, MAX_HTML_BYTES);

    return new Response(
      JSON.stringify({
        success: true,
        html: html,
        contentLength: html.length,
        url: finalUrl.toString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const isPublicUrlError = error instanceof PublicUrlError;
    const isRequestError = error instanceof HttpRequestError;
    console.error(
      "Error fetching URL:",
      isPublicUrlError
        ? error.code
        : (error instanceof Error ? error.name : "unknown"),
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: isPublicUrlError || isRequestError
          ? error.message
          : "URLの取得中にエラーが発生しました。",
      }),
      {
        status: isPublicUrlError || isRequestError ? error.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
