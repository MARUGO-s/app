import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
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

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 4;
const MAX_REQUEST_BYTES = MAX_BASE64_CHARS + 64 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 30_000;

const mimeToExtension = new Map<string, string>([
  ["audio/flac", "flac"],
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/m4a", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/ogg", "ogg"],
  ["application/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "webm"],
  ["video/webm", "webm"],
  ["video/mp4", "mp4"],
]);

const allowedExtensions = new Set([
  "flac",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "ogg",
  "wav",
  "webm",
]);

type TranscriptionRequest = {
  audioBase64?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  language?: unknown;
  promptContext?: unknown;
};

type GroqTranscriptionResult = {
  text?: unknown;
  duration?: unknown;
  segments?: Array<{ end?: unknown }>;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeFileName(value: unknown, extension: string): string {
  const leaf = String(value || "audio")
    .split(/[\\/]/)
    .pop()
    ?.slice(0, 120) || "audio";
  let safeName = leaf.replace(/[^a-zA-Z0-9._-]/g, "_");
  const currentExtension = safeName.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.has(currentExtension)) {
    safeName = `${safeName.replace(/\.+$/, "")}.${extension}`;
  }
  return safeName;
}

function decodeAudioBase64(value: unknown): Uint8Array {
  const raw = String(value || "").trim();
  const base64 = raw.replace(/^data:[^;,]+;base64,/i, "");

  if (!base64 || base64.length > MAX_BASE64_CHARS) {
    throw new RangeError("Audio payload is empty or too large");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new TypeError("Audio payload is not valid base64");
  }

  const binary = atob(base64);
  if (binary.length === 0 || binary.length > MAX_AUDIO_BYTES) {
    throw new RangeError("Audio payload is empty or too large");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
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
    await enforceApiRateLimit(userId, "transcribe", {
      maxRequests: 60,
      windowMinutes: 60,
    });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: "利用制限を確認できません。" }, 503);
  }

  let body: TranscriptionRequest;
  try {
    body = await readJsonBodyLimited<TranscriptionRequest>(
      req,
      MAX_REQUEST_BYTES,
    );
  } catch (error) {
    if (error instanceof HttpRequestError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: "リクエストを読み取れませんでした。" }, 400);
  }

  const normalizedMimeType = String(body.mimeType || "audio/webm")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const extension = mimeToExtension.get(normalizedMimeType);
  if (!extension) {
    return jsonResponse({ error: "対応していない音声形式です。" }, 400);
  }

  const language = String(body.language || "ja").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(language)) {
    return jsonResponse({ error: "言語指定が不正です。" }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeAudioBase64(body.audioBase64);
  } catch (error) {
    const message = error instanceof RangeError
      ? "音声データが空か、サイズ上限を超えています。"
      : "音声データの形式が不正です。";
    return jsonResponse({ error: message }, 400);
  }

  const finalFileName = normalizeFileName(body.fileName, extension);
  const file = new File([bytes.buffer as ArrayBuffer], finalFileName, {
    type: normalizedMimeType,
  });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", language);

  const ingredientPrompt =
    "レシピの材料名。玉ねぎ、にんじん、トマト、鶏肉、豚肉、醤油、塩、こしょう、砂糖、小麦粉、牛乳、バター、卵、大根、白菜、キャベツ、じゃがいも、オリーブオイル。";
  const defaultPrompt =
    "必ず日本語で出力してください。英語やローマ字は使わず、すべてカタカナか漢字で表記します。トマト、玉ねぎ、醤油、塩、コショウ、グラム。";
  formData.append(
    "prompt",
    body.promptContext === "ingredient" ? ingredientPrompt : defaultPrompt,
  );
  formData.append("response_format", "verbose_json");

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    console.error("Transcription configuration is missing");
    return jsonResponse({ error: "音声認識を利用できません。" }, 500);
  }

  console.log(`Transcribing audio (${bytes.length} bytes) with Groq`);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TRANSCRIPTION_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqApiKey}` },
        body: formData,
        signal: controller.signal,
      },
    );
  } catch (error) {
    const timedOut = error instanceof DOMException &&
      error.name === "AbortError";
    console.error(
      "Groq transcription request failed",
      timedOut ? "timeout" : error,
    );
    return jsonResponse(
      {
        error: timedOut
          ? "音声認識がタイムアウトしました。"
          : "音声認識に失敗しました。",
      },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startedAt;
  if (!response.ok) {
    const upstreamError = (await response.text()).slice(0, 1000);
    console.error(
      "Groq transcription API error",
      response.status,
      upstreamError,
    );
    return jsonResponse(
      { error: "音声認識サービスでエラーが発生しました。" },
      502,
    );
  }

  let result: GroqTranscriptionResult;
  try {
    result = await response.json() as GroqTranscriptionResult;
  } catch (error) {
    console.error("Groq transcription response parse failed", error);
    return jsonResponse({ error: "音声認識結果を読み取れませんでした。" }, 502);
  }

  const text = typeof result.text === "string" ? result.text : "";
  const directDuration = Number(result.duration);
  const segmentDuration = Number(result.segments?.at(-1)?.end);
  const audioDurationSec =
    Number.isFinite(directDuration) && directDuration >= 0
      ? directDuration
      : Number.isFinite(segmentDuration) && segmentDuration >= 0
      ? segmentDuration
      : 0;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (supabaseUrl && serviceRoleKey) {
      const ratePerSecondJpy = 0.0046;
      const estimatedCost = audioDurationSec * ratePerSecondJpy;
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      await supabaseAdmin.from("api_usage_logs").insert({
        api_name: "groq",
        endpoint: "voice-input-v3",
        model_name: "whisper-large-v3-turbo",
        user_id: userId,
        duration_ms: durationMs,
        estimated_cost_jpy: estimatedCost,
        metadata: {
          audio_duration_sec: audioDurationSec,
          input_bytes: bytes.length,
          prompt_used: true,
          billing_type: "audio_duration",
          billing_breakdown: {
            billing_unit: "audio_second",
            model: "whisper-large-v3-turbo",
            audio_duration_sec: audioDurationSec,
            rate_per_second_jpy: ratePerSecondJpy,
            total_cost_jpy: Math.round(estimatedCost * 1_000_000) / 1_000_000,
          },
        },
        status: "success",
      });
    }
  } catch (logError) {
    console.error("Failed to log transcription usage", logError);
  }

  return jsonResponse({ success: true, text });
});
