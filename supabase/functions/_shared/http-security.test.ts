import {
  assertContentLengthWithin,
  HttpRequestError,
  readJsonBodyLimited,
  readOptionalJsonBodyLimited,
} from "./http-security.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectHttpError(
  action: () => Promise<unknown> | unknown,
  status: number,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(error instanceof HttpRequestError);
    assert(error.status === status, `expected ${status}, got ${error.status}`);
    return;
  }
  throw new Error(`expected HttpRequestError(${status})`);
}

Deno.test("content-length over the limit is rejected", () => {
  const req = new Request("https://example.invalid", {
    method: "POST",
    headers: { "content-length": "101" },
  });
  return expectHttpError(() => assertContentLengthWithin(req, 100), 413);
});

Deno.test("actual JSON byte length is enforced", async () => {
  const req = new Request("https://example.invalid", {
    method: "POST",
    body: JSON.stringify({ value: "あ".repeat(20) }),
  });
  await expectHttpError(() => readJsonBodyLimited(req, 30), 413);
});

Deno.test("streamed bodies are stopped as soon as the byte limit is exceeded", async () => {
  let pulls = 0;
  const req = new Request("https://example.invalid", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("12345678"));
        if (pulls >= 10) controller.close();
      },
    }),
  });

  await expectHttpError(() => readJsonBodyLimited(req, 12), 413);
  assert(pulls < 10, "the reader should cancel before consuming the full body");
});

Deno.test("malformed JSON is rejected", async () => {
  const req = new Request("https://example.invalid", {
    method: "POST",
    body: "{not-json",
  });
  await expectHttpError(() => readJsonBodyLimited(req, 100), 400);
});

Deno.test("valid JSON within the limit is returned", async () => {
  const req = new Request("https://example.invalid", {
    method: "POST",
    body: JSON.stringify({ ok: true }),
  });
  const body = await readJsonBodyLimited<{ ok: boolean }>(req, 100);
  assert(body.ok === true);
});

Deno.test("optional JSON returns its fallback only for an empty body", async () => {
  const empty = new Request("https://example.invalid", { method: "POST" });
  const fallback = await readOptionalJsonBodyLimited(empty, 100, { ok: false });
  assert(fallback.ok === false);

  const malformed = new Request("https://example.invalid", {
    method: "POST",
    body: "not-json",
  });
  await expectHttpError(
    () => readOptionalJsonBodyLimited(malformed, 100, { ok: false }),
    400,
  );
});
