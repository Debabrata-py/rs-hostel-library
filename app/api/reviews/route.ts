import { verifySameOrigin } from "@/lib/csrf";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireBorrower } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidBookId(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

async function readJson(request: NextRequest) {
  return readJsonBody(request, 16 * 1024);
}

/**
 * GET /api/reviews?bookId=...
 *
 * Publicly returns reviews for a book.
 * Also tells an authenticated borrower whether they can review it.
 */
export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get("bookId");

    if (!isValidBookId(bookId)) {
      return NextResponse.json(
        { error: "A valid book ID is required." },
        { status: 400 }
      );
    }

    const book = await prisma.book.findFirst({
      where: {
        id: bookId,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!book) {
      return NextResponse.json(
        { error: "Book not found." },
        { status: 404 }
      );
    }

    const user = await getCurrentUser();

    const [reviews, aggregate, existingReview, previousLoan] =
      await Promise.all([
        prisma.review.findMany({
          where: { bookId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            memberId: true,
            rating: true,
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        prisma.review.aggregate({
          where: { bookId },
          _avg: { rating: true },
          _count: { _all: true },
        }),

        user
          ? prisma.review.findUnique({
              where: {
                bookId_memberId: {
                  bookId,
                  memberId: user.id,
                },
              },
              select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
                updatedAt: true,
              },
            })
          : Promise.resolve(null),

        user
          ? prisma.loan.findFirst({
              where: {
                memberId: user.id,
                copy: { bookId },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

    return NextResponse.json({
      averageRating: aggregate._avg.rating,
      reviewCount: aggregate._count._all,

      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        isOwnReview: user?.id === review.memberId,
      })),

      ownReview: existingReview
        ? {
            id: existingReview.id,
            rating: existingReview.rating,
            comment: existingReview.comment,
            createdAt: existingReview.createdAt.toISOString(),
            updatedAt: existingReview.updatedAt.toISOString(),
          }
        : null,

      canReview: Boolean(user && previousLoan && !existingReview),
      canEdit: Boolean(user && previousLoan && existingReview),
    });
  } catch (error) {
    console.error("Get reviews API error:", error);

    return NextResponse.json(
      { error: "Could not load book reviews." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reviews
 *
 * Creates or updates the authenticated borrower's review.
 */
export async function POST(request: NextRequest) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const user = await requireBorrower();

    if (!user) {
      return NextResponse.json(
        { error: "Please log in with an active borrower account." },
        { status: 401 }
      );
    }

    const bodyResult = await readJson(request);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const record = body as Record<string, unknown>;
    const { bookId, rating } = record;
    const comment =
      typeof record.comment === "string" ? record.comment.trim() : "";

    if (!isValidBookId(bookId)) {
      return NextResponse.json(
        { error: "A valid book ID is required." },
        { status: 400 }
      );
    }

    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 5." },
        { status: 400 }
      );
    }

    if (comment.length > 2000) {
      return NextResponse.json(
        { error: "Review comments cannot exceed 2000 characters." },
        { status: 400 }
      );
    }

    const book = await prisma.book.findFirst({
      where: {
        id: bookId,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!book) {
      return NextResponse.json(
        { error: "Book not found." },
        { status: 404 }
      );
    }

    const previousLoan = await prisma.loan.findFirst({
      where: {
        memberId: user.id,
        copy: { bookId },
      },
      select: { id: true },
    });

    if (!previousLoan) {
      return NextResponse.json(
        {
          error: "You can review a book only after you have borrowed it.",
        },
        { status: 403 }
      );
    }

    const review = await prisma.review.upsert({
      where: {
        bookId_memberId: {
          bookId,
          memberId: user.id,
        },
      },
      update: {
        rating,
        comment: comment || null,
      },
      create: {
        bookId,
        memberId: user.id,
        rating,
        comment: comment || null,
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Your review has been saved.",
      review,
    });
  } catch (error) {
    console.error("Save review API error:", error);

    return NextResponse.json(
      { error: "Could not save your review." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reviews
 *
 * Deletes only the authenticated user's own review.
 */
export async function DELETE(request: NextRequest) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const user = await requireBorrower();

    if (!user) {
      return NextResponse.json(
        { error: "Please log in with an active borrower account." },
        { status: 401 }
      );
    }

    const bodyResult = await readJson(request);
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !isValidBookId((body as Record<string, unknown>).bookId)
    ) {
      return NextResponse.json(
        { error: "A valid book ID is required." },
        { status: 400 }
      );
    }

    const result = await prisma.review.deleteMany({
      where: {
        bookId: (body as Record<string, unknown>).bookId as string,
        memberId: user.id,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Your review was not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Your review has been deleted.",
    });
  } catch (error) {
    console.error("Delete review API error:", error);

    return NextResponse.json(
      { error: "Could not delete your review." },
      { status: 500 }
    );
  }
}
