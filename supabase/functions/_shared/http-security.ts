export class HttpRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
  }
}

export function assertContentLengthWithin(
  req: Request,
  maxBytes: number,
): void {
  const header = req.headers.get("content-length");
  if (!header) return;

  const declaredBytes = Number(header);
  if (
    Number.isFinite(declaredBytes) &&
    declaredBytes >= 0 &&
    declaredBytes > maxBytes
  ) {
    throw new HttpRequestError("リクエストサイズが上限を超えています。", 413);
  }
}

export async function readRequestBytesLimited(
  req: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }
  assertContentLengthWithin(req, maxBytes);
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        throw new HttpRequestError(
          "リクエストサイズが上限を超えています。",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bodyBytes;
}

async function readBodyTextWithin(
  req: Request,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder().decode(
    await readRequestBytesLimited(req, maxBytes),
  );
}

export async function readJsonBodyLimited<T>(
  req: Request,
  maxBytes: number,
): Promise<T> {
  const bodyText = await readBodyTextWithin(req, maxBytes);

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new HttpRequestError("リクエスト形式が不正です。", 400);
  }
}

export async function readOptionalJsonBodyLimited<T>(
  req: Request,
  maxBytes: number,
  fallback: T,
): Promise<T> {
  const bodyText = await readBodyTextWithin(req, maxBytes);
  if (!bodyText.trim()) return fallback;

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new HttpRequestError("リクエスト形式が不正です。", 400);
  }
}
