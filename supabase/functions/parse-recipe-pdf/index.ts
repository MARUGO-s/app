import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts";
import { buildGeminiGenerateContentEndpointCandidates } from "../_shared/gemini-model.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
};

const stripDataUrlPrefix = (value: string) => {
  const s = String(value || "").trim();
  const m = s.match(/^data:[^;]+;base64,(.*)$/i);
  return (m ? m[1] : s).trim();
};

const extractBalancedJson = (text: string, openChar = "{", closeChar = "}") => {
  const start = text.indexOf(openChar);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === openChar) depth += 1;
    else if (c === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

const extractJsonFromText = (raw: string) => {
  const text = String(raw || "").trim();
  if (!text) return "";

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const balanced = extractBalancedJson(text);
  if (balanced) return balanced;

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1).trim();

  return text;
};

/** 途中で切れた JSON の末尾を閉じて再パースを試す */
const tryRepairTruncatedJson = (text: string) => {
  let s = String(text || "").trim();
  if (!s) return s;

  // 末尾の未完オブジェクト・カンマを除去
  s = s.replace(/,\s*$/u, "");
  s = s.replace(/,\s*"[^"]*"\s*:\s*("[^"]*)?$/u, "");
  s = s.replace(/,\s*\{[^{}]*$/u, "");

  const openBrace = (s.match(/\{/g) || []).length;
  const closeBrace = (s.match(/\}/g) || []).length;
  const openBracket = (s.match(/\[/g) || []).length;
  const closeBracket = (s.match(/\]/g) || []).length;

  if (closeBrace < openBrace) s += "}".repeat(openBrace - closeBrace);
  if (closeBracket < openBracket) s += "]".repeat(openBracket - closeBracket);

  return s;
};

/** 壊れた配列から個別レシピオブジェクトを救出 */
const salvageRecipeObjects = (text: string): unknown[] => {
  const source = String(text || "");
  const salvaged: unknown[] = [];
  const seen = new Set<string>();
  const marker = '"title"';
  let from = 0;

  while (from < source.length) {
    const idx = source.indexOf(marker, from);
    if (idx < 0) break;

    let start = idx;
    while (start > 0 && source[start] !== "{") start -= 1;
    if (source[start] !== "{") {
      from = idx + marker.length;
      continue;
    }

    const block = extractBalancedJson(source.slice(start));
    if (block) {
      try {
        const obj = JSON.parse(block);
        const title = String((obj as Record<string, unknown>)?.title || (obj as Record<string, unknown>)?.name || "").trim();
        if (title && !seen.has(title)) {
          seen.add(title);
          salvaged.push(obj);
        }
      } catch {
        // skip broken block
      }
    }

    from = idx + marker.length;
  }

  return salvaged;
};

const parseRecipesPayload = (raw: string): { recipes: unknown[]; partial: boolean } => {
  const jsonText = extractJsonFromText(raw);
  const attempts = [
    jsonText,
    tryRepairTruncatedJson(jsonText),
  ];

  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      const list = extractRawRecipes(parsed);
      if (list.length > 0) return { recipes: list, partial: false };
    } catch {
      // next attempt
    }
  }

  const salvaged = salvageRecipeObjects(raw);
  if (salvaged.length > 0) {
    return { recipes: salvaged, partial: true };
  }

  throw new Error(
    "AIの応答をJSONとして解釈できませんでした。PDFのページ数が多い場合は、章ごとに分けたPDFで再試行してください。",
  );
};

const extractRawRecipes = (parsed: unknown): unknown[] => {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.recipes)) return obj.recipes;
  if (obj.recipe) return [obj.recipe];
  return [];
};

const buildPrompt = (fileName: string) => `
あなたはプロの料理研究家・レシピ編集者です。
添付PDFから「料理レシピ」だけを抽出し、JSONで返してください。

【入力PDFファイル名】${fileName || "不明"}

【抽出対象】
- 各料理の名称（title）
- 材料（ingredients: name, quantity, unit）
- 作り方（steps: 文字列の配列）

【除外】
- 巻頭・序文・解説・コラム・目次・ページ番号
- レシピ以外の補足（相性の良いサラダ、Point 等）

【出力ルール（厳守）】
- 有効なJSONのみ。説明文は禁止。
- description は常に空文字 "" にする（トークン節約）
- group は使わず null にする
- 手順・材料名にダブルクォート " を含めない（「」を使う）
- 形式:
{"recipes":[{"title":"料理名","description":"","ingredients":[{"name":"材料","quantity":"","unit":""}],"steps":["手順1"]}]}
- PDF内のレシピを漏れなく抽出する
`;

const RECIPE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "string" },
                unit: { type: "string" },
                group: { type: "string", nullable: true },
              },
              required: ["name"],
            },
          },
          steps: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title", "ingredients", "steps"],
      },
    },
  },
  required: ["recipes"],
};

