"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function verifyEmail() {
    if (!token) {
      setStatus("error");
      setMessage("The verification link is invalid or incomplete.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Email verification failed.");
      }

      setStatus("success");
      setMessage(result.message);
    } catch (cause) {
      setStatus("error");
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Could not verify your email. Please try again."
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#eaf5f8] px-5 py-16 text-[#30231f]">
      <div className="mx-auto max-w-md rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-8 text-center shadow-sm">
        {status === "idle" && (
          <>
            <h1 className="font-serif text-2xl font-bold text-[#2f7186]">
              Verify your email
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#587985]">
              Click below to confirm your email address and continue with
              your RS Hostel Library registration.
            </p>
            <button
              onClick={verifyEmail}
              disabled={!token}
              className="mt-6 rounded-lg bg-[#367f96] px-6 py-3 text-sm font-medium text-white hover:bg-[#2f7186] disabled:opacity-60"
            >
              Verify email
            </button>
          </>
        )}

        {status === "loading" && (
          <>
            <h1 className="font-serif text-2xl font-bold text-[#2f7186]">
              Verifying your email...
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#587985]">
              Just a moment. We&apos;re confirming your email address.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="font-serif text-2xl font-bold text-[#2f7186]">
              Email verified!
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#587985]">
              {message}
            </p>
            <p className="mt-3 text-sm leading-7 text-[#587985]">
              Your library adventure is getting closer. The librarian will
              review your registration before your account becomes active.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="font-serif text-2xl font-bold text-red-700">
              Verification unsuccessful
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#587985]">
              {message}
            </p>
            <button
              onClick={verifyEmail}
              className="mt-5 rounded-lg border border-[#b9d9e3] px-5 py-2 text-sm font-medium text-[#367f96] hover:bg-[#eaf5f8]"
            >
              Try again
            </button>
          </>
        )}

        <div>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-[#367f96] hover:underline"
          >
            Go to login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#eaf5f8] px-5 py-16 text-[#30231f]">
          <div className="mx-auto max-w-md rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-8 text-center">
            Loading verification page...
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}