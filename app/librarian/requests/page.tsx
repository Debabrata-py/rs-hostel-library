
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "FULFILLED";

type MemberInfo = {
  fullName: string;
  roomNumber: string;
  email: string;
} | null;

type BookInfo = {
  title: string;
  author: string;
} | null;

type CopyInfo = {
  accessionNumber: string;
  shelfLocation: string;
  book: BookInfo;
} | null;

type RequestRow = {
  id: string;
  memberId: string;
  copyId: string;
  requestedAt: string;
  status: RequestStatus;
  reviewedAt: string | null;
  decisionNote: string | null;
  member: MemberInfo;
  copy: CopyInfo;
};

type LoanRow = {
  id: string;
  issuedAt: string;
  dueAt: string;
  member: MemberInfo;
  copy: CopyInfo;
};

const statusStyles: Record<RequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-stone-200 text-stone-700",
  FULFILLED: "bg-blue-100 text-blue-800",
};

const statusLabels: Record<RequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  FULFILLED: "Fulfilled",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BorrowRequestsPage() {
  const router = useRouter();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [activeLoans, setActiveLoans] = useState<LoanRow[]>([]);
  const [filter, setFilter] = useState("PENDING");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/librarian/requests", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not load the librarian dashboard."
        );
      }

      setRequests(data.requests ?? []);
      setActiveLoans(data.activeLoans ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the librarian dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentTime(Date.now());
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function performAction(
    payload: Record<string, string>,
    busyIdValue: string
  ) {
    setBusyId(busyIdValue);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/librarian/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return null;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not complete the operation.");
      }

      setMessage(data.message || "Operation completed successfully.");

      await loadDashboard();

      return data;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete the operation."
      );

      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function reviewRequest(
    request: RequestRow,
    decision: "APPROVED" | "REJECTED"
  ) {
    if (request.status !== "PENDING") return;

    const action = decision === "APPROVED" ? "approve" : "reject";

    if (
      !window.confirm(
        `Are you sure you want to ${action} this borrowing request?`
      )
    ) {
      return;
    }

    await performAction(
      {
        action: "REVIEW",
        requestId: request.id,
        decision,
        decisionNote: notes[request.id]?.trim() || "",
      },
      request.id
    );
  }

  async function issueBook(request: RequestRow) {
    if (request.status !== "APPROVED") return;

    if (
      !window.confirm(
        `Issue "${request.copy?.book?.title ?? "this book"}" to ${
          request.member?.fullName ?? "this member"
        } for 21 days?`
      )
    ) {
      return;
    }

    const result = await performAction(
      {
        action: "ISSUE",
        requestId: request.id,
      },
      request.id
    );

    if (result?.loanId && result?.dueAt) {
      setMessage(
        `Book issued successfully. Loan reference: ${result.loanId}. Due date: ${formatDate(result.dueAt)}.`
      );
    }
  }

  async function returnBook(loan: LoanRow) {
    if (
      !window.confirm(
        `Confirm that "${loan.copy?.book?.title ?? "this book"}" has been returned by ${
          loan.member?.fullName ?? "this member"
        }?`
      )
    ) {
      return;
    }

    await performAction(
      {
        action: "RETURN",
        loanId: loan.id,
      },
      loan.id
    );
  }

  const visibleRequests = requests.filter(
    (request) => filter === "ALL" || request.status === filter
  );

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-10 text-stone-800 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-800 hover:underline"
        >
          ← Back to catalogue
        </Link>

<nav className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
  <Link
    href="/librarian/requests"
    className="rounded-full bg-emerald-800 px-4 py-2 text-white"
  >
    Borrowing requests
  </Link>
  <Link
    href="/librarian/members"
    className="rounded-full border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
  >
    Manage members
  </Link>
  <Link
    href="/librarian/books"
    className="rounded-full border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
  >
    Manage books
  </Link>
  <Link
    href="/librarian/books/new"
    className="rounded-full border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
  >
    Add book
  </Link>
