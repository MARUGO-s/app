/**
 * Supabase Auth JWT verification using JWKS (works with current JWT signing keys).
 * Use this when the Edge Function is deployed with verify_jwt=false so we enforce auth in-code.
 */
import * as jose from "jsr:@panva/jose@6";

const SUPABASE_JWT_ISSUER =
    Deno.env.get("SB_JWT_ISSUER") ?? Deno.env.get("SUPABASE_URL") + "/auth/v1";

const getJwksUrl = () =>
    new URL(Deno.env.get("SUPABASE_URL")! + "/auth/v1/.well-known/jwks.json");

let cachedJwks: jose.RemoteJWKSet | null = null;

function getJwtKeys(): jose.RemoteJWKSet {
    if (!cachedJwks) {
        cachedJwks = jose.createRemoteJWKSet(getJwksUrl());
    }
    return cachedJwks;
}

/** Get Bearer token from Authorization header or fallback X-User-JWT header */
export function getAuthToken(req: Request): string | null {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();

    const fallback = req.headers.get("x-user-jwt") || req.headers.get("X-User-JWT") || "";
    return fallback.trim() || null;
}

/**
 * Verify Supabase-issued JWT. Returns claims on success, throws on invalid/missing.
 */
export async function verifySupabaseJWT(token: string): Promise<jose.JWTPayload> {
    const keys = getJwtKeys();
    const { payload } = await jose.jwtVerify(token, keys, {
        issuer: SUPABASE_JWT_ISSUER,
    });
    return payload;
}
