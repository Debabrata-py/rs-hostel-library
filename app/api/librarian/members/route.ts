
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibrarian } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const librarian = await requireLibrarian();

    if (!librarian) {
      return NextResponse.json(
        { error: "You are not authorized to manage members." },
        { status: 403 }
      );
    }

    const members = await prisma.user.findMany({
      where: {
        role: "MEMBER",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        fullName: true,
        roomNumber: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Loading members failed:", error);

    return NextResponse.json(
      { error: "Could not load the member list." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const librarian = await requireLibrarian();

    if (!librarian) {
      return NextResponse.json(
        { error: "You are not authorized to manage members." },
        { status: 403 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("memberId" in body) ||
      !("action" in body)
    ) {
      return NextResponse.json(
        { error: "Member ID and action are required." },
        { status: 400 }
      );
    }

    const { memberId, action } = body as {
      memberId: unknown;
      action: unknown;
    };

    if (
      typeof memberId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        memberId
      )
    ) {
      return NextResponse.json(
        { error: "Invalid member ID." },
        { status: 400 }
      );
    }

    if (
      action !== "APPROVE" &&
      action !== "REJECT" &&
      action !== "SUSPEND" &&
      action !== "REACTIVATE"
    ) {
      return NextResponse.json(
        { error: "Invalid member-management action." },
        { status: 400 }
      );
    }

    const now = new Date();

    let expectedStatus:
      | "PENDING_APPROVAL"
      | "ACTIVE"
      | "SUSPENDED";

    let newStatus: "ACTIVE" | "REJECTED" | "SUSPENDED";

    let additionalData: {
      activatedAt?: Date;
      activatedById?: string;
      rejectedAt?: Date;
      suspendedAt?: Date | null;
    };

    switch (action) {
      case "APPROVE":
        expectedStatus = "PENDING_APPROVAL";
        newStatus = "ACTIVE";
        additionalData = {
          activatedAt: now,
          activatedById: librarian.id,
        };
        break;

      case "REJECT":
        expectedStatus = "PENDING_APPROVAL";
        newStatus = "REJECTED";
        additionalData = {
          rejectedAt: now,
        };
        break;

      case "SUSPEND":
        expectedStatus = "ACTIVE";
        newStatus = "SUSPENDED";
        additionalData = {
          suspendedAt: now,
        };
        break;

      case "REACTIVATE":
        expectedStatus = "SUSPENDED";
        newStatus = "ACTIVE";
        additionalData = {
          activatedAt: now,
          activatedById: librarian.id,
          suspendedAt: null,
        };
        break;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: memberId,
          role: "MEMBER",
          status: expectedStatus,
          ...(action === "APPROVE" || action === "REJECT"
            ? { emailVerifiedAt: { not: null } }
            : {}),
        },
        data: {
          status: newStatus,
          ...additionalData,
        },
      });

      if (updated.count !== 1) {
        return {
          updated: false,
          sessionsRevoked: 0,
        };
      }

      let sessionsRevoked = 0;

      if (action === "REJECT" || action === "SUSPEND") {
        const revoked = await tx.session.updateMany({
          where: {
            userId: memberId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        sessionsRevoked = revoked.count;
      }

      return {
        updated: true,
        sessionsRevoked,
      };
    });

    if (!result.updated) {
      return NextResponse.json(
        {
          error:
            "This account could not be updated. It may have already changed, or it may not be eligible for this action.",
        },
        { status: 409 }
      );
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        fullName: true,
        status: true,
      },
    });

    return NextResponse.json({
      message: "Member account updated successfully.",
      member,
      sessionsRevoked: result.sessionsRevoked,
    });
  } catch (error) {
    console.error("Updating member failed:", error);

    return NextResponse.json(
      { error: "Could not update this member's account." },
      { status: 500 }
    );
  }
}
