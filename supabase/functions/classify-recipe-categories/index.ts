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

/** 案A 固定カテゴリー */
const RECIPE_CATEGORY_OPTIONS = [
  "料理",
  "煮込み料理",
  "温菜",
  "冷菜",
  "スープ",
  "テリーヌ",
  "ソース",
  "ドレッシング",
  "ソース・ドレッシング",
  "付け合わせ・飾り",
  "デザート・お菓子",
  "パン",
  "取り込み",
  "その他",
] as const;

type RecipeCategory = (typeof RECIPE_CATEGORY_OPTIONS)[number];

type RecipeRow = {
  id: number;
  title: string | null;
  description: string | null;
  course: string | null;
  category: string | null;
  servings: string | null;
  tags: string[] | null;
  ingredients: unknown;
  steps: unknown;
};

type RequestBody = {
  limit?: number;
  onlyMissing?: boolean;
  overwrite?: boolean;
  /** true: 既存カテゴリーと同じでも AI 判定結果で必ず上書き */
  forceRewrite?: boolean;
  dryRun?: boolean;
  afterId?: number;
};

type ClassificationResult = {
  id: number;
  category: string;
  reason?: string;
};

const CATEGORY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          category: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "category"],
      },
    },
  },
  required: ["results"],
};

const normalizeKey = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const extractJsonFromText = (raw: string) => {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
};

const normalizeTags = (raw: string[] | null): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t || "").trim()).filter(Boolean);
};

const normalizeRecipeCategory = (
  rawCategory: unknown,
  recipe: { tags?: string[] | null },
): RecipeCategory => {
  const tags = normalizeTags(recipe.tags ?? null);
  if (tags.some((tag) => /^(パン|bread)$/i.test(tag))) return "パン";

  const trimmed = String(rawCategory ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    if (tags.some((tag) => /url取り込み|pdf取り込み|取り込み/i.test(tag))) return "取り込み";
    return "料理";
  }

  if ((RECIPE_CATEGORY_OPTIONS as readonly string[]).includes(trimmed)) {
    return trimmed as RecipeCategory;
  }

  const aliasMap: Record<string, RecipeCategory> = {
    "url取り込み": "取り込み",
    "pdf取り込み": "取り込み",
    飾り: "付け合わせ・飾り",
    付け合わせ: "付け合わせ・飾り",
    お菓子: "デザート・お菓子",
    デザート: "デザート・お菓子",
    terrine: "テリーヌ",
    テリーヌ: "テリーヌ",
    パテ: "テリーヌ",
    soup: "スープ",
    スープ: "スープ",
    dressing: "ドレッシング",
    ドレッシング: "ドレッシング",
    vinaigrette: "ドレッシング",
    ヴィネグレット: "ドレッシング",
    煮込み: "煮込み料理",
    煮込み料理: "煮込み料理",
    温菜: "温菜",
    冷菜: "冷菜",
  };
  const alias = aliasMap[normalizeKey(trimmed)];
  if (alias) return alias;

  const lower = trimmed.toLowerCase();
  if (/煮込み|煮込|stew|braise|ラグー|ragout|ポトフ|カレー|curry/.test(lower)) {
    return "煮込み料理";
  }
  if (/温菜|温製|温かい/.test(lower)) return "温菜";
  if (/冷菜|冷製|冷たい|冷やし|冷皿/.test(lower)) return "冷菜";
  if (/スープ|soup|ポタージュ|potage|ビスク|bisque|コンソメ|consomme|ブイヨン|bouillon|汁物/.test(lower)) {
    return "スープ";
  }
  if (/テリーヌ|terrine|パテ|リエット|コンフィ/.test(lower)) return "テリーヌ";
  if (/ソース・ドレッシング|ソース＆ドレッシング|ソース&ドレッシング/.test(trimmed)) {
    return "ソース・ドレッシング";
  }
  if (/ドレッシング|dressing|ヴィネグレット|マヨネーズ/.test(lower)) {
    if (/ソース|sauce/.test(lower)) return "ソース・ドレッシング";
    return "ドレッシング";
  }
  if (/ソース|sauce/.test(lower)) return "ソース";
  if (/飾り|付け合わせ|ガーニッシュ|garnish/.test(lower)) return "付け合わせ・飾り";
  if (/デザート|お菓子|dessert|スイーツ|製菓/.test(lower)) return "デザート・お菓子";
  if (/^パン|bread/.test(lower)) return "パン";
  if (/url取り込み|pdf取り込み/.test(lower)) return "取り込み";

  return "その他";
};

const coerceCategory = (value: unknown, recipe: RecipeRow): RecipeCategory => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if ((RECIPE_CATEGORY_OPTIONS as readonly string[]).includes(text)) {
    return text as RecipeCategory;
  }
  return normalizeRecipeCategory(text || recipe.category, recipe);
};

const ingredientNames = (raw: unknown, max = 14): string[] => {
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
  description: String(row.description || "").slice(0, 200),
  course: String(row.course || "").slice(0, 40),
  currentCategory: String(row.category || "").slice(0, 60),
  servings: String(row.servings || "").slice(0, 40),
  tags: normalizeTags(row.tags).slice(0, 8),
  ingredients: ingredientNames(row.ingredients),
  steps: stepTexts(row.steps),
});

