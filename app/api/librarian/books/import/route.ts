
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { verifySameOrigin } from "@/lib/csrf";
import { readFormDataBody } from "@/lib/request-body";
import { requireLibrarian } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;
const MAX_FILE_SIZE = 3 * 1024 * 1024;

const categories: Record<string, "FICTION" | "NON_FICTION" | "MAGAZINE"> = {
  fiction: "FICTION",
  "non-fiction": "NON_FICTION",
  non_fiction: "NON_FICTION",
  magazine: "MAGAZINE",
};

const conditions: Record<string, "GOOD" | "WORN" | "DAMAGED" | "UNDER_REPAIR"> = {
  good: "GOOD",
  worn: "WORN",
  damaged: "DAMAGED",
  under_repair: "UNDER_REPAIR",
};

type ImportRow = {
  row: number;
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  publicationYear: number | null;
  edition: string | null;
  category: "FICTION" | "NON_FICTION" | "MAGAZINE";
  language: string | null;
  description: string | null;
  accessionNumber: string;
  shelfLocation: string;
  condition: "GOOD" | "WORN" | "DAMAGED" | "UNDER_REPAIR";
};

type RowError = { row: number; message: string };

function cellText(value: ExcelJS.Cell): string {
  return String(value.text ?? "").trim();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const aliases: Record<string, string> = {
  title: "title",
  booktitle: "title",
  author: "author",
  authors: "author",
  isbn: "isbn",
  publisher: "publisher",
  publicationyear: "publicationYear",
  year: "publicationYear",
  edition: "edition",
  category: "category",
  language: "language",
  description: "description",
  accessionnumber: "accessionNumber",
  accessionno: "accessionNumber",
  accession: "accessionNumber",
  shelf: "shelfLocation",
  shelflocation: "shelfLocation",
  condition: "condition",
};

async function readRows(file: File) {
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    throw new Error("File must be between 1 byte and 3 MB.");
  }

  const extension = file.name.toLowerCase().split(".").pop();
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();

  if (extension === "xlsx") {
    await workbook.xlsx.load(buffer as never);
  } else if (extension === "csv") {
    await workbook.csv.read(Readable.from([buffer]));
  } else {
    throw new Error("Only .csv and .xlsx files are supported.");
  }

  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 2) {
    throw new Error("The spreadsheet must contain a header and at least one data row.");
  }

  if (sheet.rowCount > MAX_ROWS + 1) {
    throw new Error(`A maximum of ${MAX_ROWS} data rows is allowed.`);
  }

  const headers = new Map<number, string>();

  sheet.getRow(1).eachCell((cell, column) => {
    const header = normalizeHeader(cellText(cell));
    if (aliases[header]) headers.set(column, aliases[header]);
  });

  const required = [
    "title",
    "author",
    "category",
    "accessionNumber",
    "shelfLocation",
  ];

  const available = new Set(headers.values());
  const missing = required.filter((field) => !available.has(field));

  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}.`);
  }

  const rows: { row: number; values: Record<string, string> }[] = [];

  sheet.eachRow((sheetRow, rowNumber) => {
    if (rowNumber === 1) return;

    const values: Record<string, string> = {};

    for (const [column, field] of headers) {
      values[field] = cellText(sheetRow.getCell(column));
    }

    if (Object.values(values).every((value) => !value)) return;

    rows.push({ row: rowNumber, values });
  });

  if (!rows.length) throw new Error("No book records were found.");

  return rows;
}

function validateRows(
  source: { row: number; values: Record<string, string> }[]
) {
  const valid: ImportRow[] = [];
  const errors: RowError[] = [];
  const accessionSeen = new Set<string>();
  const isbnSeen = new Map<string, string>();

  for (const entry of source) {
    const v = entry.values;
    const title = v.title?.trim() ?? "";
    const author = v.author?.trim() ?? "";
    const category = categories[(v.category ?? "").trim().toLowerCase()];
    const accessionNumber = v.accessionNumber?.trim() ?? "";
    const shelfLocation = v.shelfLocation?.trim() ?? "";
    const condition = conditions[(v.condition || "good").trim().toLowerCase()];

    const fail = (message: string) => {
      errors.push({ row: entry.row, message });
    };

    if (!title || title.length > 500) {
      fail("Title is required and must be at most 500 characters.");
      continue;
    }
    if (!author || author.length > 300) {
      fail("Author is required and must be at most 300 characters.");
      continue;
    }
    if (!category) {
      fail("Category must be Fiction, Non-fiction, or Magazine.");
      continue;
    }
    if (!accessionNumber || accessionNumber.length > 100) {
      fail("A valid accession number is required.");
      continue;
    }
    if (!shelfLocation || shelfLocation.length > 200) {
      fail("A valid shelf location is required.");
      continue;
    }
    if (!condition) {
      fail("Condition must be good, worn, damaged, or under_repair.");
      continue;
    }

    const isbn = v.isbn?.trim() || null;
    const publisher = v.publisher?.trim() || null;
    const edition = v.edition?.trim() || null;
    const language = v.language?.trim() || null;
    const description = v.description?.trim() || null;

    if (isbn && isbn.length > 30) {
      fail("ISBN must be at most 30 characters.");
      continue;
    }
    if (publisher && publisher.length > 300) {
      fail("Publisher must be at most 300 characters.");
      continue;
    }
    if (edition && edition.length > 100) {
      fail("Edition must be at most 100 characters.");
      continue;
    }
    if (language && language.length > 100) {
      fail("Language must be at most 100 characters.");
      continue;
    }
    if (description && description.length > 10000) {
      fail("Description must be at most 10,000 characters.");
      continue;
    }

    let publicationYear: number | null = null;
    if (v.publicationYear) {
      publicationYear = Number(v.publicationYear);
      if (
        !Number.isInteger(publicationYear) ||
        publicationYear < 1 ||
        publicationYear > 9999
      ) {
        fail("Publication year must be a valid year.");
        continue;
      }
    }

    const normalizedAccession = accessionNumber.toLowerCase();
    if (accessionSeen.has(normalizedAccession)) {
      fail("Duplicate accession number within this spreadsheet.");
      continue;
    }
    accessionSeen.add(normalizedAccession);

    if (isbn) {
      const key = isbn.toLowerCase();
      const identity = `${title.toLowerCase()}|${author.toLowerCase()}`;
      const previous = isbnSeen.get(key);

      if (previous && previous !== identity) {
        fail("The same ISBN has conflicting book titles or authors.");
        continue;
      }
      isbnSeen.set(key, identity);
    }

    valid.push({
      row: entry.row,
      title,
      author,
      isbn,
      publisher,
      publicationYear,
      edition,
      category,
      language,
      description,
      accessionNumber,
      shelfLocation,
      condition,
    });
  }

  return { valid, errors };
}

function groupBooks(rows: ImportRow[]) {
  const groups = new Map<string, ImportRow[]>();

  for (const row of rows) {
    const key = row.isbn
      ? `isbn:${row.isbn.toLowerCase()}`
      : `title:${row.title.toLowerCase()}|${row.author.toLowerCase()}`;

    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()];
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

    const body = await readFormDataBody(request, 4 * 1024 * 1024);
    if (!body.ok) return body.response;

    const file = body.data.get("file");
    const action = body.data.get("action");

    if (!(file instanceof File) || typeof action !== "string") {
      return NextResponse.json(
        { message: "Choose a spreadsheet and an action." },
        { status: 400 }
      );
    }

    if (action !== "preview" && action !== "import") {
      return NextResponse.json({ message: "Invalid action." }, { status: 400 });
    }

    const source = await readRows(file);
    const { valid, errors } = validateRows(source);
    const groups = groupBooks(valid);

    const existingAccessions = await prisma.bookCopy.findMany({
      where: {
        accessionNumber: { in: valid.map((r) => r.accessionNumber) },
      },
      select: { accessionNumber: true },
    });

    const existingIsbns = await prisma.book.findMany({
      where: {
        isbn: { in: [...new Set(valid.map((r) => r.isbn).filter((v): v is string => Boolean(v)))] },
      },
      select: { isbn: true },
    });

    for (const item of existingAccessions) {
      const row = valid.find((r) => r.accessionNumber === item.accessionNumber);
      if (row) errors.push({ row: row.row, message: "Accession number already exists in the library." });
    }

    for (const item of existingIsbns) {
      const matching = valid.filter((r) => r.isbn === item.isbn);
      for (const row of matching) {
        errors.push({ row: row.row, message: "ISBN already exists in the library. Importing additional copies of an existing book is not supported by this import." });
      }
    }

    if (action === "preview") {
      return NextResponse.json({
        message: errors.length
          ? "Preview completed with errors. Correct them before importing."
          : "Preview successful. No database changes have been made.",
        totalRows: source.length,
        validRows: valid.length,
        bookCount: groups.length,
        copyCount: valid.length,
        errors,
        preview: groups.slice(0, 20).map((group) => ({
          title: group[0].title,
          author: group[0].author,
          category: group[0].category,
          copies: group.length,
        })),
      });
    }

    if (errors.length) {
      return NextResponse.json(
        {
          message: "Import cancelled. Correct all preview errors first.",
          errors,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const group of groups) {
          const first = group[0];

          await tx.book.create({
            data: {
              title: first.title,
              author: first.author,
              isbn: first.isbn,
              publisher: first.publisher,
              publicationYear: first.publicationYear,
              edition: first.edition,
              category: first.category,
              language: first.language,
              description: first.description,
              copies: {
                create: group.map((row) => ({
                  accessionNumber: row.accessionNumber,
                  shelfLocation: row.shelfLocation,
                  condition: row.condition,
                  status: "AVAILABLE",
                })),
              },
            },
          });
        }
      },
      { maxWait: 10000, timeout: 30000 }
    );

    return NextResponse.json(
      {
        message: "Books and physical copies imported successfully.",
        booksImported: groups.length,
        copiesImported: valid.length,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "A duplicate ISBN or accession number was detected. No records were imported." },
        { status: 409 }
      );
    }

    console.error("Book import failed:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Could not process the spreadsheet.",
      },
      { status: 400 }
    );
  }
}
