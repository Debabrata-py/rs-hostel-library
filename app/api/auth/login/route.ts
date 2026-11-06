import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

const SESSION_COOKIE = "rs_library_session";
const SESSION_DURATION_DAYS = 7;

export async function POST(request: NextRequest) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const ipRateLimitResponse = await enforceRateLimit(request, {
      scope: "auth-login",
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (ipRateLimitResponse) return ipRateLimitResponse;

    const bodyResult = await readJsonBody(request, 16384);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    if (email) {
      const emailRateLimitResponse = await enforceRateLimit(request, {
        scope: "auth-login-email",
        limit: 8,
        windowMs: 15 * 60 * 1000,
        identity: email,
      });

      if (emailRateLimitResponse) return emailRateLimitResponse;
    }

    if (
      !email ||
      email.length > 254 ||
      !password ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      return NextResponse.json(
        { message: "Please enter a valid email and password." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Login failed. Check your email and password." },
        { status: 401 }
      );
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      password
    );

    if (!passwordMatches) {
      return NextResponse.json(
        { message: "Login failed. Check your email and password." },
        { status: 401 }
      );
    }

    if (user.status !== "ACTIVE") {
      const messages: Record<string, string> = {
        PENDING_EMAIL_VERIFICATION:
          "Please verify your email address before signing in.",
        PENDING_APPROVAL:
          "Your account is awaiting librarian approval. Please try again after your account has been activated.",
        REJECTED:
          "Your registration was not approved. Please contact the librarian.",
        SUSPENDED:
          "Your account has been suspended. Please contact the librarian.",
      };

      return NextResponse.json(
        {
          message:
            messages[user.status] ??
            "Your account is not currently active.",
        },
        { status: 403 }
      );
    }

    const sessionToken = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    const response = NextResponse.json({
      message: "Login successful.",
      role: user.role,
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
