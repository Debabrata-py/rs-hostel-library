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

const conditions = ["GOOD", "WORN", "DAMAGED", "UNDER_REPAIR"] as const;
const statuses = ["AVAILABLE", "UNAVAILABLE", "RETIRED"] as const;
type CopyCondition = (typeof conditions)[number];
type CopyStatus = (typeof statuses)[number];

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

    const copyId = typeof body.copyId === "string" ? body.copyId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(copyId)) {
      return NextResponse.json(
        { message: "Invalid physical copy ID." },
        { status: 400 }
      );
    }

    const shelfLocation =
      typeof body.shelfLocation === "string" ? body.shelfLocation.trim() : "";
    const condition = body.condition;
    const status = body.status;

    if (!shelfLocation || shelfLocation.length > 200) {
      return NextResponse.json(
        { message: "Please provide a valid shelf location." },
        { status: 400 }
      );
    }
    if (typeof condition !== "string" || !conditions.includes(condition as CopyCondition)) {
      return NextResponse.json(
        { message: "Please select a valid physical condition." },
        { status: 400 }
      );
    }
    if (typeof status !== "string" || !statuses.includes(status as CopyStatus)) {
      return NextResponse.json(
        { message: "Please select a valid copy status." },
        { status: 400 }
      );
    }

    const selectedCondition = condition as CopyCondition;
    const selectedStatus = status as CopyStatus;

    if (
      (selectedCondition === "DAMAGED" || selectedCondition === "UNDER_REPAIR") &&
      selectedStatus === "AVAILABLE"
    ) {
      return NextResponse.json(
        {
          message:
            "A damaged or under-repair copy must be marked Unavailable or Retired, not Available.",
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // The same row lock is acquired by the issue endpoint.
      const lockedCopies = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "BookCopy"
        WHERE "id" = ${copyId}::uuid
        FOR UPDATE
      `;
      if (lockedCopies.length === 0) throw new Error("COPY_NOT_FOUND");

      const copy = await tx.bookCopy.findUnique({
        where: { id: copyId },
        select: {
          id: true,
          accessionNumber: true,
          loans: {
            where: { returnedAt: null },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!copy) throw new Error("COPY_NOT_FOUND");
      if (copy.loans.length > 0) throw new Error("COPY_CURRENTLY_BORROWED");

      return tx.bookCopy.update({
        where: { id: copyId },
        data: {
          shelfLocation,
          condition: selectedCondition,
          status: selectedStatus,
        },
        select: {
          id: true,
          accessionNumber: true,
          shelfLocation: true,
          condition: true,
          status: true,
        },
      });
    });

    return NextResponse.json({
      message: `Physical copy ${result.accessionNumber} updated successfully.`,
      copy: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COPY_NOT_FOUND") {
      return NextResponse.json(
        { message: "Physical copy not found." },
        { status: 404 }
      );
    }
    if (error instanceof Error && error.message === "COPY_CURRENTLY_BORROWED") {
      return NextResponse.json(
        {
          message:
            "This copy currently has an active loan. Return it before changing its condition, shelf location or status.",
        },
        { status: 409 }
      );
    }
    console.error("Physical copy update failed:", error);
    return NextResponse.json(
      { message: "Could not update the physical copy. Please try again." },
      { status: 500 }
    );
  }
}
