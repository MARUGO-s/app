/**
 * SSRF-safe helpers for fetching user-supplied public HTTP(S) URLs.
 *
 * Every hostname is resolved before the request and every redirect is checked
 * again. Private, loopback, link-local, documentation, multicast and other
 * special-purpose address ranges are rejected.
 */

export type DnsResolver = (hostname: string) => Promise<string[]>;
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class PublicUrlError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, status = 400, code = "invalid_url") {
    super(message);
    this.name = "PublicUrlError";
    this.status = status;
    this.code = code;
  }
}

const MAX_URL_LENGTH = 4096;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const BLOCKED_HOST_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home",
  "home.arpa",
  "test",
  "invalid",
  "onion",
];

const BLOCKED_IPV4_CIDRS: Array<[number[], number]> = [
  [[0, 0, 0, 0], 8],
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10],
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24],
  [[192, 0, 2, 0], 24],
  [[192, 88, 99, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4],
  [[240, 0, 0, 0], 4],
];

const BLOCKED_IPV6_CIDRS: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback and deprecated IPv4-compatible space
  ["64:ff9b::", 96], // well-known NAT64 prefix
  ["64:ff9b:1::", 48], // local-use NAT64 prefix
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:2::", 48], // benchmarking
  ["2001:10::", 28], // ORCHID
  ["2001:20::", 28], // ORCHIDv2
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 can encode private IPv4 targets
  ["3fff::", 20], // documentation
  ["5f00::", 16], // segment-routing SIDs
  ["fc00::", 7], // unique-local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
];

function matchesCidr(
  address: number[],
  network: number[],
  prefix: number,
): boolean {
  const fullBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;

  for (let index = 0; index < fullBytes; index += 1) {
    if (address[index] !== network[index]) return false;
  }

  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (address[fullBytes] & mask) === (network[fullBytes] & mask);
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    bytes.push(byte);
  }
  return bytes;
}

