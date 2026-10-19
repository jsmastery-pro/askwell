/** The chat route's body cap (§9 Cost abuse). A valid request is well under 2 KB. */
export const MAX_CHAT_BODY_BYTES = 16 * 1024;

export type BodyResult = { ok: true; json: unknown } | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Reads a JSON body without ever holding more than `maxBytes` of it: rejects on an oversized
 * Content-Length up front, and stops reading once the actual bytes pass the cap, since the
 * header can be missing or wrong.
 */
export async function readCappedJson(request: Request, maxBytes = MAX_CHAT_BODY_BYTES): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  }

  try {
    return { ok: true, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
