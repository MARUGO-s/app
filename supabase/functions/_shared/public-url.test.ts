import {
  assertPublicHttpUrl,
  bytesToBase64,
  type DnsResolver,
  type FetchLike,
  PublicUrlError,
  readResponseBytesLimited,
  safeFetchPublicUrl,
} from "./public-url.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function assertPublicUrlError(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(
      error instanceof PublicUrlError,
      `expected PublicUrlError, got ${String(error)}`,
    );
    assertEquals(error.code, expectedCode);
    return;
  }
  throw new Error(`expected PublicUrlError(${expectedCode})`);
}

const publicResolver: DnsResolver =
  async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];

Deno.test("accepts a normal public HTTPS URL and removes its fragment", async () => {
  const url = await assertPublicHttpUrl(
    "https://recipes.example.com/path?q=1#secret",
    publicResolver,
  );
  assertEquals(url.toString(), "https://recipes.example.com/path?q=1");
});

Deno.test("rejects unsupported schemes, credentials and non-standard ports", async () => {
  await assertPublicUrlError(
    () => assertPublicHttpUrl("file:///etc/passwd", publicResolver),
    "unsupported_scheme",
  );
  await assertPublicUrlError(
    () => assertPublicHttpUrl("https://user:pass@example.com/", publicResolver),
    "credentials_not_allowed",
  );
  await assertPublicUrlError(
    () => assertPublicHttpUrl("https://example.com:8443/", publicResolver),
    "port_not_allowed",
  );
});

Deno.test("rejects localhost and private IPv4 URL variants", async () => {
  for (
    const candidate of [
      "http://localhost/",
      "http://api.internal/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://10.1.2.3/",
      "http://169.254.169.254/latest/meta-data/",
      "http://192.168.1.20/",
    ]
  ) {
    await assertPublicUrlError(
      () => assertPublicHttpUrl(candidate, publicResolver),
      candidate.includes("localhost") || candidate.includes("internal")
        ? "private_hostname"
        : "private_address",
    );
  }
});

Deno.test("rejects private IPv6 and IPv4-mapped IPv6 targets", async () => {
  for (
    const candidate of [
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[64:ff9b::7f00:1]/",
    ]
  ) {
    await assertPublicUrlError(
      () => assertPublicHttpUrl(candidate, publicResolver),
      "private_address",
    );
  }
});

Deno.test("fails closed when DNS returns any private or invalid address", async () => {
  await assertPublicUrlError(
    () =>
      assertPublicHttpUrl(
        "https://example.com",
        async () => ["93.184.216.34", "10.0.0.5"],
      ),
    "private_address",
  );
  await assertPublicUrlError(
    () => assertPublicHttpUrl("https://example.com", async () => []),
    "dns_failed",
  );
  await assertPublicUrlError(
    () => assertPublicHttpUrl("https://example.com", async () => ["not-an-ip"]),
    "private_address",
  );
});

Deno.test("checks every redirect before issuing the next request", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    });
  };

  await assertPublicUrlError(
    () =>
      safeFetchPublicUrl("https://example.com/start", {
        resolver: publicResolver,
        fetchImpl,
      }),
    "private_address",
  );
  assertEquals(calls, 1);
});

Deno.test("follows a bounded public redirect and returns the final URL", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async (input) => {
    calls += 1;
    const url = new URL(String(input));
    if (url.pathname === "/start") {
      return new Response(null, {
        status: 301,
        headers: { location: "/recipe" },
      });
    }
    return new Response("ok", { status: 200 });
  };

  const result = await safeFetchPublicUrl("https://example.com/start", {
    resolver: publicResolver,
    fetchImpl,
  });
  assertEquals(calls, 2);
  assertEquals(result.finalUrl.toString(), "https://example.com/recipe");
  assertEquals(await result.response.text(), "ok");
});

Deno.test("enforces both declared and streamed response size limits", async () => {
  await assertPublicUrlError(
    () =>
      readResponseBytesLimited(
        new Response("tiny", { headers: { "content-length": "100" } }),
        10,
      ),
    "response_too_large",
  );

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    },
  });
  await assertPublicUrlError(
    () => readResponseBytesLimited(new Response(stream), 5),
    "response_too_large",
  );
});

Deno.test("base64 conversion works without spreading an unbounded buffer", () => {
  assertEquals(bytesToBase64(new TextEncoder().encode("recipe")), "cmVjaXBl");
});