</nav>

        <header className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Librarian dashboard
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Borrowing requests
          </h1>

          <p className="mt-3 leading-7 text-stone-600">
            Review member requests, issue approved books, and record returns.
            Each issued book has a borrowing period of 21 days.
          </p>
        </header>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-3 text-sm font-medium">
              Filter

              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2"
              >
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="ALL">All requests</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh dashboard"}
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="mt-5 break-words rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"
            >
              {message}
            </p>
          )}

          {loading ? (
            <p className="py-12 text-center text-stone-500">
              Loading borrowing requests…
            </p>
          ) : visibleRequests.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-medium">No requests found</p>

              <p className="mt-2 text-sm text-stone-500">
                Requests matching this filter will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {visibleRequests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-xl border border-stone-200 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {request.copy?.book?.title ??
                          "Book information unavailable"}
                      </h2>

                      <p className="mt-1 text-sm text-stone-600">
                        by {request.copy?.book?.author ?? "Unknown author"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        statusStyles[request.status]
                      }`}
                    >
                      {statusLabels[request.status]}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-stone-500">Member</dt>
                      <dd className="mt-1 font-medium">
                        {request.member?.fullName ?? "Unknown member"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-stone-500">Room number</dt>
                      <dd className="mt-1">
                        {request.member?.roomNumber ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-stone-500">Accession number</dt>
                      <dd className="mt-1">
                        {request.copy?.accessionNumber ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-stone-500">Shelf location</dt>
                      <dd className="mt-1">
                        {request.copy?.shelfLocation ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-stone-500">Requested on</dt>
                      <dd className="mt-1">
                        {new Date(request.requestedAt).toLocaleString()}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-stone-500">Member email</dt>
                      <dd className="mt-1 break-all">
                        {request.member?.email ?? "—"}
                      </dd>
                    </div>
                  </dl>

                  {request.decisionNote && (
                    <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">
                      <span className="font-medium">Decision note:</span>{" "}
                      {request.decisionNote}
                    </p>
                  )}

                  {request.status === "PENDING" && (
                    <div className="mt-5 border-t border-stone-100 pt-4">
                      <label className="block text-sm font-medium">
                        Decision note (optional)

                        <textarea
                          value={notes[request.id] ?? ""}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          rows={2}
                          maxLength={1000}
                          placeholder="Add a reason or instruction for the member"
                          className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-emerald-700"
                        />
                      </label>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() =>
                            void reviewRequest(request, "APPROVED")
                          }
                          className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                        >
                          {busyId === request.id
                            ? "Saving…"
                            : "Approve request"}
                        </button>

                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() =>
                            void reviewRequest(request, "REJECTED")
                          }
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject request
                        </button>
                      </div>
                    </div>
                  )}

                  {request.status === "APPROVED" && (
                    <div className="mt-5 border-t border-stone-100 pt-4">
                      <p className="mb-3 text-sm text-stone-600">
                        This request is approved but the book has not yet been
                        issued.
                      </p>

                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void issueBook(request)}
                        className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                      >
                        {busyId === request.id
                          ? "Issuing…"
                          : "Issue book (21 days)"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
                Circulation
              </p>

              <h2 className="mt-2 text-2xl font-semibold">Active loans</h2>

              <p className="mt-2 text-sm text-stone-600">
                Books currently issued and not yet returned.
              </p>
            </div>

            <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">
              {activeLoans.length} active
            </span>
          </div>

          {!loading && activeLoans.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">
              There are no active loans.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {activeLoans.map((loan) => {
                const overdue =
                  currentTime !== null &&
                  new Date(loan.dueAt).getTime() < currentTime;

                return (
                  <article
                    key={loan.id}
                    className="rounded-xl border border-stone-200 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {loan.copy?.book?.title ??
                            "Book information unavailable"}
                        </h3>

                        <p className="mt-1 text-sm text-stone-600">
                          by {loan.copy?.book?.author ?? "Unknown author"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          overdue
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {overdue ? "Overdue" : "On loan"}
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-stone-500">Member</dt>
                        <dd className="mt-1 font-medium">
                          {loan.member?.fullName ?? "Unknown member"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-stone-500">Room number</dt>
                        <dd className="mt-1">
                          {loan.member?.roomNumber ?? "—"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-stone-500">Accession number</dt>
                        <dd className="mt-1">
                          {loan.copy?.accessionNumber ?? "—"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-stone-500">Shelf location</dt>
                        <dd className="mt-1">
                          {loan.copy?.shelfLocation ?? "—"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-stone-500">Issued on</dt>
                        <dd className="mt-1">{formatDate(loan.issuedAt)}</dd>
                      </div>

                      <div>
                        <dt className="text-stone-500">Due date</dt>

                        <dd
                          className={`mt-1 font-semibold ${
                            overdue ? "text-red-700" : "text-stone-800"
                          }`}
                        >
                          {formatDate(loan.dueAt)}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-stone-500">Member email</dt>
                        <dd className="mt-1 break-all">
                          {loan.member?.email ?? "—"}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 border-t border-stone-100 pt-4">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void returnBook(loan)}
                        className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {busyId === loan.id
                          ? "Recording return…"
                          : "Return book"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}