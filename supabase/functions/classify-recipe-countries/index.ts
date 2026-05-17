import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveRecipeClassifyClient } from "../_shared/recipe-classify-auth.ts";
import { buildGeminiGenerateContentEndpointCandidates } from "../_shared/gemini-model.ts";
import { APILogger } from "../_shared/api-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
};

const DEFAULT_LIMIT = 12;
const GEMINI_BATCH_SIZE = 8;

type RecipeRow = {
  id: number;
  title: string | null;
  description: string | null;
  course: string | null;
  category: string | null;
  servings: string | null;
  country: string | null;
  ingredients: unknown;
  steps: unknown;
};

type RequestBody = {
  limit?: number;
  onlyMissing?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
  afterId?: number;
};

type ClassificationResult = {
  id: number;
  country: string;
  reason?: string;
};

const COUNTRY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          country: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "country"],
      },
    },
  },
  required: ["results"],
};

const extractJsonFromText = (raw: string) => {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
};

const normalizeCountry = (value: unknown) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/^不明|unknown|n\/a|なし$/i.test(text)) return "不明";
  return text.slice(0, 80);
};

const ingredientNames = (raw: unknown, max = 12): string[] => {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (names.length >= max) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row._meta) continue;
    const name = String(row.name || row.item || "").trim();
    if (name) names.push(name);
  }
  return names;
};

const stepTexts = (raw: unknown, max = 4): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t.slice(0, 120));
    } else if (item && typeof item === "object") {
      const t = String((item as Record<string, unknown>).text || "").trim();
      if (t) out.push(t.slice(0, 120));
    }
  }
  return out;
};

const buildCompactRecipe = (row: RecipeRow) => ({
  id: row.id,
  title: String(row.title || "").slice(0, 120),
  course: String(row.course || "").slice(0, 40),
  category: String(row.category || "").slice(0, 40),
  servings: String(row.servings || "").slice(0, 40),
  ingredients: ingredientNames(row.ingredients),
  steps: stepTexts(row.steps),
});

const buildPrompt = (items: ReturnType<typeof buildCompactRecipe>[]) => `
あなたは料理のジャンル分類の専門家です。
以下のレシピ一覧について、料理の主な由来・系統を表す「国」を日本語の国名で1つずつ推定してください。

【ルール】
- country は日本語の国名のみ（例: 日本, イタリア, フランス, 中国, メキシコ, タイ, インド, アメリカ）
- 和食・日本料理 → 日本
- パスタ・ピザ・リゾット等のイタリア系 → イタリア
- 融合料理は最も影響の大きい国を1つ
- 判断不能な場合のみ country を「不明」
- reason は20文字以内の短い根拠

【出力】
有効なJSONのみ:
{"results":[{"id":123,"country":"日本","reason":"和食の前菜"}]}

【レシピ一覧】
${JSON.stringify(items)}
`;

async function callGeminiClassify(items: ReturnType<typeof buildCompactRecipe>[]) {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY / GOOGLE_API_KEY が未設定です");

  const candidates = buildGeminiGenerateContentEndpointCandidates("v1beta");
  const prompt = buildPrompt(items);
  let lastError = "Gemini request failed";

  for (const candidate of candidates) {
    const url = `${candidate.url}?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: COUNTRY_RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      lastError = await response.text();
      continue;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(extractJsonFromText(text));
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    return {
      model: candidate.model,
      results: results as ClassificationResult[],
      usage: data?.usageMetadata || null,
    };
  }

  throw new Error(lastError);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = await resolveRecipeClassifyClient(req, supabaseUrl, supabaseAnonKey, serviceRoleKey);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), 30);
  const onlyMissing = body.onlyMissing !== false;
  const overwrite = body.overwrite === true;
  const dryRun = body.dryRun === true;
  const afterId = Number(body.afterId) || 0;

  let query = auth.client
    .from("recipes")
    .select("id,title,description,course,category,servings,country,ingredients,steps")
    .order("id", { ascending: true })
    .gt("id", afterId)
    .limit(limit);

  if (onlyMissing && !overwrite) {
    query = query.or('country.is.null,country.eq.""');
  }

  const { data: rows, error: fetchError } = await query;
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipes = (rows || []) as RecipeRow[];
  if (recipes.length === 0) {
    return new Response(JSON.stringify({
      processed: 0,
      updated: 0,
      failed: 0,
      hasMore: false,
      nextAfterId: afterId,
      results: [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiLogger = new APILogger("gemini", "classify-recipe-countries", "gemini-3.1-flash-lite");
  const allResults: Array<ClassificationResult & { saved?: boolean; error?: string }> = [];
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < recipes.length; i += GEMINI_BATCH_SIZE) {
    const chunk = recipes.slice(i, i + GEMINI_BATCH_SIZE);
    const compact = chunk.map(buildCompactRecipe);

    try {
      const { model, results } = await callGeminiClassify(compact);
      apiLogger.setModel(model);

      const byId = new Map<number, ClassificationResult>();
      for (const row of results) {
        const id = Number(row.id);
        if (!Number.isFinite(id)) continue;
        byId.set(id, {
          id,
          country: normalizeCountry(row.country),
          reason: String(row.reason || "").slice(0, 80),
        });
      }

      for (const recipe of chunk) {
        const hit = byId.get(recipe.id);
        if (!hit || !hit.country) {
          failed += 1;
          allResults.push({ id: recipe.id, country: "", reason: "", error: "分類結果なし" });
          continue;
        }

        if (!dryRun) {
          const { error: updateError } = await auth.client
            .from("recipes")
            .update({ country: hit.country })
            .eq("id", recipe.id);

          if (updateError) {
            failed += 1;
            allResults.push({ ...hit, saved: false, error: updateError.message });
            continue;
          }
        }

        updated += 1;
        allResults.push({ ...hit, saved: !dryRun });
      }
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      for (const recipe of chunk) {
        failed += 1;
        allResults.push({ id: recipe.id, country: "", error: message });
      }
    }
  }

  const lastId = recipes[recipes.length - 1]?.id ?? afterId;
  const hasMore = recipes.length >= limit;

  return new Response(JSON.stringify({
    processed: recipes.length,
    updated,
    failed,
    dryRun,
    hasMore,
    nextAfterId: lastId,
    results: allResults,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
