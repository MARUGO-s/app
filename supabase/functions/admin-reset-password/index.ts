import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpRequestError,
  readJsonBodyLimited,
} from "../_shared/http-security.ts";
import {
  ApiRateLimitError,
  enforceApiRateLimit,
} from "../_shared/api-rate-limit.ts";

// ALLOWED_ORIGIN env var restricts which frontend can call this admin endpoint.
// Set it to your deployed frontend URL (e.g. https://your-app.vercel.app).
// Falls back to '*' only when unset (local development).
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const buildCorsHeaders = (requestOrigin: string | null) => {
  const allow = ALLOWED_ORIGIN === "*"
    ? "*"
    : requestOrigin === ALLOWED_ORIGIN
    ? requestOrigin
    : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

type ResetBody = {
  userId?: string;
  newPassword?: string;
};

const MAX_REQUEST_BYTES = 16 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: buildCorsHeaders(req.headers.get("origin")),
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...buildCorsHeaders(req.headers.get("origin")),
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase env vars" }),
        {
          status: 500,
          headers: {
            ...buildCorsHeaders(req.headers.get("origin")),
            "Content-Type": "application/json",
          },
        },
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          ...buildCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      });
    }

    const body = await readJsonBodyLimited<ResetBody>(req, MAX_REQUEST_BYTES);
    const userId = (body.userId || "").trim();
    const newPassword = body.newPassword || "";

    if (!UUID_PATTERN.test(userId)) {
      return new Response(JSON.stringify({ error: "userId is invalid" }), {
        status: 400,
        headers: {
          ...buildCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      });
    }
    if (!newPassword || newPassword.length < 12 || newPassword.length > 128) {
      return new Response(
        JSON.stringify({
          error: "newPassword must be between 12 and 128 characters",
        }),
        {
          status: 400,
          headers: {
            ...buildCorsHeaders(req.headers.get("origin")),
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Client bound to the caller session (to identify who is calling)
    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAsUser.auth
      .getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          ...buildCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      });
    }

    // Admin check (profiles.role)
    const { data: me, error: meErr } = await supabaseAsUser
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (meErr || me?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: {
          ...buildCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      });
    }

    try {
      await enforceApiRateLimit(userData.user.id, "admin-reset-password", {
        maxRequests: 20,
        windowMinutes: 60,
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
          headers: {
            ...buildCorsHeaders(req.headers.get("origin")),
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Service-role client for admin auth operation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        password: newPassword,
      },
    );

    if (error) {
      console.error("admin-reset-password provider error:", {
        status: error.status,
        code: error.code,
      });
      return new Response(
        JSON.stringify({ error: "パスワードを更新できませんでした。" }),
        {
          status: 400,
          headers: {
            ...buildCorsHeaders(req.headers.get("origin")),
            "Content-Type": "application/json",
          },
        },
      );
    }

    const { error: auditError } = await supabaseAdmin
      .from("admin_audit_logs")
      .insert({
        admin_id: userData.user.id,
        action: "reset_password",
        target_id: userId,
        detail: { provider: "supabase_auth" },
      });
    if (auditError) {
      console.error("admin-reset-password audit error:", {
        code: auditError.code,
      });
    }

    return new Response(
      JSON.stringify({ success: true, user: { id: data.user?.id } }),
      {
        status: 200,
        headers: {
          ...buildCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (e) {
    console.error(
      "admin-reset-password error:",
      e instanceof Error ? e.message : "unknown error",
    );
    return new Response(
      JSON.stringify({
        error: e instanceof HttpRequestError
          ? e.message
          : "パスワード更新中にエラーが発生しました。",
      }),
      {
        status: e instanceof HttpRequestError ? e.status : 500,
        headers: {
          ...buildCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      },
    );
  }
});
