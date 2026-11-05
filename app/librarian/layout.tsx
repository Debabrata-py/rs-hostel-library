
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LibrarianLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  // Unauthenticated, expired, or inactive sessions.
  if (!user) {
    redirect("/login");
  }

  // Only active librarians may access librarian pages.
  if (user.role !== "LIBRARIAN") {
    redirect("/");
  }

  return <>{children}</>;
}
