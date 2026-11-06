
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

// Calculate midnight in India Standard Time.
function istStartOfDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(
    Date.UTC(get("year"), get("month") - 1, get("day"), -5, -30)
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type ReminderType = "BOOK_DUE_REMINDER" | "BOOK_OVERDUE";

async function sendTrackedReminder(
  loan: {
    id: string;
    memberId: string;
    member: { fullName: string; email: string };
    copy: { book: { title: string } };
    dueAt: Date;
  },
  type: ReminderType
): Promise<"sent" | "skipped" | "failed"> {
  const subject =
    type === "BOOK_DUE_REMINDER"
      ? `Reminder: "${loan.copy.book.title}" is due soon`
      : `Overdue book: "${loan.copy.book.title}"`;

  let notificationId: string;

  try {
    const notification = await prisma.emailNotification.create({
      data: {
        userId: loan.memberId,
        loanId: loan.id,
        type,
        recipientEmail: loan.member.email,
        subject,
        status: "QUEUED",
      },
      select: { id: true },
    });

    notificationId = notification.id;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";

    if (code !== "P2002") {
      console.error("Could not create reminder record:", error);
      return "failed";
    }

    // A reminder already exists. Do not send it again unless it failed
    // previously or was left queued for more than 15 minutes.
    const existing = await prisma.emailNotification.findUnique({
      where: {
        loanId_type: {
          loanId: loan.id,
          type,
        },
      },
      select: { id: true, status: true, scheduledAt: true },
    });

    if (!existing || existing.status === "SENT") return "skipped";

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);

    const claimed = await prisma.emailNotification.updateMany({
      where: {
        id: existing.id,
        OR: [
          { status: "FAILED" },
          { status: "QUEUED", scheduledAt: { lt: staleBefore } },
        ],
      },
      data: { status: "QUEUED", scheduledAt: new Date() },
    });

    if (claimed.count !== 1) return "skipped";

    notificationId = existing.id;
  }

  try {
    const dueDate = formatDate(loan.dueAt);
    const isOverdue = type === "BOOK_OVERDUE";

    const text = isOverdue
      ? `Hello ${loan.member.fullName},

The following book borrowed from the RS Hostel Library is overdue:

Book: ${loan.copy.book.title}
Due date: ${dueDate}

Please return the book to the library as soon as possible.

If you have already returned it, please contact the librarian.

RS Hostel Library`
      : `Hello ${loan.member.fullName},

This is a friendly reminder that the following book is due soon:

Book: ${loan.copy.book.title}
Due date: ${dueDate}

Please return the book on or before the due date.

RS Hostel Library`;

    await sendEmail({
      to: loan.member.email,
      subject,
      text,
    });

    await prisma.emailNotification.update({
      where: { id: notificationId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    return "sent";
  } catch (error) {
    console.error(`Reminder email failed for loan ${loan.id}:`, error);

    await prisma.emailNotification.update({
      where: { id: notificationId },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError:
          error instanceof Error ? error.message.slice(0, 1000) : "Email failed",
      },
    });

    return "failed";
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = istStartOfDay(now);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const fourDaysStart = new Date(
      todayStart.getTime() + 4 * 24 * 60 * 60 * 1000
    );

    // Include books due within the next 1–3 calendar days.
    // This also catches reminders missed during a temporary server outage.
    const [dueLoans, overdueLoans] = await Promise.all([
      prisma.loan.findMany({
        where: {
          returnedAt: null,
          dueAt: {
            gte: tomorrowStart,
            lt: fourDaysStart,
          },
        },
        orderBy: { dueAt: "asc" },
        take: 500,
        select: {
          id: true,
          memberId: true,
          dueAt: true,
          member: { select: { fullName: true, email: true } },
          copy: { select: { book: { select: { title: true } } } },
        },
      }),
      prisma.loan.findMany({
        where: {
          returnedAt: null,
          dueAt: { lt: todayStart },
        },
        orderBy: { dueAt: "asc" },
        take: 500,
        select: {
          id: true,
          memberId: true,
          dueAt: true,
          member: { select: { fullName: true, email: true } },
          copy: { select: { book: { select: { title: true } } } },
        },
      }),
    ]);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const loan of dueLoans) {
      const result = await sendTrackedReminder(loan, "BOOK_DUE_REMINDER");
      if (result === "sent") sent++;
      else if (result === "failed") failed++;
      else skipped++;
    }

    for (const loan of overdueLoans) {
      const result = await sendTrackedReminder(loan, "BOOK_OVERDUE");
      if (result === "sent") sent++;
      else if (result === "failed") failed++;
      else skipped++;
    }

    return NextResponse.json({
      message: "Loan reminder check completed.",
      dueRemindersChecked: dueLoans.length,
      overdueRemindersChecked: overdueLoans.length,
      sent,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("Automatic loan reminder job failed:", error);
    return NextResponse.json(
      { error: "Could not process loan reminders." },
      { status: 500 }
    );
  }
}
