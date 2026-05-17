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

/** 案A+B ハイブリッド固定コース */
const RECIPE_COURSE_OPTIONS = [
  "アミューズ",
  "前菜",
  "スープ",
  "魚料理",
  "肉料理",
  "デザート",
  "プティフール",
  "食パン",
  "仕込み",
  "軽食・デリ",
  "タパス・小皿",
  "その他",
] as const;

type RecipeCourse = (typeof RECIPE_COURSE_OPTIONS)[number];

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
  forceRewrite?: boolean;
  dryRun?: boolean;
  afterId?: number;
};

type ClassificationResult = {
  id: number;
  course: string;
  reason?: string;
};

const COURSE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          course: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "course"],
      },
    },
  },
  required: ["results"],
};

const CATEGORY_TO_COURSE_HINT: Record<string, RecipeCourse> = {
  ソース: "仕込み",
  ドレッシング: "仕込み",
  "ソース・ドレッシング": "仕込み",
  "付け合わせ・飾り": "仕込み",
  "デザート・お菓子": "デザート",
  パン: "食パン",
  スープ: "スープ",
  取り込み: "その他",
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

const normalizeRecipeCourse = (rawCourse: unknown, recipe: RecipeRow): RecipeCourse => {
  const category = String(recipe.category ?? "").replace(/\s+/g, " ").trim();
  const trimmed = String(rawCourse ?? "").replace(/\s+/g, " ").trim();

  if (trimmed && (RECIPE_COURSE_OPTIONS as readonly string[]).includes(trimmed)) {
    return trimmed as RecipeCourse;
  }

  const aliasMap: Record<string, RecipeCourse> = {
    dessert: "デザート",
    デザート: "デザート",
    お菓子: "デザート",
    パン: "食パン",
    ソース: "仕込み",
    ドレッシング: "仕込み",
    "ソース・ドレッシング": "仕込み",
    ランチデリ: "軽食・デリ",
    tapas: "タパス・小皿",
    タパス: "タパス・小皿",
    "hors-d'œuvre": "アミューズ",
    プティフル: "プティフール",
  };
  const alias = aliasMap[normalizeKey(trimmed)];
  if (alias) return alias;

  const lower = trimmed.toLowerCase();
  if (/アミューズ|amuse|hors/i.test(lower)) return "アミューズ";
  if (/前菜|starter/i.test(lower)) return "前菜";
  if (/スープ|soup|ポタージュ|コンソメ|ブイヨン/i.test(lower)) return "スープ";
  if (/魚|fish|seafood|サーモン/i.test(lower)) return "魚料理";
  if (/肉|meat|ビーフ|ポーク|鴨/i.test(lower)) return "肉料理";
  if (/プティフール|petit/i.test(lower)) return "プティフール";
  if (/デザート|dessert/i.test(lower)) return "デザート";
  if (/パン|bread/i.test(lower) && !/デザート/i.test(lower)) return "食パン";
  if (/仕込み|下準備|単品/i.test(lower)) return "仕込み";
  if (/ランチデリ|デリ|deli/i.test(lower)) return "軽食・デリ";
  if (/タパス|tapas/i.test(lower)) return "タパス・小皿";

  if (trimmed && CATEGORY_TO_COURSE_HINT[trimmed]) return CATEGORY_TO_COURSE_HINT[trimmed];
  if (category && CATEGORY_TO_COURSE_HINT[category]) return CATEGORY_TO_COURSE_HINT[category];

  return "その他";
};

const coerceCourse = (value: unknown, recipe: RecipeRow): RecipeCourse => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if ((RECIPE_COURSE_OPTIONS as readonly string[]).includes(text)) {
    return text as RecipeCourse;
  }
  return normalizeRecipeCourse(text || recipe.course, recipe);
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

const stepTexts = (raw: unknown, max = 3): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t.slice(0, 100));
    }
  }
  return out;
};

