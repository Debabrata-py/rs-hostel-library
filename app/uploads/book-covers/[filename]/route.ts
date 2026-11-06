import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Accept only UUID-named WebP cover images.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(
      filename
    )
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const uploadDirectory =
    process.env.COVER_UPLOAD_DIR ||
    path.join(process.cwd(), "public", "uploads", "book-covers");

  try {
    const file = await readFile(path.join(uploadDirectory, filename));

    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new NextResponse("Not found", { status: 404 });
    }

    console.error("Book cover read failed:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
