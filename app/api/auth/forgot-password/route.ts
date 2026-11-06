import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { enforceRateLimit } from "@/lib/rate-limit";

import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const GENERIC_MESSAGE =
  "If an account exists with that email address, a password reset link has been generated.";

export async function POST(request: Request) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;


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

    try {
  await sendEmail({
    to: email,
    subject: "Reset your RS Hostel Library password",
    text: `Hello,

We received a request to reset your RS Hostel Library password.

Use the following link to choose a new password:

${resetUrl.toString()}

This link expires in 1 hour. If you did not request this, you can ignore this email.

RS Hostel Library`,
  });
} catch (emailError) {
  console.error("Password reset email delivery failed:", emailError);

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      tokenHash,
    },
  });

  return NextResponse.json(
    { message: "Unable to send the password reset email. Please try again later." },
    { status: 503 }
  );
}

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Password reset request failed:", error);

    return NextResponse.json(
      { message: "Unable to process your request. Please try again." },
      { status: 500 }
    );
  }
}
