import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibrarian } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const librarian = await requireLibrarian();
    if (!librarian) {
      return NextResponse.json(
        { error: "You are not authorized to manage borrowing requests." },
        { status: 403 }
      );
    }

    const [requests, activeLoans] = await Promise.all([
      prisma.borrowRequest.findMany({
        orderBy: { requestedAt: "desc" },
        select: {
          id: true,
          memberId: true,
          copyId: true,
          requestedAt: true,
          status: true,
          reviewedAt: true,
          decisionNote: true,
          member: {
            select: { fullName: true, roomNumber: true, email: true },
          },
          copy: {
            select: {
              accessionNumber: true,
              shelfLocation: true,
              book: { select: { title: true, author: true } },
            },
          },
        },
      }),
      prisma.loan.findMany({
        where: { returnedAt: null },
        orderBy: { dueAt: "asc" },
        select: {
          id: true,
          issuedAt: true,
          dueAt: true,
          member: {
            select: { fullName: true, roomNumber: true, email: true },
          },
          copy: {
            select: {
              accessionNumber: true,
              shelfLocation: true,
              book: { select: { title: true, author: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({ requests, activeLoans });
  } catch (error) {
    console.error("Loading borrowing requests failed:", error);
    return NextResponse.json(
      { error: "Could not load the librarian dashboard." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const librarian = await requireLibrarian();
    if (!librarian) {
      return NextResponse.json(
        { error: "You are not authorized to manage borrowing requests." },
        { status: 403 }
      );
    }

    const bodyResult = await readJsonBody(request, 32768);
    if (!bodyResult.ok) return bodyResult.response;
    const body: unknown = bodyResult.data;

    if (!isObject(body) || typeof body.action !== "string") {
      return NextResponse.json(
        { error: "A valid action is required." },
        { status: 400 }
      );
    }

    const action = body.action;

    if (action === "REVIEW") {
      if (
        typeof body.requestId !== "string" ||
        !UUID_PATTERN.test(body.requestId)
      ) {
        return NextResponse.json(
          { error: "Invalid borrowing request ID." },
          { status: 400 }
        );
      }
      if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
        return NextResponse.json(
          { error: "Invalid request decision." },
          { status: 400 }
        );
      }

      const note =
        typeof body.decisionNote === "string"
          ? body.decisionNote.trim()
          : "";
      if (note.length > 1000) {
        return NextResponse.json(
          { error: "The decision note cannot exceed 1000 characters." },
          { status: 400 }
        );
      }

      const borrowingRequest = await prisma.borrowRequest.findUnique({
        where: { id: body.requestId },
        select: { id: true, memberId: true },
      });
      if (!borrowingRequest) {
        return NextResponse.json(
          { error: "This borrowing request does not exist." },
          { status: 404 }
        );
      }
      if (borrowingRequest.memberId === librarian.id) {
        return NextResponse.json(
          {
            error:
              "You cannot approve or reject your own borrowing request. Another librarian must review it.",
          },
          { status: 409 }
        );
      }

      const result = await prisma.borrowRequest.updateMany({
        where: {
          id: body.requestId,
          memberId: { not: librarian.id },
          status: "PENDING",
          member: { status: "ACTIVE" },
        },
        data: {
          status: body.decision,
          reviewedById: librarian.id,
          reviewedAt: new Date(),
          decisionNote: note || null,
        },
      });
      if (result.count !== 1) {
        return NextResponse.json(
          {
            error:
              "This request could not be reviewed. It may already have been processed, or the member account is no longer active.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        message:
          body.decision === "APPROVED"
            ? "Request approved. The book has not been issued yet."
            : "Request rejected.",
      });
    }

    if (action === "ISSUE") {
      if (
        typeof body.requestId !== "string" ||
        !UUID_PATTERN.test(body.requestId)
      ) {
        return NextResponse.json(
          { error: "Invalid borrowing request ID." },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const borrowingRequest = await tx.borrowRequest.findUnique({
          where: { id: body.requestId as string },
          select: {
            id: true,
            status: true,
            memberId: true,
            copyId: true,
            member: { select: { status: true } },
          },
        });

        if (!borrowingRequest || borrowingRequest.status !== "APPROVED") {
          throw new Error("REQUEST_NOT_APPROVED");
        }
        if (borrowingRequest.memberId === librarian.id) {
          throw new Error("SELF_REQUEST_ACTION_NOT_ALLOWED");
        }
        if (borrowingRequest.member.status !== "ACTIVE") {
          throw new Error("MEMBER_NOT_ACTIVE");
        }

        // This lock is also taken by the copy-edit endpoint. It serializes
        // changes to condition/status with issuing this physical copy.
        const lockedCopies = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "BookCopy"
          WHERE "id" = ${borrowingRequest.copyId}::uuid
          FOR UPDATE
        `;
        if (lockedCopies.length === 0) throw new Error("COPY_NOT_AVAILABLE");

        const copy = await tx.bookCopy.findUnique({
          where: { id: borrowingRequest.copyId },
          select: {
            status: true,
            condition: true,
            loans: {
              where: { returnedAt: null },
              select: { id: true },
              take: 1,
            },
          },
        });

        if (
          !copy ||
          copy.status !== "AVAILABLE" ||
          copy.condition === "DAMAGED" ||
          copy.condition === "UNDER_REPAIR" ||
          copy.loans.length > 0
        ) {
          throw new Error("COPY_NOT_AVAILABLE");
        }

        const now = new Date();
        const dueAt = new Date(now);
        dueAt.setDate(dueAt.getDate() + 21);

        const updated = await tx.borrowRequest.updateMany({
          where: {
            id: borrowingRequest.id,
            memberId: { not: librarian.id },
            status: "APPROVED",
            member: { status: "ACTIVE" },
          },
          data: { status: "FULFILLED" },
        });
        if (updated.count !== 1) {
          throw new Error("REQUEST_ALREADY_PROCESSED");
        }

        return tx.loan.create({
          data: {
            copyId: borrowingRequest.copyId,
            memberId: borrowingRequest.memberId,
            requestId: borrowingRequest.id,
            issuedById: librarian.id,
            issuedAt: now,
            dueAt,
          },
          select: { id: true, dueAt: true },
        });
      });

      return NextResponse.json({
        message: "Book issued successfully.",
        loanId: result.id,
        dueAt: result.dueAt,
      });
    }

    if (action === "RETURN") {
      if (typeof body.loanId !== "string" || !UUID_PATTERN.test(body.loanId)) {
        return NextResponse.json(
          { error: "Invalid loan ID." },
          { status: 400 }
        );
      }

      const result = await prisma.loan.updateMany({
        where: { id: body.loanId, returnedAt: null },
        data: { returnedAt: new Date(), returnedById: librarian.id },
      });
      if (result.count !== 1) {
        return NextResponse.json(
          {
            error:
              "This loan could not be returned. It may already have been returned.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({
        message: "Book return recorded successfully.",
      });
    }

    return NextResponse.json(
      { error: "Unknown borrowing-request action." },
      { status: 400 }
    );
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";

    if (code === "P2002" || code === "P2034") {
      return NextResponse.json(
        {
          error:
            "This copy may already be on loan, or another operation changed the request. Please refresh the dashboard.",
        },
        { status: 409 }
      );
    }

    if (error instanceof Error) {
      const messages: Record<string, string> = {
        REQUEST_NOT_APPROVED: "Only an approved request can be issued.",
        SELF_REQUEST_ACTION_NOT_ALLOWED:
          "You cannot issue your own borrowing request. Another librarian must issue it.",
        MEMBER_NOT_ACTIVE: "This member account is not active.",
        COPY_NOT_AVAILABLE:
          "This physical copy is not available for borrowing. Check its condition, status and current loans.",
        REQUEST_ALREADY_PROCESSED:
          "This request has already been processed.",
      };
      if (messages[error.message]) {
        return NextResponse.json(
          { error: messages[error.message] },
          { status: 409 }
        );
      }
    }

    console.error("Borrowing-request operation failed:", error);
    return NextResponse.json(
      { error: "Could not complete the borrowing-request operation." },
      { status: 500 }
    );
  }
}
