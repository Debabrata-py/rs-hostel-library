import { NextResponse } from "next/server";

type BodyReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

function tooLargeResponse() {
  return NextResponse.json(
    { error: "Request body is too large." },
    { status: 413, headers: { "Cache-Control": "no-store" } },
  );
}

function invalidBodyResponse() {
  return NextResponse.json(
    { error: "Invalid request body." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

async function readBytes(
  request: Request,
  maxBytes: number,
): Promise<BodyReadResult<Uint8Array>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      return { ok: false, response: invalidBodyResponse() };
    }
    if (declaredLength > maxBytes) {
      return { ok: false, response: tooLargeResponse() };
    }
  }

  if (!request.body) {
    return { ok: true, data: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, response: tooLargeResponse() };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: invalidBodyResponse() };
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, data: result };
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<BodyReadResult<Record<string, unknown>>> {
  const bytes = await readBytes(request, maxBytes);
  if (!bytes.ok) return bytes;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.data);
    const parsed: unknown = JSON.parse(text);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: invalidBodyResponse() };
    }

    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: invalidBodyResponse() };
  }
}

export async function readFormDataBody(
  request: Request,
  maxBytes: number,
): Promise<BodyReadResult<FormData>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return { ok: false, response: invalidBodyResponse() };
  }

  const bytes = await readBytes(request, maxBytes);
  if (!bytes.ok) return bytes;

  try {
    // Copy into a standalone ArrayBuffer so it is accepted as a BodyInit
    // across TypeScript's newer generic Uint8Array definitions.
    const bodyBuffer = new ArrayBuffer(bytes.data.byteLength);
    new Uint8Array(bodyBuffer).set(bytes.data);

    const copy = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: bodyBuffer,
    });
    return { ok: true, data: await copy.formData() };
  } catch {
    return { ok: false, response: invalidBodyResponse() };
  }
}
