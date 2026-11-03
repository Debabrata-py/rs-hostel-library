
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed. Please try again.");
      }

      if (data.role === "LIBRARIAN") {
        router.replace("/librarian/books/new");
        return;
      }

      if (data.role === "MEMBER") {
        router.replace("/member");
        return;
      }

      throw new Error(
        "Your account has an invalid role. Please contact the librarian."
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
        <Link href="/" className="text-[#367f96] hover:underline">
          ← Back to catalogue
        </Link>

        <h1 className="mt-10 font-serif text-3xl font-bold text-[#2f7186]">
          Library login
        </h1>

        <p className="mt-3 text-[#668b95]">
          Sign in to access your library account.
        </p>

        <form
          onSubmit={handleLogin}
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

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="Your password"
            />

            <div className="mt-2 text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-[#367f96] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
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
            disabled={loading}
            className="w-full rounded-lg bg-[#367f96] px-4 py-3 font-medium text-white transition hover:bg-[#2f7186] disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#668b95]">
          New to the library?{" "}
          <Link
            href="/register"
            className="font-semibold text-[#367f96] hover:underline"
          >
            Create a member account
          </Link>
        </div>
      </div>
    </main>
  );
}
