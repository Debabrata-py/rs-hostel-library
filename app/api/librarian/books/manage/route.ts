import { verifySameOrigin } from "@/lib/csrf";
import { readJsonBody } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibrarian } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidBookId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const categories = ["FICTION", "NON_FICTION", "MAGAZINE"] as const;
const allowedConditions = ["GOOD", "WORN", "DAMAGED", "UNDER_REPAIR"] as const;
type CopyCondition = (typeof allowedConditions)[number];

export async function GET() {
  try {
    const librarian = await requireLibrarian();
    if (!librarian) {
      return NextResponse.json(
        { message: "An active librarian account is required." },
        { status: 403 }
      );
    }

    const books = await prisma.book.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        author: true,
        isbn: true,
        publisher: true,
        publicationYear: true,
        edition: true,
        category: true,
        language: true,
        description: true,
        coverImagePath: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
        copies: {
          orderBy: { accessionNumber: "asc" },
          select: {
            id: true,
            accessionNumber: true,
            shelfLocation: true,
            condition: true,
            status: true,
            loans: {
              where: { returnedAt: null },
              select: { id: true },
              take: 1,
            },
            _count: { select: { loans: true } },
          },
        },
        _count: { select: { copies: true, reviews: true } },
      },
    });

    const result = books.map((book) => {
      const availableCopies = book.copies.filter(
        (copy) =>
          copy.status === "AVAILABLE" &&
          copy.loans.length === 0 &&
          copy.condition !== "DAMAGED" &&
          copy.condition !== "UNDER_REPAIR"
      ).length;
      const borrowedCopies = book.copies.filter(
        (copy) => copy.loans.length > 0
      ).length;

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        publisher: book.publisher,
        publicationYear: book.publicationYear,
        edition: book.edition,
        category: book.category,
        language: book.language,
        description: book.description,
        coverImagePath: book.coverImagePath,
        isArchived: book.isArchived,
        createdAt: book.createdAt.toISOString(),
        updatedAt: book.updatedAt.toISOString(),
        totalCopies: book._count.copies,
        availableCopies,
        borrowedCopies,
        reviewCount: book._count.reviews,
        copies: book.copies.map((copy) => ({
          id: copy.id,
          accessionNumber: copy.accessionNumber,
          shelfLocation: copy.shelfLocation,
          condition: copy.condition,
          status: copy.loans.length > 0 ? "BORROWED" : copy.status,
          totalLoans: copy._count.loans,
        })),
      };
    });

    return NextResponse.json({ books: result });
  } catch (error) {
    console.error("Book management GET error:", error);
    return NextResponse.json(
      { message: "Could not load the book list." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  try {
    const librarian = await requireLibrarian();
    if (!librarian) {
      return NextResponse.json(
        { message: "An active librarian account is required." },
        { status: 403 }
      );
    }

    const bodyResult = await readJsonBody(request, 32768);
    if (!bodyResult.ok) return bodyResult.response;
    const body: unknown = bodyResult.data;

    if (!isRecord(body)) {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }

    const bookId = typeof body.bookId === "string" ? body.bookId : "";
    const action = body.action;
    if (!isValidBookId(bookId)) {
      return NextResponse.json({ message: "Invalid book ID." }, { status: 400 });
    }

    if (action === "EDIT") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const author = typeof body.author === "string" ? body.author.trim() : "";
      const category = body.category;

      if (!title || title.length > 500) {
        return NextResponse.json(
          { message: "Please provide a valid book title." },
          { status: 400 }
        );
      }
      if (!author || author.length > 300) {
        return NextResponse.json(
          { message: "Please provide a valid author name." },
          { status: 400 }
        );
      }
      if (
        typeof category !== "string" ||
        !categories.includes(category as (typeof categories)[number])
      ) {
        return NextResponse.json(
          { message: "Please select a valid book category." },
          { status: 400 }
        );
      }

      const isbn = optionalText(body.isbn);
      const publisher = optionalText(body.publisher);
      const edition = optionalText(body.edition);
      const language = optionalText(body.language);
      const description = optionalText(body.description);

      if (
        isbn === undefined ||
        publisher === undefined ||
        edition === undefined ||
        language === undefined ||
        description === undefined
      ) {
        return NextResponse.json(
          { message: "Invalid book details." },
          { status: 400 }
        );
      }
      if (
        (isbn?.length ?? 0) > 30 ||
        (publisher?.length ?? 0) > 300 ||
        (edition?.length ?? 0) > 100 ||
        (language?.length ?? 0) > 100 ||
        (description?.length ?? 0) > 10000
      ) {
        return NextResponse.json(
          { message: "One or more book details are too long." },
          { status: 400 }
        );
      }

      let publicationYear: number | null = null;
      if (body.publicationYear !== null && body.publicationYear !== "") {
        publicationYear = Number(body.publicationYear);
        if (
          !Number.isInteger(publicationYear) ||
          publicationYear < 1 ||
          publicationYear > 9999
        ) {
          return NextResponse.json(
            { message: "Please provide a valid publication year." },
            { status: 400 }
          );
        }
      }

      try {
        const updated = await prisma.book.update({
          where: { id: bookId },
          data: {
            title,
            author,
            isbn,
            publisher,
            publicationYear,
            edition,
            category: category as (typeof categories)[number],
            language,
            description,
          },
          select: { id: true, title: true },
        });
        return NextResponse.json({
          message: "Book details updated successfully.",
          book: updated,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          return NextResponse.json(
            { message: "Another book already uses this ISBN." },
            { status: 409 }
          );
        }
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2025"
        ) {
          return NextResponse.json({ message: "Book not found." }, { status: 404 });
        }
        throw error;
      }
    }

    if (action !== "ARCHIVE" && action !== "RESTORE") {
      return NextResponse.json({ message: "Invalid action." }, { status: 400 });
    }

    const shouldArchive = action === "ARCHIVE";

    // PostgreSQL UPDATE takes a row lock. The add-copy transaction locks this
    // same row before checking isArchived and inserting copies.
    const updated = await prisma.book.updateMany({
      where: { id: bookId, isArchived: !shouldArchive },
      data: { isArchived: shouldArchive },
    });

    if (updated.count !== 1) {
      const existing = await prisma.book.findUnique({
        where: { id: bookId },
        select: { isArchived: true },
      });
      if (!existing) {
        return NextResponse.json({ message: "Book not found." }, { status: 404 });
      }
      return NextResponse.json(
        {
          message: shouldArchive
            ? "This book is already archived."
            : "This book is already active.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: shouldArchive
        ? "Book archived successfully."
        : "Book restored successfully.",
      bookId,
      isArchived: shouldArchive,
    });
  } catch (error) {
    console.error("Book management PATCH error:", error);
    return NextResponse.json(
      { message: "Could not update the book. Please try again." },
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
        { message: "An active librarian account is required." },
        { status: 403 }
      );
    }

    const bodyResult = await readJsonBody(request, 32768);
    if (!bodyResult.ok) return bodyResult.response;
    const body: unknown = bodyResult.data;

    if (!isRecord(body)) {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }

    const bookId = typeof body.bookId === "string" ? body.bookId : "";
    if (!isValidBookId(bookId)) {
      return NextResponse.json({ message: "Invalid book ID." }, { status: 400 });
    }
    if (
      !Array.isArray(body.copies) ||
      body.copies.length < 1 ||
      body.copies.length > 100
    ) {
      return NextResponse.json(
        { message: "Add between 1 and 100 physical copies." },
        { status: 400 }
      );
    }

    const accessionNumbers = new Set<string>();
    const copies: {
      bookId: string;
      accessionNumber: string;
      shelfLocation: string;
      condition: CopyCondition;
      status: "AVAILABLE" | "UNAVAILABLE";
    }[] = [];

    for (const item of body.copies) {
      if (!isRecord(item)) {
        return NextResponse.json(
          { message: "Invalid physical copy information." },
          { status: 400 }
        );
      }
      const accessionNumber =
        typeof item.accessionNumber === "string"
          ? item.accessionNumber.trim()
          : "";
      const shelfLocation =
        typeof item.shelfLocation === "string"
          ? item.shelfLocation.trim()
          : "";
      const condition = item.condition;

      if (
        !accessionNumber ||
        accessionNumber.length > 100 ||
        !shelfLocation ||
        shelfLocation.length > 200 ||
        typeof condition !== "string" ||
        !allowedConditions.includes(condition as CopyCondition)
      ) {
        return NextResponse.json(
          {
            message:
              "Check the accession number, shelf location and condition of every copy.",
          },
          { status: 400 }
        );
      }
      if (accessionNumbers.has(accessionNumber)) {
        return NextResponse.json(
          {
            message:
              "Accession numbers must be unique within this submission.",
          },
          { status: 400 }
        );
      }
      accessionNumbers.add(accessionNumber);

      const selectedCondition = condition as CopyCondition;
      copies.push({
        bookId,
        accessionNumber,
        shelfLocation,
        condition: selectedCondition,
        status:
          selectedCondition === "DAMAGED" ||
          selectedCondition === "UNDER_REPAIR"
            ? "UNAVAILABLE"
            : "AVAILABLE",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock the book row so an archive operation cannot race with copy creation.
      const lockedBooks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Book"
        WHERE "id" = ${bookId}::uuid
        FOR UPDATE
      `;
      if (lockedBooks.length === 0) throw new Error("BOOK_NOT_FOUND");

      const book = await tx.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true, isArchived: true },
      });
      if (!book) throw new Error("BOOK_NOT_FOUND");
      if (book.isArchived) throw new Error("BOOK_ARCHIVED");

      const created = await tx.bookCopy.createMany({
        data: copies,
        skipDuplicates: false,
      });
      return { count: created.count, title: book.title };
    });

    return NextResponse.json(
      {
        message: `${result.count} physical copy/copies added successfully to "${result.title}".`,
        addedCopies: result.count,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOOK_NOT_FOUND") {
      return NextResponse.json({ message: "Book not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "BOOK_ARCHIVED") {
      return NextResponse.json(
        { message: "Restore this book before adding physical copies." },
        { status: 409 }
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          message:
            "One or more accession numbers are already registered. Please check them and try again.",
        },
        { status: 409 }
      );
    }
    console.error("Adding physical copies failed:", error);
    return NextResponse.json(
      { message: "Could not add physical copies. Please try again." },
      { status: 500 }
    );
  }
}
