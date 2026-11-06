import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { enforceRateLimit } from "@/lib/rate-limit";

import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const GENERIC_MESSAGE =
  "If an account exists with that email address, a password reset link has been generated.";

export async function POST(request: Request) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        message: "Password reset is temporarily unavailable.",
      },
      { status: 503 }
    );
  }

  try {
    const rateLimitResponse = await enforceRateLimit(request, {
      scope: "auth-forgot-password",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimitResponse) return rateLimitResponse;
    const bodyResult = await readJsonBody(request, 8192);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (email) {
      const emailRateLimitResponse = await enforceRateLimit(request, {
        scope: "auth-forgot-password-email",
        limit: 3,
        windowMs: 60 * 60 * 1000,
        identity: email,
      });
      if (emailRateLimitResponse) return emailRateLimitResponse;
    }

    if (!email || email.length > 254) {
      return NextResponse.json(
        { message: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Always return the same response, whether the account exists or not.
    if (!user) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      }),
      prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = new URL("/reset-password", request.url);
    resetUrl.searchParams.set("token", token);

    console.log(`[DEV EMAIL] Password reset link: ${resetUrl.toString()}`);

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Password reset request failed:", error);

    return NextResponse.json(
      { message: "Unable to process your request. Please try again." },
      { status: 500 }
    );
  }
}
