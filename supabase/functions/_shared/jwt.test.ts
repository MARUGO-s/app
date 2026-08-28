import { isServiceRoleBearer } from "./jwt.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("service role requires an exact server-side key match", () => {
  const serviceRoleKey = "server-only-service-role-key";

  assert(isServiceRoleBearer(serviceRoleKey, serviceRoleKey));
  assert(!isServiceRoleBearer(`${serviceRoleKey}-forged`, serviceRoleKey));
  assert(!isServiceRoleBearer(serviceRoleKey, undefined));
});

Deno.test("unsigned service_role claims are never trusted", () => {
  const forgedHeader = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const forgedPayload = btoa(JSON.stringify({ role: "service_role" }));
  const forgedToken = `${forgedHeader}.${forgedPayload}.`;

  assert(!isServiceRoleBearer(forgedToken, "real-service-role-key"));
});