const buildCompactRecipe = (row: RecipeRow) => ({
  id: row.id,
  title: String(row.title || "").slice(0, 120),
  description: String(row.description || "").slice(0, 160),
  currentCourse: String(row.course || "").slice(0, 40),
  category: String(row.category || "").slice(0, 40),
  servings: String(row.servings || "").slice(0, 30),
  tags: normalizeTags(row.tags).slice(0, 6),
  ingredients: ingredientNames(row.ingredients),
  steps: stepTexts(row.steps),
});

const buildPrompt = (items: ReturnType<typeof buildCompactRecipe>[]) => `
あなたはレストランの献立・レシピ管理の専門家です。
各レシピについて「コース」（提供順・食事の位置）を次の12種類から1つ選んでください。
※ category（カテゴリー）はレシピの種類（ソース・パン等）であり、コースとは別です。コース欄に「ソース」「パン」等の種類名が入っていても誤りなので正しく振り直してください。

【選べるコース（この12つのみ・表記は完全一致）】
- アミューズ … 一口の最初の一品
- 前菜 … 前菜・スターター
- スープ … コースとして出すスープ（categoryがスープの場合も多い）
- 魚料理 … 魚・シーフードのメイン寄り
- 肉料理 … 肉のメイン寄り
- デザート … デザートコース
- プティフール … 食後の小さな甘味
- 食パン … 食事用パン・ブレッドコース
- 仕込み … ソース・ドレッシング・飾り等、献立に単独で載せない部品
- 軽食・デリ … ランチデリ・弁当・単品販売向け
- タパス・小皿 … タパス・つまみ・小皿料理
- その他 … 上記に当てはまらない場合

【カテゴリーからの目安】
- category が ソース/ドレッシング/ソース・ドレッシング/付け合わせ・飾り → 多くは「仕込み」
- category が デザート・お菓子 → 「デザート」または「プティフール」
- category が パン → 「食パン」
- category が 料理/テリーヌ → 内容から 前菜/魚料理/肉料理 等を判断

【ルール】
- course は上記12つのいずれかをそのまま出力
- currentCourse は参考。category と矛盾する場合は内容と category を優先
- reason は25文字以内

【出力】
{"results":[{"id":123,"course":"前菜","reason":"前菜のテリーヌ"}]}

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
          responseSchema: COURSE_RESPONSE_SCHEMA,
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
    query = query.or('course.is.null,course.eq.""');
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

  const apiLogger = new APILogger("gemini", "classify-recipe-courses", "gemini-3.1-flash-lite");
  const allResults: Array<ClassificationResult & {
    previousCourse?: string;
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
          course: String(row.course || ""),
          reason: String(row.reason || "").slice(0, 80),
        });
      }

      for (const recipe of chunk) {
        const previousCourse = String(recipe.course ?? "").trim();
        const hit = byId.get(recipe.id);
        if (!hit) {
          failed += 1;
          allResults.push({
            id: recipe.id,
            course: "",
            previousCourse,
            error: "分類結果なし",
          });
          continue;
        }

        const nextCourse = coerceCourse(hit.course, recipe);
        const unchanged = nextCourse === previousCourse;
        if (unchanged && !forceRewrite) {
          skipped += 1;
          allResults.push({
            id: recipe.id,
            course: nextCourse,
            previousCourse,
            reason: hit.reason,
            skipped: true,
          });
          continue;
        }

        if (!dryRun) {
          const { error: updateError } = await auth.client
            .from("recipes")
            .update({ course: nextCourse })
            .eq("id", recipe.id);

          if (updateError) {
            failed += 1;
            allResults.push({
              ...hit,
              course: nextCourse,
              previousCourse,
              saved: false,
              error: updateError.message,
            });
            continue;
          }
        }

        updated += 1;
        allResults.push({
          ...hit,
          course: nextCourse,
          previousCourse,
          saved: !dryRun,
        });
      }
    } catch (batchError) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      for (const recipe of chunk) {
        failed += 1;
        allResults.push({
          id: recipe.id,
          course: "",
          previousCourse: String(recipe.course ?? ""),
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
