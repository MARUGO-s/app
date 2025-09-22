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
  contents?: Array<{ role?: string; parts: Array<{ text?: string }> }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gemini-1.5-flash";

type GenerativeContent = { role?: string; parts: Array<{ text: string }> };

type ConversionResult = {
  contents: GenerativeContent[];
  systemInstruction: string;
};

function convertMessagesToContents(messages: ChatMessage[] = []): ConversionResult {
  let systemInstruction = "";
  const contents: GenerativeContent[] = [];

  messages.forEach((msg) => {
    const text = msg.content ?? "";
    if (!text.trim()) return;

    if (msg.role === "system") {
      systemInstruction = systemInstruction
        ? `${systemInstruction}\n${text.trim()}`
        : text.trim();
      return;
    }

    const role = msg.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text }] });
  });

  return { contents, systemInstruction };
}

function buildContentsFromPayload(payload: RequestPayload): ConversionResult {
  if (payload.contents && payload.contents.length > 0) {
    return { contents: payload.contents, systemInstruction: "" };
  }

  if (payload.messages && payload.messages.length > 0) {
    return convertMessagesToContents(payload.messages);
  }

  const prompt = payload.prompt?.trim();
  if (prompt) {
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: "",
    };
  }

  throw new Error("有効なプロンプトが提供されていません");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestPayload = await req.json();
    const apiKey = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("VISION_API_KEY");
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY が設定されていません");
    }

    const { contents, systemInstruction } = buildContentsFromPayload(body);
    if (!contents.length) {
      throw new Error("送信内容が生成できませんでした");
    }

    const generationConfig: Record<string, unknown> = {};
    if (typeof body.temperature === "number") generationConfig.temperature = body.temperature;
    if (typeof body.topP === "number") generationConfig.topP = body.topP;
    if (typeof body.maxTokens === "number") generationConfig.maxOutputTokens = body.maxTokens;
    if (typeof body.presencePenalty === "number") generationConfig.presencePenalty = body.presencePenalty;
    if (typeof body.frequencyPenalty === "number") generationConfig.frequencyPenalty = body.frequencyPenalty;

    const requestPayload: Record<string, unknown> = { contents };
    if (systemInstruction) {
      requestPayload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }
    if (Object.keys(generationConfig).length > 0) {
      requestPayload.generationConfig = generationConfig;
    }

    const modelId = body.model && body.model.startsWith("gemini")
      ? body.model
      : DEFAULT_MODEL;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Generative Language API error:", response.status, response.statusText, errorText);
      throw new Error(`Generative Language API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    const candidate = result?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const content = parts
      .map((part: { text?: string }) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();

    return new Response(
      JSON.stringify({
        success: true,
        content,
        raw: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ call-groq-api (Generative Language) error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
