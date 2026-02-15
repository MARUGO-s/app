import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

const toFileExtension = (mimeType: string): string => {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("webm")) return "webm";
  return "webm";
};

const decodeBase64 = (value: string): Uint8Array => {
  const cleaned = String(value || "").trim();
  const base64 = cleaned.includes(",") ? cleaned.split(",").pop() || "" : cleaned;
  if (!base64) return new Uint8Array();

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: voiceFeatureEnabled, error: featureError } = await supabaseAsUser.rpc("get_feature_flag", {
      p_key: "voice_input_enabled",
    });

    if (featureError) {
      console.error("transcribe-avalon get_feature_flag error:", featureError);
      return new Response(JSON.stringify({ success: false, error: "Voice setting lookup failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (voiceFeatureEnabled !== true) {
      return new Response(JSON.stringify({ success: false, error: "Voice input is disabled by admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const audioBase64 = String(body?.audioBase64 || "").trim();
    const mimeType = String(body?.mimeType || "audio/webm").trim() || "audio/webm";
    const language = String(body?.language || "").trim();

    if (!audioBase64) {
      return new Response(JSON.stringify({ success: false, error: "audioBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBytes = decodeBase64(audioBase64);
    if (!audioBytes.length) {
      return new Response(JSON.stringify({ success: false, error: "Audio payload is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ success: false, error: "Audio file is too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const avalonApiKey =
      Deno.env.get("AVALON_API_KEY") ||
      Deno.env.get("AQUAVOICE_API_KEY") ||
      Deno.env.get("AVALON_KEY") ||
      "";

    if (!avalonApiKey) {
      throw new Error("AVALON_API_KEY not configured");
    }

    // NOTE: aquavoice.com public docs mention api.aqua.sh, but as of 2026-02-14
    // that host presents an invalid TLS certificate for the domain. Use the
    // working Aquavoice API host as the default.
    const avalonBaseUrl = (Deno.env.get("AVALON_BASE_URL") || "https://api.aquavoice.com/api/v1").replace(/\/$/, "");
    // The Aquavoice transcription API works without specifying a model.
    // (Some published docs mention "avalon-1", but it is not always accepted.)
    const avalonModel = String(Deno.env.get("AVALON_MODEL") || "").trim();

    const extension = toFileExtension(mimeType);
    const fileName = `voice-input.${extension}`;
    const file = new File([audioBytes], fileName, { type: mimeType });

    const formData = new FormData();
    if (avalonModel) formData.append("model", avalonModel);
    formData.append("file", file);
    if (language) formData.append("language", language);

    const response = await fetch(`${avalonBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${avalonApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Avalon API error:", response.status, detail);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Avalon API error: ${response.status}`,
          detail,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = await response.json();
    const text = String(result?.text || result?.transcript || "").trim();

    return new Response(JSON.stringify({ success: true, text, raw: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("transcribe-avalon error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