async function callGemini(prompt: string, pdfBase64: string) {
  const apiKey = Deno.env.get("GOOGLE_API_KEY") || "";
  if (!apiKey) throw new Error("GOOGLE_API_KEY が設定されていません");

  const candidates = buildGeminiGenerateContentEndpointCandidates("v1beta");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150_000);

  let res: Response | null = null;
  let lastError: { status: number; statusText: string; body: string; model: string } | null = null;
  try {
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const current = await fetch(candidate.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 65536,
            topP: 1,
            responseMimeType: "application/json",
            responseSchema: RECIPE_RESPONSE_SCHEMA,
          },
        }),
        signal: controller.signal,
      });

      if (current.ok) {
        res = current;
        break;
      }

      const body = await current.text();
      lastError = { status: current.status, statusText: current.statusText, body, model: candidate.model };

      const lowered = body.toLowerCase();
      const modelUnavailable = current.status === 404
        || (current.status === 400 && (lowered.includes("not found") || (lowered.includes("model") && lowered.includes("supported"))));
      const schemaUnsupported = current.status === 400
        && (lowered.includes("responsemimetype") || lowered.includes("responseschema") || lowered.includes("unknown name"));

      if (i < candidates.length - 1 && (modelUnavailable || schemaUnsupported)) {
        console.warn(`⚠️ Gemini request failed for ${candidate.model}, trying fallback`);
        continue;
      }
      throw new Error(`Gemini API error: ${current.status} ${body}`);
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error("Gemini API がタイムアウトしました。ページ数の少ないPDFで再試行してください。");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res) {
    const t = lastError ? `${lastError.status} ${lastError.statusText} ${lastError.body}` : "Unknown error";
    throw new Error(`Gemini API error: ${t}`);
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${t}`);
  }

  const j = await res.json();
  const candidate = j?.candidates?.[0];
  const finishReason = String(candidate?.finishReason || "");
  const text = candidate?.content?.parts?.[0]?.text || "";
  return { text, finishReason };
}

/** JSON schema 非対応モデル向けフォールバック */
async function callGeminiPlain(prompt: string, pdfBase64: string) {
  const apiKey = Deno.env.get("GOOGLE_API_KEY") || "";
  if (!apiKey) throw new Error("GOOGLE_API_KEY が設定されていません");

  const candidates = buildGeminiGenerateContentEndpointCandidates("v1beta");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150_000);

  for (const candidate of candidates) {
    const current = await fetch(candidate.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
          topP: 1,
        },
      }),
      signal: controller.signal,
    });

    if (current.ok) {
      clearTimeout(timeoutId);
      const j = await current.json();
      const candidateResp = j?.candidates?.[0];
      return {
        text: candidateResp?.content?.parts?.[0]?.text || "",
        finishReason: String(candidateResp?.finishReason || ""),
      };
    }
  }

  clearTimeout(timeoutId);
  throw new Error("Gemini API の呼び出しに失敗しました");
}

const normalizeIngredient = (ing: unknown) => {
  if (typeof ing === "string") {
    return { name: String(ing).trim(), quantity: "", unit: "", group: null };
  }
  if (!ing || typeof ing !== "object") {
    return { name: "", quantity: "", unit: "", group: null };
  }
  const row = ing as Record<string, unknown>;
  return {
    name: String(row.name || "").trim(),
    quantity: String(row.quantity ?? "").trim(),
    unit: String(row.unit || "").trim(),
    group: row.group ? String(row.group).trim() : null,
  };
};

const normalizeRecipe = (raw: unknown) => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title || row.name || "").trim();
  if (!title) return null;

  const ingredients = (Array.isArray(row.ingredients) ? row.ingredients : [])
    .map(normalizeIngredient)
    .filter((ing) => ing.name);

  const steps = (Array.isArray(row.steps) ? row.steps : [])
    .map((step) => {
      if (typeof step === "string") return step.trim();
      if (step && typeof step === "object") {
        const s = step as Record<string, unknown>;
        return String(s.text || s.name || "").trim();
      }
      return "";
    })
    .filter(Boolean);

  if (ingredients.length === 0 && steps.length === 0) return null;

  return {
    title,
    name: title,
    description: String(row.description || "").trim(),
    ingredients,
    steps,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = getAuthToken(req);
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "認証が必要です。再ログインしてください。" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      await verifySupabaseJWT(token);
    } catch (_e) {
      return new Response(JSON.stringify({ ok: false, error: "トークンが無効または期限切れです。再ログインしてください。" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const fileBase64 = stripDataUrlPrefix(String(body?.fileBase64 || body?.pdfBase64 || ""));
    const fileName = String(body?.fileName || "");

    if (!fileBase64) {
      throw new Error("fileBase64 が必要です");
    }

    const prompt = buildPrompt(fileName);
    let geminiText = "";
    let finishReason = "";

    try {
      const result = await callGemini(prompt, fileBase64);
      geminiText = result.text;
      finishReason = result.finishReason;
    } catch (schemaErr) {
      console.warn("Structured JSON mode failed, retrying plain:", schemaErr);
      const result = await callGeminiPlain(prompt, fileBase64);
      geminiText = result.text;
      finishReason = result.finishReason;
    }

    if (!geminiText.trim()) {
      throw new Error("PDFからテキストを取得できませんでした");
    }

    const { recipes: rawRecipes, partial: salvaged } = parseRecipesPayload(geminiText);
    const truncated = finishReason === "MAX_TOKENS";

    const recipes = rawRecipes
      .map(normalizeRecipe)
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (recipes.length === 0) {
      throw new Error("PDFからレシピを抽出できませんでした。別のPDFか、画像が鮮明なファイルで再試行してください。");
    }

    const partial = salvaged || truncated;
    const warning = partial
      ? "応答が長すぎたため、抽出できたレシピのみ表示しています。不足がある場合はPDFを分割して再試行してください。"
      : null;

    return new Response(
      JSON.stringify({ ok: true, recipes, count: recipes.length, partial, warning }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("parse-recipe-pdf error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
