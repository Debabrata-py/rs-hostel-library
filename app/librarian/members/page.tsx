"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MemberStatus =
  | "PENDING_EMAIL_VERIFICATION"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

type Member = {
  id: string;
  fullName: string;
  roomNumber: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
};

type MemberAction = "APPROVE" | "REJECT" | "SUSPEND" | "REACTIVATE";
type StatusFilter = "ALL" | MemberStatus;

function getStatusLabel(status: MemberStatus) {
  switch (status) {
    case "PENDING_EMAIL_VERIFICATION":
      return "Email not verified";
    case "PENDING_APPROVAL":
      return "Pending approval";
    case "ACTIVE":
      return "Active";
    case "REJECTED":
      return "Rejected";
    case "SUSPENDED":
      return "Suspended";
  }
}

function getStatusStyle(status: MemberStatus) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-800";
    case "PENDING_APPROVAL":
      return "bg-amber-50 text-amber-800";
    case "PENDING_EMAIL_VERIFICATION":
      return "bg-sky-50 text-sky-800";
    case "SUSPENDED":
      return "bg-red-50 text-red-800";
    case "REJECTED":
      return "bg-stone-100 text-stone-700";
  }
}

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/librarian/members", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load the member list.");
      }

      setMembers(data.members ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the member list."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMembers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMembers]);

  async function updateMember(member: Member, action: MemberAction) {
    const actionLabels: Record<MemberAction, string> = {
      APPROVE: "approve",
      REJECT: "reject",
      SUSPEND: "suspend",
      REACTIVATE: "reactivate",
    };
    const actionLabel = actionLabels[action];

    if (
      !window.confirm(
        `Are you sure you want to ${actionLabel} ${member.fullName}'s account?`
      )
    ) {
      return;
    }

    setUpdatingId(member.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/librarian/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, action }),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not update this member.");
      }

      const successLabels: Record<MemberAction, string> = {
        APPROVE: "approved",
        REJECT: "rejected",
        SUSPEND: "suspended",
        REACTIVATE: "reactivated",
      };
      setMessage(
        `${member.fullName}'s account has been ${successLabels[action]} successfully.`
      );
      await loadMembers();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this member's account."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const pendingCount = members.filter(
    (member) => member.status === "PENDING_APPROVAL"
  ).length;
  const activeCount = members.filter(
    (member) => member.status === "ACTIVE"
  ).length;

  const filteredMembers = useMemo(
    () =>
      statusFilter === "ALL"
        ? members
        : members.filter((member) => member.status === statusFilter),
    [members, statusFilter]
  );

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-10 text-stone-800 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
          href="/"
          className="text-sm font-medium text-emerald-800 hover:underline"
        >
          ← Back to catalogue
        </Link>

          <nav className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
  <Link
    href="/librarian/requests"
    className="rounded-full border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
  >
    Borrowing requests
  </Link>
  <Link
    href="/librarian/members"
    className="rounded-full bg-emerald-800 px-4 py-2 text-white"
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

          <button
            onClick={() => void handleLogout()}
            className="text-sm font-medium text-stone-600 hover:text-red-700"
          >
            Log out
          </button>
        </div>

        <header className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Librarian dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Member management
          </h1>
          <p className="mt-3 leading-7 text-stone-600">
            Review registrations and manage member account access.
          </p>
        </header>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Pending approval</p>
            <p className="mt-1 text-3xl font-semibold text-amber-700">
              {pendingCount}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Active members</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-800">
              {activeCount}
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-green-50 p-4 text-sm text-green-800"
          >
            {message}
          </p>
        )}

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-5">
            <div>
              <h2 className="text-lg font-semibold">Registered members</h2>
              <p className="mt-1 text-sm text-stone-500">
                Showing {filteredMembers.length} of {members.length} member
                {members.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-stone-600">
                Filter
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 outline-none focus:border-emerald-700"
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING_EMAIL_VERIFICATION">
                    Email not verified
                  </option>
                  <option value="PENDING_APPROVAL">Pending approval</option>
                  <option value="ACTIVE">Active</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </label>

              <button
                onClick={() => void loadMembers()}
                disabled={loading}
                className="rounded-full border border-emerald-800 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-stone-500">
              Loading members…
            </p>
          ) : filteredMembers.length === 0 ? (
            <p className="p-8 text-center text-sm text-stone-500">
              {members.length === 0
                ? "No member accounts have been registered yet."
                : "No members match this status filter."}
            </p>
          ) : (
            <div className="divide-y divide-stone-200">
              {filteredMembers.map((member) => (
                <article
                  key={member.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{member.fullName}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusStyle(
                          member.status
                        )}`}
                      >
                        {getStatusLabel(member.status)}
                      </span>
                    </div>
                    <p className="text-sm text-stone-600">
                      Room: {member.roomNumber}
                    </p>
                    <p className="break-all text-sm text-stone-600">
                      {member.email}
                    </p>
                    <p className="text-sm text-stone-600">
                      Mobile: {member.phone || "Not provided"}
                    </p>
                    <p className="text-xs text-stone-400">
                      Registered:{" "}
                      {new Date(member.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-stone-400">
                      Email verified:{" "}
                      {member.emailVerifiedAt
                        ? new Date(
                            member.emailVerifiedAt
                          ).toLocaleDateString()
                        : "Not yet verified"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {member.status === "PENDING_APPROVAL" && (
                      <>
                        <button
                          onClick={() => void updateMember(member, "APPROVE")}
                          disabled={updatingId === member.id}
                          className="rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {updatingId === member.id
                            ? "Updating…"
                            : "Approve member"}
                        </button>
                        <button
                          onClick={() => void updateMember(member, "REJECT")}
                          disabled={updatingId === member.id}
                          className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {member.status === "ACTIVE" && (
                      <button
                        onClick={() => void updateMember(member, "SUSPEND")}
                        disabled={updatingId === member.id}
                        className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updatingId === member.id ? "Updating…" : "Suspend"}
                      </button>
                    )}

                    {member.status === "SUSPENDED" && (
                      <button
                        onClick={() =>
                          void updateMember(member, "REACTIVATE")
                        }
                        disabled={updatingId === member.id}
                        className="rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updatingId === member.id
                          ? "Updating…"
                          : "Reactivate"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="mt-5 text-xs leading-5 text-stone-500">
          Only an authenticated, active librarian can manage member accounts.
          Members must verify their email before approval. Suspended and rejected
          members cannot access the member dashboard.
        </p>
      </div>
    </main>
  );
}