import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getAuthToken, isServiceRoleBearer, verifySupabaseJWT } from "./jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
};

export type RecipeClassifyAuthResult =
  | { ok: false; response: Response }
  | { ok: true; mode: "service"; client: SupabaseClient }
  | { ok: true; mode: "user"; client: SupabaseClient };

export async function resolveRecipeClassifyClient(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  serviceRoleKey: string,
): Promise<RecipeClassifyAuthResult> {
  const token = getAuthToken(req);
  if (!token) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  if (isServiceRoleBearer(token, serviceRoleKey)) {
    return {
      ok: true,
      mode: "service",
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      }),
    };
  }

  try {
    await verifySupabaseJWT(token);
  } catch {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return {
    ok: true,
    mode: "user",
    client: createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    }),
  };
}
