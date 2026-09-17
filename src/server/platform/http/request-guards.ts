import { AppError } from "../errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * CSRF defence for cookie-authenticated mutations (docs/07 §8): the request must come from our own
 * origin. Browsers always send Origin and/or Sec-Fetch-Site on cross-site POSTs, so their absence on
 * a mutation means a non-browser client, which must use a different authentication scheme.
 */
export function assertSameOrigin(headers: Headers, appBaseUrl: string): void {
  const expectedOrigin = new URL(appBaseUrl).origin;
  const fetchSite = headers.get("sec-fetch-site");
  const origin = headers.get("origin");

  if (fetchSite && fetchSite !== "same-origin") {
    throw new AppError("FORBIDDEN", { cause: `sec-fetch-site=${fetchSite}` });
  }
  if (origin !== null) {
    if (origin !== expectedOrigin) throw new AppError("FORBIDDEN", { cause: "origin mismatch" });
    return;
  }
  if (fetchSite === "same-origin") return;
  throw new AppError("FORBIDDEN", { cause: "missing origin" });
}

export function assertJsonContentType(headers: Headers): void {
  const contentType = headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", {
      detail: "Send the request body as application/json.",
    });
  }
}

/** Reads the body as text, enforcing a byte limit while streaming (Content-Length can lie). */
export async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE");
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new AppError("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  assertJsonContentType(request.headers);
  const text = await readBodyText(request, maxBytes);
  if (text.trim() === "")
    throw new AppError("BAD_REQUEST", { detail: "The request body is empty." });
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("BAD_REQUEST", { detail: "The request body is not valid JSON." });
  }
}
