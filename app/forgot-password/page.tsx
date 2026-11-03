
"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Something went wrong. Please try again."
        );
      }

      setMessage(
        data.message ||
          "If an account exists with that email address, a password reset link has been generated."
      );
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
          Forgot password?
        </h1>

        <p className="mt-3 leading-7 text-[#668b95]">
          Enter the email address associated with your library account. If an
          account exists, we will provide a password reset link.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-6 shadow-sm"
        >
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email address
            </label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="you@example.com"
            />
          </div>

          {message && (
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm leading-6 text-green-800"
            >
              {message}
            </p>
          )}

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
            disabled={loading}
            className="w-full rounded-lg bg-[#367f96] px-4 py-3 font-medium text-white transition hover:bg-[#2f7186] disabled:opacity-60"
          >
            {loading ? "Please wait..." : "Request reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#668b95]">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#367f96] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
