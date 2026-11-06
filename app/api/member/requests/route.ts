import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBorrower } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const borrower = await requireBorrower();

    if (!borrower) {
      return NextResponse.json(
        { error: "Please sign in with an active borrower account." },
        { status: 401 }
      );
    }

    const profile = await prisma.user.findUnique({
      where: { id: borrower.id },
      select: {
        fullName: true,
        roomNumber: true,
        email: true,
        phone: true,
        status: true,
      },
    });

    if (!profile || profile.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Your account is not active." },
        { status: 403 }
      );
    }

    const requests = await prisma.borrowRequest.findMany({
      where: {
        memberId: borrower.id,
      },
      orderBy: {
        requestedAt: "desc",
      },
      select: {
        id: true,
        requestedAt: true,
        status: true,
        decisionNote: true,
        copy: {
          select: {
            accessionNumber: true,
            book: {
              select: {
                title: true,
                author: true,
              },
            },
          },
        },
      },
    });

    const requestIds = requests.map((request) => request.id);

    const loans =
      requestIds.length > 0
        ? await prisma.loan.findMany({
            where: {
              memberId: borrower.id,
              requestId: {
                in: requestIds,
              },
            },
            select: {
              id: true,
              requestId: true,
              issuedAt: true,
              dueAt: true,
              returnedAt: true,
            },
          })
        : [];

    const loanByRequestId = new Map(
      loans.map((loan) => [loan.requestId, loan])
    );

    const requestsWithLoans = requests.map((request) => ({
      ...request,
      loan: loanByRequestId.get(request.id) ?? null,
    }));

    return NextResponse.json({
      profile,
      requests: requestsWithLoans,
    });
  } catch (error) {
    console.error("Loading borrower dashboard failed:", error);

    return NextResponse.json(
      { error: "Could not load your borrowing dashboard." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const borrower = await requireBorrower();

    if (!borrower) {
      return NextResponse.json(
        { error: "Please sign in with an active borrower account." },
        { status: 401 }
      );
    }

    const bodyResult = await readJsonBody(request, 16384);
    if (!bodyResult.ok) return bodyResult.response;
    const body: unknown = bodyResult.data;

    if (
      typeof body !== "object" ||
      body === null ||
      !("copyId" in body) ||
      typeof body.copyId !== "string" ||
      !UUID_PATTERN.test(body.copyId)
    ) {
      return NextResponse.json(
        { error: "A valid physical book copy ID is required." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const currentBorrower = await tx.user.findUnique({
          where: { id: borrower.id },
          select: {
            status: true,
            role: true,
          },
        });

        if (
          !currentBorrower ||
          !["MEMBER", "LIBRARIAN"].includes(currentBorrower.role) ||
          currentBorrower.status !== "ACTIVE"
        ) {
          throw new Error("BORROWER_NOT_ACTIVE");
        }

        const copy = await tx.bookCopy.findUnique({
          where: {
            id: body.copyId as string,
          },
          select: {
            id: true,
            status: true,
            accessionNumber: true,
            book: {
              select: {
                title: true,
                author: true,
              },
            },
            loans: {
              where: {
                returnedAt: null,
              },
              select: {
                id: true,
              },
              take: 1,
            },
          },
        });

        if (!copy) {
          throw new Error("COPY_NOT_FOUND");
        }

        if (copy.status !== "AVAILABLE") {
          throw new Error("COPY_NOT_AVAILABLE");
        }

        if (copy.loans.length > 0) {
          throw new Error("COPY_ALREADY_BORROWED");
        }

        const existingRequest = await tx.borrowRequest.findFirst({
          where: {
            memberId: borrower.id,
            copyId: copy.id,
            status: "PENDING",
          },
          select: {
            id: true,
          },
        });

        if (existingRequest) {
          throw new Error("DUPLICATE_PENDING_REQUEST");
        }

        const borrowingRequest = await tx.borrowRequest.create({
          data: {
            memberId: borrower.id,
            copyId: copy.id,
            status: "PENDING",
          },
          select: {
            id: true,
            requestedAt: true,
            status: true,
          },
        });

        return {
          request: borrowingRequest,
          bookTitle: copy.book.title,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );

        // Notify the librarian after the borrowing request is committed.
    try {
      const [member, librarianEmail] = await Promise.all([
        prisma.user.findUnique({
          where: { id: borrower.id },
          select: { fullName: true, roomNumber: true, email: true },
        }),
        Promise.resolve(process.env.LIBRARIAN_EMAIL),
      ]);

      if (member && librarianEmail && process.env.APP_URL) {
        const dashboardUrl = new URL(
          "/librarian/requests",
          process.env.APP_URL
        );

        await sendEmail({
          to: librarianEmail,
          subject: "New book borrowing request — RS Hostel Library",
          text: `A new borrowing request has been submitted.

Member: ${member.fullName}
Room: ${member.roomNumber}
Email: ${member.email}
Book: ${result.bookTitle}

Review this request in the librarian dashboard:
${dashboardUrl.toString()}

RS Hostel Library`,
        });
      } else {
        console.error("Librarian notification skipped: missing configuration or member.");
      }
    } catch (emailError) {
      console.error("Borrow request notification failed:", emailError);
    }

    return NextResponse.json(
      {
        message: `Your request for "${result.bookTitle}" has been submitted.`,
        request: result.request,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, string> = {
        BORROWER_NOT_ACTIVE:
          "Your account is not active. Please contact the librarian.",
        COPY_NOT_FOUND:
          "This physical book copy could not be found.",
        COPY_NOT_AVAILABLE:
          "This copy is currently unavailable.",
        COPY_ALREADY_BORROWED:
          "This copy has already been borrowed.",
        DUPLICATE_PENDING_REQUEST:
          "You already have a pending request for this copy.",
      };

      if (messages[error.message]) {
        return NextResponse.json(
          { error: messages[error.message] },
          { status: 409 }
        );
      }
    }

    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";

    if (code === "P2002") {
      return NextResponse.json(
        {
          error: "You already have a pending request for this copy.",
        },
        { status: 409 }
      );
    }

    if (code === "P2034") {
      return NextResponse.json(
        {
          error:
            "Another borrowing operation happened at the same time. Please refresh and try again.",
        },
        { status: 409 }
      );
    }

    console.error("Creating borrowing request failed:", error);

    return NextResponse.json(
      { error: "Could not submit your borrowing request." },
      { status: 500 }
    );
  }
}
