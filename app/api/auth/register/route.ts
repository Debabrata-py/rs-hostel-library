import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { enforceRateLimit } from "@/lib/rate-limit";

import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const rateLimitResponse = await enforceRateLimit(request, {
      scope: "auth-register",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (rateLimitResponse) return rateLimitResponse;
    const bodyResult = await readJsonBody(request, 16384);
    if (!bodyResult.ok) return bodyResult.response;
    const body: unknown = bodyResult.data;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid registration data." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const fullName =
      typeof data.fullName === "string" ? data.fullName.trim() : "";
    const roomNumber =
      typeof data.roomNumber === "string" ? data.roomNumber.trim() : "";
    const email =
      typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const phone =
      typeof data.phone === "string" ? data.phone.trim() : "";
    const password =
      typeof data.password === "string" ? data.password : "";

    if (
      !fullName ||
      fullName.length > 120 ||
      !roomNumber ||
      roomNumber.length > 30 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !/^\+?[0-9\s()-]{7,20}$/.test(phone) ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      return NextResponse.json(
        { error: "Please check your registration details." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "Unable to register with these details. Please check your email or contact the librarian.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName,
          roomNumber,
          email,
          phone,
          passwordHash,
          role: "MEMBER",
          status: "PENDING_EMAIL_VERIFICATION",
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

 const baseUrl = process.env.APP_URL;

if (!baseUrl) {
  throw new Error("APP_URL is not configured.");
}

const verificationUrl = new URL("/verify-email", baseUrl);
verificationUrl.searchParams.set("token", token);

try {
  await sendEmail({
    to: email,
    subject: "Verify your RS Hostel Library account",
    text: `Hello ${fullName},

Thank you for registering with RS Hostel Library.

Please verify your email address using this link:

${verificationUrl.toString()}

This link expires in 24 hours.

After verification, your account will wait for librarian approval.

RS Hostel Library`,
  });
} catch (emailError) {
  await prisma.$transaction([
  prisma.emailVerificationToken.deleteMany({
    where: { tokenHash },
  }),
  prisma.user.deleteMany({ where: { email } }),
]);

  console.error("Registration email delivery failed:", emailError);

  return NextResponse.json(
    {
      error: "Unable to send verification email. Please try again later.",
    },
    { status: 503 }
  );
}

    return NextResponse.json(
      {
        message:
          "Registration received. Please check your email to verify your account.",
      },
      { status: 201 }
    );
  } catch (error) {
    // Handle simultaneous registrations using the same email.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Unable to register with these details. Please check your email or contact the librarian.",
        },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);

    return NextResponse.json(
      { error: "Registration failed. Please try again later." },
      { status: 500 }
    );
  }
}