function parseIpv6(value: string): number[] | null {
  let address = value.trim().toLowerCase();
  if (address.startsWith("[") && address.endsWith("]")) {
    address = address.slice(1, -1);
  }
  if (!address || address.includes("%")) return null;

  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = parseIpv4(address.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    address = `${address.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];

  if (halves.length === 1) {
    if (left.length !== 8) return null;
    groups = left;
  } else {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill("0"), ...right];
  }

  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function normalizeHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized.replace(/\.+$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  if (!hostname.includes(".")) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) =>
    hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

function isIpv4MappedIpv6(bytes: number[]): boolean {
  return bytes.length === 16 &&
    bytes.slice(0, 10).every((value) => value === 0) &&
    bytes[10] === 0xff && bytes[11] === 0xff;
}

/** Returns true for private or otherwise non-publicly-routable IP addresses. */
export function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    return BLOCKED_IPV4_CIDRS.some(([network, prefix]) =>
      matchesCidr(ipv4, network, prefix)
    );
  }

  const ipv6 = parseIpv6(normalized);
  if (!ipv6) return true;

  if (isIpv4MappedIpv6(ipv6)) {
    const mappedIpv4 = ipv6.slice(12);
    return BLOCKED_IPV4_CIDRS.some(([network, prefix]) =>
      matchesCidr(mappedIpv4, network, prefix)
    );
  }

  return BLOCKED_IPV6_CIDRS.some(([networkAddress, prefix]) => {
    const network = parseIpv6(networkAddress);
    return network ? matchesCidr(ipv6, network, prefix) : true;
  });
}

async function defaultDnsResolver(hostname: string): Promise<string[]> {
  const [ipv4, ipv6] = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA"),
  ]);

  return [
    ...(ipv4.status === "fulfilled" ? ipv4.value : []),
    ...(ipv6.status === "fulfilled" ? ipv6.value : []),
  ];
}

/** Parse and verify that a URL can only address a public HTTP(S) host. */
export async function assertPublicHttpUrl(
  input: unknown,
  resolver: DnsResolver = defaultDnsResolver,
): Promise<URL> {
  if (
    typeof input !== "string" || input.length === 0 ||
    input.length > MAX_URL_LENGTH
  ) {
    throw new PublicUrlError("URLが正しくありません。", 400, "invalid_url");
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PublicUrlError("URLが正しくありません。", 400, "invalid_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicUrlError(
      "HTTPまたはHTTPSのURLを指定してください。",
      400,
      "unsupported_scheme",
    );
  }
  if (url.username || url.password) {
    throw new PublicUrlError(
      "認証情報を含むURLは使用できません。",
      403,
      "credentials_not_allowed",
    );
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new PublicUrlError(
      "標準ポート以外のURLは使用できません。",
      403,
      "port_not_allowed",
    );
  }

  url.hash = "";
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new PublicUrlError(
      "URLのホスト名がありません。",
      400,
      "invalid_host",
    );
  }

  const literalIpv4 = parseIpv4(hostname);
  const literalIpv6 = hostname.includes(":") ? parseIpv6(hostname) : null;
  if (literalIpv4 || literalIpv6) {
    if (isBlockedIpAddress(hostname)) {
      throw new PublicUrlError(
        "ローカルまたは非公開ネットワークにはアクセスできません。",
        403,
        "private_address",
      );
    }
    return url;
  }

  if (isBlockedHostname(hostname)) {
    throw new PublicUrlError(
      "ローカルまたは非公開のホスト名にはアクセスできません。",
      403,
      "private_hostname",
    );
  }

  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new PublicUrlError(
      "URLのホスト名を確認できませんでした。",
      400,
      "dns_failed",
    );
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new PublicUrlError(
      "URLのホスト名を確認できませんでした。",
      400,
      "dns_failed",
    );
  }
  if (addresses.some((address) => isBlockedIpAddress(String(address)))) {
    throw new PublicUrlError(
      "ローカルまたは非公開ネットワークにはアクセスできません。",
      403,
      "private_address",
    );
  }

  return url;
}

export interface SafeFetchOptions {
  resolver?: DnsResolver;
  fetchImpl?: FetchLike;
  headers?: HeadersInit;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: URL;
}

/** GET a public URL while manually validating every redirect target. */
export async function safeFetchPublicUrl(
  input: unknown,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const resolver = options.resolver ?? defaultDnsResolver;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000),
    60_000,
  );
  const maxRedirects = Math.min(
    Math.max(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS, 0),
    10,
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = await assertPublicHttpUrl(input, resolver);

    for (let redirectCount = 0;; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        return { response, finalUrl: currentUrl };
      }

      if (redirectCount >= maxRedirects) {
        await response.body?.cancel().catch(() => undefined);
        throw new PublicUrlError(
          "リダイレクト回数が多すぎます。",
          502,
          "too_many_redirects",
        );
      }

      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        throw new PublicUrlError(
          "リダイレクト先が不正です。",
          502,
          "invalid_redirect",
        );
      }

      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, currentUrl);
      } catch {
        throw new PublicUrlError(
          "リダイレクト先が不正です。",
          502,
          "invalid_redirect",
        );
      }
      currentUrl = await assertPublicHttpUrl(redirectUrl.toString(), resolver);
    }
  } catch (error) {
    if (error instanceof PublicUrlError) throw error;
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") {
      throw new PublicUrlError(
        "URLの取得がタイムアウトしました。",
        504,
        "fetch_timeout",
      );
    }
    throw new PublicUrlError("URLの取得に失敗しました。", 502, "fetch_failed");
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Read a response body without allowing unbounded memory use. */
export async function readResponseBytesLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength && /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    throw new PublicUrlError(
      "取得データが大きすぎます。",
      413,
      "response_too_large",
    );
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PublicUrlError(
          "取得データが大きすぎます。",
          413,
          "response_too_large",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readResponseTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder().decode(
    await readResponseBytesLimited(response, maxBytes),
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

/** Log only origin/path; query strings and fragments may contain secrets. */
export function formatPublicUrlForLog(url: URL): string {
  const path = url.pathname.length > 300
    ? `${url.pathname.slice(0, 300)}…`
    : url.pathname;
  return `${url.protocol}//${url.host}${path}`;
}
