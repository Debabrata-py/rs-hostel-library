"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MemberProfile = {
  fullName: string;
  roomNumber: string;
  email: string;
  phone: string | null;
  status: string;
};

type BorrowRequest = {
  id: string;
  requestedAt: string;
  status: string;
  decisionNote: string | null;
  copy: {
    accessionNumber: string;
    book: {
      title: string;
      author: string;
    } | null;
  } | null;
  loan: {
    id: string;
    issuedAt: string;
    dueAt: string;
    returnedAt: string | null;
  } | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function getStatusStyle(status: string, returned: boolean) {
  if (returned) {
    return "bg-blue-100 text-blue-800";
  }

  switch (status) {
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "FULFILLED":
      return "bg-indigo-100 text-indigo-800";
    case "CANCELLED":
      return "bg-stone-100 text-stone-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function getStatusLabel(status: string, returned: boolean) {
  if (returned) return "Returned";

  switch (status) {
    case "PENDING":
      return "Pending";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "FULFILLED":
      return "Book issued";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

export default function MemberDashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [requests, setRequests] = useState<BorrowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/member/requests", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load your dashboard.");
      }

      setProfile(data.profile);
      setRequests(data.requests ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load your dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-[#eaf5f8] px-5 py-10 text-[#30231f] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#367f96]">
              RS Hostel Library
            </p>

            <h1 className="mt-2 font-serif text-3xl font-bold text-[#2f7186]">
              My library account
            </h1>
          </div>

          <button
            onClick={() => void handleLogout()}
            className="rounded-lg border border-[#b9d9e3] bg-white px-4 py-2 text-sm hover:bg-[#f8fcfd]"
          >
            Sign out
          </button>
        </header>

        {loading ? (
          <p className="mt-10 rounded-xl bg-white p-8 text-center text-[#668b95]">
            Loading your account...
          </p>
        ) : error ? (
          <div
            role="alert"
            className="mt-8 rounded-xl bg-red-50 p-5 text-red-800"
          >
            {error}

            <button
              onClick={() => void loadDashboard()}
              className="ml-3 font-semibold underline"
            >
              Try again
            </button>
          </div>
        ) : profile ? (
          <>
            <section className="mt-8 rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-6 shadow-sm">
              <h2 className="font-serif text-xl font-bold text-[#2f7186]">
                Welcome, {profile.fullName}
              </h2>

              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[#668b95]">Room number</dt>
                  <dd className="mt-1 font-medium">{profile.roomNumber}</dd>
                </div>

                <div>
                  <dt className="text-[#668b95]">Email</dt>
                  <dd className="mt-1 break-all font-medium">
                    {profile.email}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#668b95]">Mobile number</dt>
                  <dd className="mt-1 font-medium">
                    {profile.phone || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-[#668b95]">Account status</dt>
                  <dd className="mt-1 font-medium text-emerald-700">
                    Active
                  </dd>
                </div>
              </dl>
            </section>

            <section className="mt-8 rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-bold text-[#2f7186]">
                  My borrowing history
                </h2>

                <button
                  onClick={() => void loadDashboard()}
                  disabled={loading}
                  className="rounded-lg border border-[#b9d9e3] px-3 py-2 text-sm hover:bg-[#eaf5f8] disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              {requests.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#668b95]">
                  You haven&apos;t made any borrowing requests yet.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {requests.map((request) => {
                    const returned = Boolean(request.loan?.returnedAt);

                    return (
                      <article
                        key={request.id}
                        className="rounded-xl border border-[#d4e8ee] bg-white p-4"
                      >
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">
                              {request.copy?.book?.title ?? "Book unavailable"}
                            </h3>

                            <p className="mt-1 text-sm text-[#668b95]">
                              by {request.copy?.book?.author ?? "Unknown author"}
                            </p>

                            <p className="mt-2 text-xs text-[#668b95]">
                              Accession number:{" "}
                              {request.copy?.accessionNumber ?? "—"}
                            </p>
                          </div>

                          <span
                            className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(
                              request.status,
                              returned
                            )}`}
                          >
                            {getStatusLabel(request.status, returned)}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-xs text-[#668b95]">
                          <p>
                            Requested: {formatDate(request.requestedAt)}
                          </p>

                          {request.loan && (
                            <>
                              <p>
                                Issued on: {formatDate(request.loan.issuedAt)}
                              </p>

                              <p>
                                Due date: {formatDate(request.loan.dueAt)}
                              </p>

                              {request.loan.returnedAt && (
                                <p className="font-semibold text-blue-800">
                                  Returned on:{" "}
                                  {formatDate(request.loan.returnedAt)}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {request.decisionNote && (
                          <p className="mt-3 rounded-lg bg-[#f5f9fa] p-3 text-sm">
                            Librarian&apos;s note: {request.decisionNote}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="mt-8 text-center">
              <Link
                href="/#catalogue"
                className="inline-block rounded-lg bg-[#367f96] px-6 py-3 text-sm font-medium text-white hover:bg-[#2f7186]"
              >
                Browse library catalogue
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}