import { verifySameOrigin } from "@/lib/csrf";
import { readFormDataBody } from "@/lib/request-body";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireLibrarian } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_COVER_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

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

function readOptionalText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return undefined;
  return trimmed || null;
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
  const csrfResponse = verifySameOrigin(request);
  if (csrfResponse) return csrfResponse;

  let savedCoverPath: string | null = null;

  try {
    const librarian = await requireLibrarian();

    if (!librarian) {
      return NextResponse.json(
        { message: "An active librarian account is required." },
        { status: 403 }
      );
    }

    const formDataResult = await readFormDataBody(request, 6 * 1024 * 1024);
    if (!formDataResult.ok) return formDataResult.response;
    const formData = formDataResult.data;
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
      !Object.prototype.hasOwnProperty.call(categoryMap, input.category)
    ) {
      return NextResponse.json(
        { message: "Choose Fiction, Non-fiction, or Magazine." },
        { status: 400 }
      );
    }

    const isbn = readOptionalText(input.isbn, 30);
    const publisher = readOptionalText(input.publisher, 300);
    const edition = readOptionalText(input.edition, 100);
    const language = readOptionalText(input.language, 100);
    const description = readOptionalText(input.description, 10000);

    if (
      isbn === undefined ||
      publisher === undefined ||
      edition === undefined ||
      language === undefined ||
      description === undefined
    ) {
      return NextResponse.json(
        { message: "Check the optional book details. One or more fields are invalid or too long." },
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
        !Object.prototype.hasOwnProperty.call(conditionMap, condition)
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
      (typeof year !== "number" ||
        !Number.isInteger(year) ||
        year < 1 ||
        year > 9999)
    ) {
      return NextResponse.json(
        { message: "Enter a valid publication year." },
        { status: 400 }
      );
    }

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

      let normalizedBuffer: Buffer;

      try {
        const metadata = await sharp(buffer, {
          limitInputPixels: MAX_IMAGE_PIXELS,
          animated: true,
        }).metadata();

        const expectedFormat = {
          "image/jpeg": "jpeg",
          "image/png": "png",
          "image/webp": "webp",
        }[cover.type];

        if (
          !expectedFormat ||
          metadata.format !== expectedFormat ||
          !metadata.width ||
          !metadata.height ||
          metadata.width > 10000 ||
          metadata.height > 10000 ||
          metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
          (metadata.pages ?? 1) > 1
        ) {
          return NextResponse.json(
            { message: "Invalid, oversized, or animated cover image." },
            { status: 400 }
          );
        }

        normalizedBuffer = await sharp(buffer, {
          limitInputPixels: MAX_IMAGE_PIXELS,
        })
          .rotate()
          .resize({
            width: 1200,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({
            quality: 82,
            effort: 4,
          })
          .toBuffer();
      } catch {
        return NextResponse.json(
          { message: "The uploaded file is not a valid image." },
          { status: 400 }
        );
      }

      const filename = `${randomUUID()}.webp`;
const uploadDirectory =
  process.env.COVER_UPLOAD_DIR ||
  path.join(
    process.cwd(),
    "public",
    "uploads",
    "book-covers"
  );
      await mkdir(uploadDirectory, { recursive: true });

      savedCoverPath = path.join(uploadDirectory, filename);
      await writeFile(savedCoverPath, normalizedBuffer);

      coverImagePath = `/uploads/book-covers/${filename}`;
    }

    const book = await prisma.$transaction(async (tx) => {
      return tx.book.create({
        data: {
          title,
          author,
          isbn,
          publisher,
          publicationYear: year,
          edition,
          category: categoryMap[input.category],
          language,
          description,
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

    if (isRecord(error) && error.code === "P2002") {
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
