
"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!token) {
      setError("This password reset link is invalid or incomplete.");
      return;
    }

    if (password.length < 8) {
      setError("Your password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to reset your password. Please try again."
        );
      }

      setSuccess(true);
      setMessage(data.message);
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eaf5f8] px-5 py-16 text-[#30231f]">
      <div className="mx-auto max-w-md">
        <Link href="/login" className="text-[#367f96] hover:underline">
          ← Back to login
        </Link>

        <h1 className="mt-10 font-serif text-3xl font-bold text-[#2f7186]">
          Reset your password
        </h1>

        <p className="mt-3 leading-7 text-[#668b95]">
          Choose a new password for your library account.
        </p>

        {success ? (
          <div className="mt-8 rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-6 shadow-sm">
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm leading-6 text-green-800"
            >
              {message}
            </p>

            <Link
              href="/login"
              className="mt-5 block w-full rounded-lg bg-[#367f96] px-4 py-3 text-center font-medium text-white transition hover:bg-[#2f7186]"
            >
              Go to login
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5 rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-6 shadow-sm"
          >
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium"
              >
                New password
              </label>

              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium"
              >
                Confirm new password
              </label>

              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
                placeholder="Enter the password again"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-lg bg-[#367f96] px-4 py-3 font-medium text-white transition hover:bg-[#2f7186] disabled:opacity-60"
            >
              {loading ? "Resetting password..." : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#eaf5f8] px-5 py-16 text-[#668b95]">
          Loading...
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
