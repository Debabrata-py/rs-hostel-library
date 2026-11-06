import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { enforceRateLimit } from "@/lib/rate-limit";

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const rateLimitResponse = await enforceRateLimit(request, {
      scope: "auth-verify-email",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimitResponse) return rateLimitResponse;
    const bodyResult = await readJsonBody(request, 8192);
    if (!bodyResult.ok) return bodyResult.response;
    const body: unknown = bodyResult.data;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as Record<string, unknown>).token !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid verification link." },
        { status: 400 }
      );
    }

    const token = (body as { token: string }).token;

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return NextResponse.json(
        { error: "Invalid verification link." },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    const verificationToken =
      await prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
        },
      });

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt <= now
    ) {
      return NextResponse.json(
        {
          error:
            "This verification link is invalid, expired, or has already been used.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Claim the token only if it is still unused and unexpired.
      const tokenUpdate =
        await tx.emailVerificationToken.updateMany({
          where: {
            id: verificationToken.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
          },
        });

      if (tokenUpdate.count !== 1) {
        throw new Error("VERIFICATION_TOKEN_UNAVAILABLE");
      }

      // Email verification does not activate the account.
      // The librarian must approve it separately.
      const userUpdate = await tx.user.updateMany({
        where: {
          id: verificationToken.userId,
          status: "PENDING_EMAIL_VERIFICATION",
        },
        data: {
          status: "PENDING_APPROVAL",
          emailVerifiedAt: now,
        },
      });

      if (userUpdate.count !== 1) {
        throw new Error("USER_NOT_PENDING_VERIFICATION");
      }
    });

    return NextResponse.json({
      message:
        "Email verified successfully. Your account is now waiting for librarian approval.",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "VERIFICATION_TOKEN_UNAVAILABLE" ||
        error.message === "USER_NOT_PENDING_VERIFICATION")
    ) {
      return NextResponse.json(
        {
          error:
            "This verification link is invalid, expired, or has already been used.",
        },
        { status: 400 }
      );
    }

    console.error("Email verification error:", error);

    return NextResponse.json(
      { error: "Could not verify your email. Please try again later." },
      { status: 500 }
    );
  }
}
