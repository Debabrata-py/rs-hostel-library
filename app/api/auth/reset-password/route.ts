
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return NextResponse.json(
        { message: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    if (
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!resetToken) {
      return NextResponse.json(
        { message: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await prisma.$transaction(async (tx) => {
      // Claim the token. Only one request can successfully use it.
      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
        },
      });

      if (claimed.count !== 1) {
        throw new Error("RESET_TOKEN_ALREADY_USED");
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      // Revoke every existing session for this account.
      await tx.session.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      // Invalidate any other outstanding reset links.
      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });
    });

    return NextResponse.json({
      message: "Your password has been reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "RESET_TOKEN_ALREADY_USED"
    ) {
      return NextResponse.json(
        { message: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    console.error("Password reset failed:", error);

    return NextResponse.json(
      { message: "Unable to reset your password. Please try again." },
      { status: 500 }
    );
  }
}
