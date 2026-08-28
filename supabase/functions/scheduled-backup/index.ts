import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getAuthToken,
  isServiceRoleBearer,
  verifySupabaseJWT,
} from "../_shared/jwt.ts";
import {
  ApiRateLimitError,
  enforceApiRateLimit,
} from "../_shared/api-rate-limit.ts";
import {
  HttpRequestError,
  readOptionalJsonBodyLimited,
} from "../_shared/http-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_REQUEST_BYTES = 8 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const token = getAuthToken(req);
  if (!token) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "認証が必要です。再ログインしてください。",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const isCronInvocation = isServiceRoleBearer(token, serviceRoleKey);
  let callerId: string | null = null;

  if (!isCronInvocation) {
    try {
      const jwtPayload = await verifySupabaseJWT(token) as Record<
        string,
        unknown
      >;
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      callerId = String(jwtPayload.sub || "");
      if (!callerId) {
        return new Response(
          JSON.stringify({ ok: false, error: "認証情報が不正です。" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const { data: callerProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", callerId)
        .single();
      if (profileErr || callerProfile?.role !== "admin") {
        return new Response(
          JSON.stringify({ ok: false, error: "管理者権限が必要です。" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "トークンが無効または期限切れです。再ログインしてください。",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  if (callerId) {
    try {
      await enforceApiRateLimit(callerId, "scheduled-backup", {
        maxRequests: 10,
        windowMinutes: 60,
      });
    } catch (error) {
      const status = error instanceof ApiRateLimitError ? error.status : 503;
      return new Response(
        JSON.stringify({
          ok: false,
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
  }

  try {
    // サービスロールキーでクライアントを作成（RLSをバイパス）
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // リクエストボディ: { user_id?: string } が指定されれば特定ユーザーのみ、なければ全ユーザー
    const body = await readOptionalJsonBodyLimited<{ user_id?: unknown }>(
      req,
      MAX_REQUEST_BYTES,
      {},
    );
    const targetUserId = body.user_id == null || body.user_id === ""
      ? null
      : String(body.user_id);
    if (targetUserId && !UUID_PATTERN.test(targetUserId)) {
      throw new HttpRequestError("user_id の形式が不正です。", 400);
    }

    console.log(
      "[scheduled-backup] target mode:",
      targetUserId ? "single" : "all",
    );

    // バックアップ対象ユーザーを取得
    let users: { id: string; display_id: string | null }[] = [];

    if (targetUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_id")
        .eq("id", targetUserId)
        .single();
      if (profile) {
        users = [profile];
      } else {
        users = [{ id: targetUserId, display_id: null }];
      }
    } else {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_id");

      if (profilesError) {
        console.error(
          "[scheduled-backup] profiles fetch error:",
          profilesError,
        );
        throw profilesError;
      }
      users = profiles || [];
      console.log("[scheduled-backup] total users:", users.length);
    }

    if (users.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "バックアップ対象ユーザーなし",
          results: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ユーザーごとにレシピをDBでフィルタして取得する。
    // 以前は全レシピを一括取得してメモリ上でフィルタしていたが、
    // レシピ数が多い場合にEdge Functionのメモリ上限を超える恐れがあるため、
    // ユーザーごとのクエリに変更。
    const results: {
      userId: string;
      success: boolean;
      recipeCount: number;
      error?: string;
    }[] = [];
    const label = targetUserId
      ? "手動バックアップ"
      : "自動バックアップ（定期）";

    for (const user of users) {
      try {
        // owner タグのパターン（UUID と displayId の両方）
        const ownerTags: string[] = [`owner:${user.id}`];
        if (user.display_id) ownerTags.push(`owner:${user.display_id}`);

        // DBレベルでこのユーザーのレシピだけを取得（配列の重複チェック）
        const { data: userRecipes, error: recipesError } = await supabase
          .from("recipes")
          .select("*")
          .overlaps("tags", ownerTags)
          .order("created_at", { ascending: false });

        if (recipesError) {
          console.error(
            `[scheduled-backup] recipes fetch error for user ${user.id}:`,
            recipesError,
          );
          throw recipesError;
        }

        console.log(
          `[scheduled-backup] user ${user.id} (${user.display_id}): ${
            userRecipes?.length ?? 0
          } recipes`,
        );

        // このユーザーのレシピに紐づく recipe_sources を取得
        const recipeIds = (userRecipes || []).map((r: { id: string }) => r.id);
        let sourceMap: Record<string, string[]> = {};

        if (recipeIds.length > 0) {
          const { data: sources, error: srcError } = await supabase
            .from("recipe_sources")
            .select("recipe_id, url")
            .in("recipe_id", recipeIds);

          if (srcError) {
            console.warn(
              `[scheduled-backup] recipe_sources fetch warning for user ${user.id}:`,
              srcError,
            );
          } else if (sources) {
            for (const s of sources) {
              if (!sourceMap[s.recipe_id]) sourceMap[s.recipe_id] = [];
              sourceMap[s.recipe_id].push(s.url);
            }
          }
        }

        const backupData = (userRecipes || []).map((r: { id: string }) => ({
          ...r,
          _sources: sourceMap[r.id] || [],
        }));

        // バックアップ保存（RPC呼び出し）
        const { error: saveError } = await supabase.rpc("admin_save_backup", {
          p_user_id: user.id,
          p_backup_data: backupData,
          p_recipe_count: backupData.length,
          p_label: label,
        });

        if (saveError) {
          console.error(
            `[scheduled-backup] save error for user ${user.id}:`,
            saveError,
          );
          throw saveError;
        }

        results.push({
          userId: user.id,
          success: true,
          recipeCount: backupData.length,
        });
      } catch (err) {
        console.error(
          `[scheduled-backup] Backup failed for user ${user.id}:`,
          err,
        );
        results.push({
          userId: user.id,
          success: false,
          recipeCount: 0,
          error: "バックアップに失敗しました。",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `[scheduled-backup] Done: ${successCount} success, ${failCount} fail`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        message: `バックアップ完了: ${successCount}件成功, ${failCount}件失敗`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    console.error("[scheduled-backup] Fatal error:", err);
    const isRequestError = err instanceof HttpRequestError;
    return new Response(
      JSON.stringify({
        ok: false,
        error: isRequestError
          ? err.message
          : "バックアップ処理に失敗しました。",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: isRequestError ? err.status : 500,
      },
    );
  }
});
