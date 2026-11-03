import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "rs_library_session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return null;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          fullName: true,
          roomNumber: true,
          email: true,
          phone: true,
          role: true,
          status: true,
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
  }

  return {
    sessionId: session.id,
    ...session.user,
  };
}

export async function requireLibrarian() {
  const user = await getCurrentUser();

  if (!user || user.role !== "LIBRARIAN") {
    return null;
  }

  return user;
}

export async function requireMember() {
  const user = await getCurrentUser();

  if (!user || user.role !== "MEMBER") {
    return null;
  }

  return user;
}

/**
 * Both members and librarians may borrow books.
 */
export async function requireBorrower() {
  const user = await getCurrentUser();

  if (
    !user ||
    (user.role !== "MEMBER" && user.role !== "LIBRARIAN")
  ) {
    return null;
  }

  return user;
}