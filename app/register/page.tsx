
"use client";

import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleRegister(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const cleanPhone = phone.trim();

    if (!/^\+?[0-9\s()-]{7,20}$/.test(cleanPhone)) {
      setError("Please enter a valid mobile number.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          roomNumber: roomNumber.trim(),
          email: email.trim().toLowerCase(),
          phone: cleanPhone,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Registration failed. Please try again."
        );
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-[#eaf5f8] px-5 py-16 text-[#30231f]">
        <div className="mx-auto max-w-md rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-bold text-[#2f7186]">
            Registration submitted!
          </h1>

          <p className="mt-4 text-sm leading-7 text-[#587985]">
            Your registration is safely with the librarian. Your library
            adventure is just one little approval away!
          </p>

          <p className="mt-3 text-sm leading-7 text-[#587985]">
            The books are ready to meet you. The librarian just needs to give
            the green light. Until then, please sit tight (and try not to judge
            the books by their covers).
          </p>

          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-[#367f96] px-6 py-3 text-sm font-medium text-white hover:bg-[#2f7186]"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eaf5f8] px-5 py-12 text-[#30231f]">
      <div className="mx-auto max-w-lg">
        <Link
          href="/login"
          className="text-sm text-[#367f96] hover:underline"
        >
          ← Back to login
        </Link>

        <h1 className="mt-8 font-serif text-3xl font-bold text-[#2f7186]">
          Create member account
        </h1>

        <p className="mt-3 text-sm text-[#668b95]">
          Register to access the RS Hostel Library.
        </p>

        <form
          onSubmit={handleRegister}
          className="mt-7 space-y-5 rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-6 shadow-sm"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">
              Full name
            </label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Room number
            </label>
            <input
              required
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="Your hostel room number"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Email address
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Mobile number
            </label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="+91 9876543210"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Password
            </label>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Confirm password
            </label>
            <input
              required
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 outline-none focus:border-[#367f96]"
              placeholder="Enter password again"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#367f96] px-4 py-3 font-medium text-white transition hover:bg-[#2f7186] disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#668b95]">
          Already registered?{" "}
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
