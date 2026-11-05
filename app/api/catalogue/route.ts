
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [books, loanCounts, reviewStats] = await Promise.all([
      prisma.book.findMany({
        where: {
          isArchived: false,
        },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          author: true,
          category: true,
          description: true,
          isbn: true,
          coverImagePath: true,
          createdAt: true,
          copies: {
            select: {
              id: true,
              accessionNumber: true,
              shelfLocation: true,
              status: true,
              loans: {
                where: { returnedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),

      prisma.loan.groupBy({
        by: ["copyId"],
        _count: {
          _all: true,
        },
      }),

      prisma.review.groupBy({
        by: ["bookId"],
        _avg: {
          rating: true,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const loanCountByCopy = new Map(
      loanCounts.map((entry) => [
        entry.copyId,
        entry._count._all,
      ])
    );

    const reviewStatsByBook = new Map(
      reviewStats.map((entry) => [
        entry.bookId,
        {
          averageRating: entry._avg.rating,
          reviewCount: entry._count._all,
        },
      ])
    );

    const catalogue = books.map((book) => {
      const shelfLocations = new Set<string>();
      let availableCopies = 0;
      let borrowedCopies = 0;
      let totalReads = 0;

      const copies = book.copies.map((copy) => {
        shelfLocations.add(copy.shelfLocation);

        const isBorrowed = copy.loans.length > 0;

        if (isBorrowed) {
          borrowedCopies++;
        } else if (copy.status === "AVAILABLE") {
          availableCopies++;
        }

        totalReads += loanCountByCopy.get(copy.id) ?? 0;

        return {
          id: copy.id,
          accession_number: copy.accessionNumber,
          shelf_location: copy.shelfLocation,
          status: isBorrowed ? "BORROWED" : copy.status,
        };
      });

      const reviewStats = reviewStatsByBook.get(book.id);

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category
          .replace("_", "-")
          .toLowerCase()
          .replace(/^./, (letter) => letter.toUpperCase()),
        description: book.description,
        isbn: book.isbn,
        cover_image_path: book.coverImagePath,
        created_at: book.createdAt.toISOString(),
        shelf_locations: Array.from(shelfLocations).join(", "),
        available_copies: availableCopies,
        borrowed_copies: borrowedCopies,
        total_reads: totalReads,
        average_rating: reviewStats?.averageRating ?? null,
        review_count: reviewStats?.reviewCount ?? 0,
        copies,
      };
    });

    return NextResponse.json(catalogue);
  } catch (error) {
    console.error("Catalogue API error:", error);

    return NextResponse.json(
      { error: "Could not load the library catalogue." },
      { status: 500 }
    );
  }
}
