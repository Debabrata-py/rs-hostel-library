import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
  identity?: string;
};

type RateLimitRow = {
  count: number;
  windowStartedAt: Date;
};

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getClientAddress(request: Request) {
  // The production reverse proxy must overwrite X-Real-IP. Do not let
  // clients supply this header directly when the app is publicly exposed.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim();
    if (firstAddress) return firstAddress;
  }

  return "unknown";
}

async function consumeBucket(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  // A single PostgreSQL upsert makes increment/reset atomic across
  // concurrent requests and multiple application processes.
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "RateLimitBucket"
      ("key", "count", "windowStartedAt", "expiresAt")
    VALUES
      (${key}, 1, ${now}, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStartedAt"
          + (${windowMs} * INTERVAL '1 millisecond') <= ${now}
        THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "RateLimitBucket"."windowStartedAt"
          + (${windowMs} * INTERVAL '1 millisecond') <= ${now}
        THEN ${now}
        ELSE "RateLimitBucket"."windowStartedAt"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."windowStartedAt"
          + (${windowMs} * INTERVAL '1 millisecond') <= ${now}
        THEN ${expiresAt}
        ELSE "RateLimitBucket"."expiresAt"
      END
    RETURNING "count", "windowStartedAt"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("RATE_LIMIT_BUCKET_WRITE_FAILED");
  }

  const windowEndsAt = new Date(
    new Date(row.windowStartedAt).getTime() + windowMs,
  );
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000),
  );

  return {
    allowed: row.count <= limit,
    retryAfterSeconds,
  };
}

/**
 * Applies an IP-based limit and, when supplied, a second identity-based
 * limit. Raw IP addresses and identity values are never stored.
 *
 * The returned response should be returned directly by the API route.
 */
export async function enforceRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const address = getClientAddress(request);
  const keys = [
    hashKey(`${options.scope}:ip:${address}`),
  ];

  if (options.identity) {
    keys.push(hashKey(`${options.scope}:identity:${options.identity.trim().toLowerCase()}`));
  }

  let blockedRetryAfter = 0;

  for (const key of keys) {
    const result = await consumeBucket(
      key,
      options.limit,
      options.windowMs,
    );

    if (!result.allowed) {
      blockedRetryAfter = Math.max(
        blockedRetryAfter,
        result.retryAfterSeconds,
      );
    }
  }

  if (blockedRetryAfter === 0) {
    return null;
  }

  return NextResponse.json(
    { message: "Too many attempts. Please wait before trying again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(blockedRetryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