const buildPrompt = (items: ReturnType<typeof buildCompactRecipe>[]) => `
あなたはレストランのレシピ管理の専門家です。
各レシピの内容（タイトル・材料・工程・現在のカテゴリー等）を読み、次の固定カテゴリーから最も適切なものを1つ選んでください。

【選べるカテゴリー（この15つのみ・表記は完全一致）】
- 料理 … 前菜・主菜など通常の加熱調理メニュー（煮込み・温冷菜・スープ・ソース等の単体は除く）
- 煮込み料理 … 煮込み・ストゥ・ブラゼ・ラグー・ポトフ・煮物・カレー系など長時間煮る料理
- 温菜 … 温かい前菜・温製の一品（スープ・煮込み・メイン以外の温かい皿）
- 冷菜 … 冷製・冷やし・サラダ系の一品（ドレッシング単体は除く）
- スープ … スープ・ポタージュ・ビスク・コンソメ・ブイヨン・汁物
- テリーヌ … テリーヌ・パテ・リエット・コンフィ・ゼリー寄せなど型抜き・ムース系
- ソース … ソース単体・煮汁・グラス・ルー等（ドレッシングではないもの）
- ドレッシング … ドレッシング単体・ヴィネグレット・マヨネーズ系（ソースではないもの）
- ソース・ドレッシング … ソースとドレッシングの両方の性質があるもの
- 付け合わせ・飾り … ガーニッシュ・付け合わせ・盛り付け用
- デザート・お菓子 … デザート・スイーツ・製菓
- パン … パン・ブレッド・ベーカリー
- 取り込み … URL/PDF等から取り込んだレシピ（材料・工程が取り込み中心の場合）
- その他 … 上記に当てはまらない場合のみ

【ルール】
- category は上記15つのいずれかをそのまま出力（余計な説明や別表記は不可）
- currentCategory（既存入力）は参考のみ。タイトル・材料・工程から独立して再判定すること
- 既存カテゴリーが正しそうに見えても、内容から別カテゴリーが適切なら必ず変更してよい
- パン・ブレッド系は「パン」
- 煮込み・煮物・カレー系は「煮込み料理」。温かい前菜系は「温菜」。冷製・冷やし系は「冷菜」
- スープ・汁物は「スープ」（メインの「料理」ではない）
- テリーヌ・パテ・リエット等の型料理は「テリーヌ」（甘いムース・デザート系は「デザート・お菓子」）
- ドレッシング単体は必ず「ドレッシング」。ソース単体は「ソース」。両方の性質のみ「ソース・ドレッシング」
- reason は25文字以内の短い根拠

【出力】
有効なJSONのみ:
{"results":[{"id":123,"category":"料理","reason":"魚の主菜"}]}

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
          responseSchema: CATEGORY_RESPONSE_SCHEMA,
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
  const onlyMissing = body.onlyMissing === true;
  const overwrite = body.overwrite !== false;
  const forceRewrite = body.forceRewrite !== false;
  const dryRun = body.dryRun === true;
  const afterId = Number(body.afterId) || 0;

  let query = auth.client
    .from("recipes")
    .select("id,title,description,course,category,servings,tags,ingredients,steps")
    .order("id", { ascending: true })
    .gt("id", afterId)
    .limit(limit);

  if (onlyMissing) {
    query = query.or('category.is.null,category.eq.""');
  }

  const { data: rows, error: fetchError } = await query;
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates = (rows || []) as RecipeRow[];

  if (candidates.length === 0) {
    return new Response(JSON.stringify({
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      hasMore: false,
      nextAfterId: afterId,
      results: [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiLogger = new APILogger("gemini", "classify-recipe-categories", "gemini-3.1-flash-lite");
  const allResults: Array<ClassificationResult & {
    previousCategory?: string;
    saved?: boolean;
    skipped?: boolean;
    error?: string;
  }> = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += GEMINI_BATCH_SIZE) {
    const chunk = candidates.slice(i, i + GEMINI_BATCH_SIZE);
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
          category: String(row.category || ""),
          reason: String(row.reason || "").slice(0, 80),
        });
      }

      for (const recipe of chunk) {
        const previousCategory = String(recipe.category ?? "").trim();
        const hit = byId.get(recipe.id);
        if (!hit) {
          failed += 1;
          allResults.push({
            id: recipe.id,
            category: "",
            previousCategory,
            error: "分類結果なし",
          });
          continue;
        }

        const nextCategory = coerceCategory(hit.category, recipe);
        const unchanged = nextCategory === previousCategory;
        if (unchanged && !forceRewrite) {
          skipped += 1;
          allResults.push({
            id: recipe.id,
            category: nextCategory,
            previousCategory,
            reason: hit.reason,
            skipped: true,
          });
          continue;
        }

        if (!dryRun) {
          const { error: updateError } = await auth.client
            .from("recipes")
            .update({ category: nextCategory })
            .eq("id", recipe.id);

          if (updateError) {
            failed += 1;
            allResults.push({
              ...hit,
              category: nextCategory,
              previousCategory,
              saved: false,
              error: updateError.message,
            });
            continue;
          }
        }

        updated += 1;
        allResults.push({
          ...hit,
          category: nextCategory,
          previousCategory,
          saved: !dryRun,
          skipped: unchanged && forceRewrite ? false : undefined,
          unchanged: unchanged || undefined,
        });
      }
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      for (const recipe of chunk) {
        failed += 1;
        allResults.push({
          id: recipe.id,
          category: "",
          previousCategory: String(recipe.category ?? ""),
          error: message,
        });
      }
    }
  }

  const lastFetchedId = candidates[candidates.length - 1]?.id ?? afterId;
  const hasMore = candidates.length >= limit;

  return new Response(JSON.stringify({
    processed: candidates.length,
    updated,
    skipped,
    failed,
    dryRun,
    hasMore,
    nextAfterId: lastFetchedId,
    results: allResults,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
