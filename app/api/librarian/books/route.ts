
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireLibrarian } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_COVER_SIZE = 5 * 1024 * 1024;

const categoryMap = {
  Fiction: "FICTION",
  "Non-fiction": "NON_FICTION",
  Magazine: "MAGAZINE",
} as const;

const conditionMap = {
  good: "GOOD",
  worn: "WORN",
  damaged: "DAMAGED",
  under_repair: "UNDER_REPAIR",
} as const;

type BookCategoryInput = keyof typeof categoryMap;
type CopyConditionInput = keyof typeof conditionMap;

type BookInput = {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publicationYear?: number | null;
  edition?: string;
  category: BookCategoryInput;
  language?: string;
  description?: string;
  copies: {
    accessionNumber: string;
    shelf: string;
    condition: CopyConditionInput;
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidImageSignature(
  buffer: Buffer,
  mimeType: string
): boolean {
  if (mimeType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      )
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

export async function POST(request: NextRequest) {
  let savedCoverPath: string | null = null;

  try {
    const librarian = await requireLibrarian();

    if (!librarian) {
      return NextResponse.json(
        { message: "An active librarian account is required." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const rawBook = formData.get("book");

    if (typeof rawBook !== "string") {
      return NextResponse.json(
        { message: "Book information is missing." },
        { status: 400 }
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBook);
    } catch {
      return NextResponse.json(
        { message: "Invalid book information." },
        { status: 400 }
      );
    }

    if (!isRecord(parsed)) {
      return NextResponse.json(
        { message: "Invalid book information." },
        { status: 400 }
      );
    }

    const input = parsed as unknown as BookInput;

    const title = typeof input.title === "string" ? input.title.trim() : "";
    const author = typeof input.author === "string" ? input.author.trim() : "";

    if (!title || !author || title.length > 500 || author.length > 300) {
      return NextResponse.json(
        { message: "A valid book title and author are required." },
        { status: 400 }
      );
    }

    if (
      typeof input.category !== "string" ||
      !(input.category in categoryMap)
    ) {
      return NextResponse.json(
        { message: "Choose Fiction, Non-fiction, or Magazine." },
        { status: 400 }
      );
    }

    if (!Array.isArray(input.copies) || input.copies.length < 1 || input.copies.length > 100) {
      return NextResponse.json(
        { message: "Add between 1 and 100 physical copies." },
        { status: 400 }
      );
    }

    const accessionNumbers = new Set<string>();

const copies: {
  accessionNumber: string;
  shelfLocation: string;
  condition: "GOOD" | "WORN" | "DAMAGED" | "UNDER_REPAIR";
  status: "AVAILABLE";
}[] = [];

    for (const copy of input.copies) {
      if (!isRecord(copy)) {
        return NextResponse.json(
          { message: "Invalid physical copy information." },
          { status: 400 }
        );
      }

      const accessionNumber =
        typeof copy.accessionNumber === "string"
          ? copy.accessionNumber.trim()
          : "";

      const shelf =
        typeof copy.shelf === "string" ? copy.shelf.trim() : "";

      const condition =
        typeof copy.condition === "string" ? copy.condition : "";

      if (
        !accessionNumber ||
        accessionNumber.length > 100 ||
        !shelf ||
        shelf.length > 200 ||
        !(condition in conditionMap)
      ) {
        return NextResponse.json(
          { message: "Check the accession number, shelf, and condition of every copy." },
          { status: 400 }
        );
      }

      if (accessionNumbers.has(accessionNumber)) {
        return NextResponse.json(
          { message: "Accession numbers must be unique." },
          { status: 400 }
        );
      }

      accessionNumbers.add(accessionNumber);

      copies.push({
        accessionNumber,
        shelfLocation: shelf,
        condition: conditionMap[condition as CopyConditionInput],
        status: "AVAILABLE" as const,
      });
    }

    const year = input.publicationYear ?? null;

    if (
      year !== null &&
      (!Number.isInteger(year) || year < 1 || year > 9999)
    ) {
      return NextResponse.json(
        { message: "Enter a valid publication year." },
        { status: 400 }
      );
    }

    const isbn =
      typeof input.isbn === "string" && input.isbn.trim()
        ? input.isbn.trim()
        : null;

    const cover = formData.get("cover");
    let coverImagePath: string | null = null;

    if (cover !== null) {
      if (!(cover instanceof File) || cover.size > MAX_COVER_SIZE) {
        return NextResponse.json(
          { message: "The cover image must be no larger than 5 MB." },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await cover.arrayBuffer());

      if (!hasValidImageSignature(buffer, cover.type)) {
        return NextResponse.json(
          { message: "The cover must be a valid JPEG, PNG, or WebP image." },
          { status: 400 }
        );
      }

      const extension =
        cover.type === "image/jpeg"
          ? "jpg"
          : cover.type === "image/png"
            ? "png"
            : "webp";

      const filename = `${randomUUID()}.${extension}`;
      const uploadDirectory = path.join(
        process.cwd(),
        "public",
        "uploads",
        "book-covers"
      );

      await mkdir(uploadDirectory, { recursive: true });

      savedCoverPath = path.join(uploadDirectory, filename);
      await writeFile(savedCoverPath, buffer);

      coverImagePath = `/uploads/book-covers/${filename}`;
    }

    const book = await prisma.$transaction(async (tx) => {
      return tx.book.create({
        data: {
          title,
          author,
          isbn,
          publisher: input.publisher?.trim() || null,
          publicationYear: year,
          edition: input.edition?.trim() || null,
          category: categoryMap[input.category],
          language: input.language?.trim() || null,
          description: input.description?.trim() || null,
          coverImagePath,
          copies: {
            create: copies,
          },
        },
        select: {
          id: true,
          title: true,
          _count: {
            select: { copies: true },
          },
        },
      });
    });

    return NextResponse.json(
      {
        message: "Book and physical copies added successfully.",
        book,
      },
      { status: 201 }
    );
  } catch (error) {
    if (savedCoverPath) {
      await unlink(savedCoverPath).catch(() => undefined);
    }

    if (
      isRecord(error) &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "This ISBN or accession number is already registered." },
        { status: 409 }
      );
    }

    console.error("Book creation failed:", error);

    return NextResponse.json(
      { message: "Could not save the book. Please try again." },
      { status: 500 }
    );
  }
}
