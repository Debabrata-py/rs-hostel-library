
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

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

    // Until real email delivery is implemented, registration is
    // permitted only in local development.
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        {
          error:
            "Registration is temporarily unavailable. Please contact the librarian.",
        },
        { status: 503 }
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

    const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

    console.info(
      `[DEV EMAIL] Verification link: ${baseUrl}/verify-email?token=${token}`
    );

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
