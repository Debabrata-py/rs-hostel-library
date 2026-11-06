import { NextResponse } from "next/server";

function getExpectedOrigin(request: Request): string | null {
  const configuredAppUrl = process.env.APP_URL?.trim();

  if (configuredAppUrl) {
    try {
      const configuredUrl = new URL(configuredAppUrl);

      if (
        process.env.NODE_ENV === "production" &&
        configuredUrl.protocol !== "https:"
      ) {
        return null;
      }

      return configuredUrl.origin;
    } catch {
      return null;
    }
  }

  // Production must have an explicit trusted origin. Never derive it from
  // the incoming Host header, which may be controlled by the requester.
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  // Local development may use localhost or the machine's LAN address.
  return new URL(request.url).origin;
}

/**
 * Rejects cross-origin requests to state-changing API endpoints.
 * Browser requests must provide an Origin matching the configured app URL.
 */
export function verifySameOrigin(request: Request): NextResponse | null {
  const expectedOrigin = getExpectedOrigin(request);

  if (!expectedOrigin) {
    return NextResponse.json(
      { message: "The application origin is not configured securely." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const originHeader = request.headers.get("origin");
  if (!originHeader || originHeader === "null") {
    return NextResponse.json(
      { message: "A valid same-origin request is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let requestOrigin: string;
  try {
    const parsedOrigin = new URL(originHeader);
    if (parsedOrigin.origin !== originHeader) {
      throw new Error("Origin header must contain only an origin.");
    }
    requestOrigin = parsedOrigin.origin;
  } catch {
    return NextResponse.json(
      { message: "A valid same-origin request is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (requestOrigin !== expectedOrigin) {
    return NextResponse.json(
      { message: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return NextResponse.json(
      { message: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}
