import { createClient } from "jsr:@supabase/supabase-js@2";
import { type RateLimitConfig, RateLimiter } from "./rate-limiter.ts";

export class ApiRateLimitError extends Error {
  readonly status: 429 | 503;

  constructor(message: string, status: 429 | 503) {
    super(message);
    this.name = "ApiRateLimitError";
    this.status = status;
  }
}

export async function enforceApiRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!userId || !supabaseUrl || !serviceRoleKey) {
    throw new ApiRateLimitError(
      "利用制限を確認できません。しばらく待ってから再試行してください。",
      503,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const limiter = new RateLimiter(supabase, userId, endpoint, config, true);

  try {
    await limiter.check();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("レート制限を超えました")) {
      throw new ApiRateLimitError(message, 429);
    }
    throw new ApiRateLimitError(
      "利用制限を確認できません。しばらく待ってから再試行してください。",
      503,
    );
  }
}
