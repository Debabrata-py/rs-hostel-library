
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  isOwnReview: boolean;
};

type OwnReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReviewData = {
  averageRating: number | null;
  reviewCount: number;
  reviews: Review[];
  ownReview: OwnReview | null;
  canReview: boolean;
  canEdit: boolean;
};

type Props = {
  bookId: string;
  userRole: "MEMBER" | "LIBRARIAN" | null;
  onClose: () => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Stars({
  rating,
  interactive = false,
  onChange,
}: {
  rating: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role={interactive ? "radiogroup" : "img"}
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) =>
        interactive ? (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            onClick={() => onChange?.(star)}
            className={`text-2xl transition hover:scale-110 ${
              star <= rating ? "text-amber-500" : "text-slate-300"
            }`}
          >
            ★
          </button>
        ) : (
          <span
            key={star}
            aria-hidden="true"
            className={`text-base ${
              star <= rating ? "text-amber-500" : "text-slate-300"
            }`}
          >
            ★
          </span>
        )
      )}
    </div>
  );
}

export default function BookReviews({
  bookId,
  userRole,
  onClose,
}: Props) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const loadReviews = useCallback(async () => {
  try {
    const response = await fetch(
      `/api/reviews?bookId=${encodeURIComponent(bookId)}`,
      { cache: "no-store" }
    );

    setError("");

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not load reviews.");
    }

    setData(result as ReviewData);
    setRating(result.ownReview?.rating ?? 5);
    setComment(result.ownReview?.comment ?? "");
    setEditing(false);
  } catch (cause) {
    setError(
      cause instanceof Error
        ? cause.message
        : "Could not load reviews."
    );
  } finally {
    setLoading(false);
  }
}, [bookId]);

  useEffect(() => {
  let cancelled = false;

  Promise.resolve().then(() => {
    if (!cancelled) {
      void loadReviews();
    }
  });

  return () => {
    cancelled = true;
  };
}, [loadReviews]);

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          rating,
          comment,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save your review.");
      }

      setMessage("Your review has been saved successfully.");
      await loadReviews();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your review."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview() {
    if (!window.confirm("Are you sure you want to delete your review?")) {
      return;
    }

    setDeleting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete your review.");
      }

      setMessage("Your review has been deleted.");
      await loadReviews();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete your review."
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-[#c4e0e8] bg-white p-5 text-center text-sm text-[#668b95]">
        Loading reviews…
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-[#b9d9e3] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3 border-b border-[#d4e8ee] pb-3">
        <div>
          <h4 className="font-serif text-lg font-bold text-[#2f7186]">
            Reader reviews
          </h4>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Stars rating={Math.round(data?.averageRating ?? 0)} />

            <span className="text-sm font-semibold text-[#302b27]">
              {data?.averageRating !== null && data?.averageRating !== undefined
                ? data.averageRating.toFixed(1)
                : "No ratings"}
            </span>

            <span className="text-xs text-[#668b95]">
              ({data?.reviewCount ?? 0} reviews)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close reviews"
          className="rounded-full px-2 py-1 text-xl text-[#668b95] hover:bg-[#eaf5f8]"
        >
          ×
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}

      {data && data.reviews.length > 0 ? (
        <div className="mt-4 space-y-4">
          {data.reviews.map((review) => (
            <article
              key={review.id}
              className="border-b border-[#edf4f6] pb-4 last:border-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars rating={review.rating} />

                <time className="text-xs text-[#8b9da2]">
                  {formatDate(review.createdAt)}
                  {review.updatedAt !== review.createdAt && " · Edited"}
                </time>
              </div>

              {review.comment && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#536477]">
                  {review.comment}
                </p>
              )}

              {review.isOwnReview && (
                <span className="mt-2 inline-block rounded-full bg-[#eaf5f8] px-2.5 py-1 text-[11px] font-medium text-[#367f96]">
                  Your review
                </span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-[#f2f8fa] p-4 text-center text-sm text-[#668b95]">
          No reviews yet. Be the first reader to share your thoughts!
        </p>
      )}

      <div className="mt-5 border-t border-[#d4e8ee] pt-4">
        {!userRole ? (
          <div className="rounded-lg bg-[#eef7fa] p-4 text-center">
            <p className="text-sm text-[#587985]">
              Log in to write a review after borrowing this book.
            </p>

            <Link
              href="/login"
              className="mt-3 inline-block rounded-full bg-[#367f96] px-5 py-2 text-sm font-medium text-white hover:bg-[#2f7186]"
            >
              Member login
            </Link>
          </div>
        ) : data?.canReview || (data?.canEdit && editing) ? (
          <form onSubmit={submitReview} className="space-y-3">
            <h5 className="font-serif font-semibold text-[#2f7186]">
              {data.canEdit ? "Edit your review" : "Write a review"}
            </h5>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#587985]">
                Your rating
              </label>

              <Stars
                rating={rating}
                interactive
                onChange={setRating}
              />
            </div>

            <div>
              <label
                htmlFor={`review-comment-${bookId}`}
                className="mb-1 block text-xs font-medium text-[#587985]"
              >
                Your thoughts (optional)
              </label>

              <textarea
                id={`review-comment-${bookId}`}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="What did you think about this book?"
                className="w-full resize-y rounded-lg border border-[#b9d9e3] bg-[#fbfdfe] p-3 text-sm text-[#302b27] outline-none focus:border-[#367f96] focus:ring-2 focus:ring-[#367f96]/10"
              />

              <p className="mt-1 text-right text-[11px] text-[#8b9da2]">
                {comment.length}/2000
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#367f96] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#2f7186] disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : data.canEdit
                    ? "Update review"
                    : "Submit review"}
              </button>

              {data.canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setRating(data.ownReview?.rating ?? 5);
                    setComment(data.ownReview?.comment ?? "");
                    setError("");
                    setMessage("");
                  }}
                  className="rounded-full border border-[#b9d9e3] px-4 py-2 text-sm text-[#367f96] hover:bg-[#eaf5f8]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : data?.canEdit && data.ownReview ? (
          <div className="rounded-lg bg-[#eef7fa] p-4">
            <p className="text-sm font-medium text-[#367f96]">
              You have reviewed this book.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-full bg-[#367f96] px-4 py-2 text-sm text-white hover:bg-[#2f7186]"
              >
                Edit my review
              </button>

              <button
                type="button"
                onClick={() => void deleteReview()}
                disabled={deleting}
                className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete review"}
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-[#f2f8fa] p-4 text-sm text-[#668b95]">
            You can write a review after this book has been issued to you.
          </p>
        )}
      </div>
    </section>
  );
}
