
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type CopyEntry = {
  accessionNumber: string;
  shelf: string;
  condition: string;
};

const emptyCopy = (): CopyEntry => ({
  accessionNumber: "",
  shelf: "",
  condition: "good",
});

export default function NewBookPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [publisher, setPublisher] = useState("");
  const [year, setYear] = useState("");
  const [edition, setEdition] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [copies, setCopies] = useState<CopyEntry[]>([emptyCopy()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateCopy(
    index: number,
    field: keyof CopyEntry,
    value: string
  ) {
    setCopies((current) =>
      current.map((copy, i) =>
        i === index ? { ...copy, [field]: value } : copy
      )
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!title.trim() || !author.trim()) {
      setError("Enter the book title and author.");
      return;
    }

    if (
      copies.length === 0 ||
      copies.some(
        (copy) => !copy.accessionNumber.trim() || !copy.shelf.trim()
      )
    ) {
      setError(
        "Every physical copy needs an accession number and shelf location."
      );
      return;
    }

    if (
      !["Fiction", "Non-fiction", "Magazine"].includes(category)
    ) {
      setError("Choose Fiction, Non-fiction, or Magazine.");
      return;
    }

    if (cover) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

      if (!allowedTypes.includes(cover.type)) {
        setError("Use a JPEG, PNG, or WebP cover image.");
        return;
      }

      if (cover.size > 5 * 1024 * 1024) {
        setError("The cover image must be no larger than 5 MB.");
        return;
      }
    }

    setSaving(true);

    try {
      const formData = new FormData();

      formData.append(
        "book",
        JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          isbn: isbn.trim(),
          publisher: publisher.trim(),
          publicationYear: year ? Number(year) : null,
          edition: edition.trim(),
          category,
          language: language.trim(),
          description: description.trim(),
          copies: copies.map((copy) => ({
            accessionNumber: copy.accessionNumber.trim(),
            shelf: copy.shelf.trim(),
            condition: copy.condition,
          })),
        })
      );

      if (cover) {
        formData.append("cover", cover);
      }

      const response = await fetch("/api/librarian/books", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save the book.");
      }

      setMessage("Book and physical copies added successfully.");
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong while saving the book."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-10 text-stone-800 sm:px-8">
      <div className="mx-auto max-w-3xl">
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
            className="rounded-full bg-emerald-800 px-4 py-2 text-white"
          >
            Add book
          </Link>




        </nav>

        <header className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Librarian dashboard
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Add a new book
          </h1>

          <p className="mt-3 leading-7 text-stone-600">
            Enter the book details, add its cover, and register each physical
            copy with its shelf location.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8"
        >
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Book information</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Book title *</span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                  placeholder="Enter the full title"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Author *</span>
                <input
                  required
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                  placeholder="Author's name"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">ISBN</span>
                <input
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                  placeholder="ISBN, if available"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Publisher</span>
                <input
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Publication year</span>
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Edition</span>
                <input
                  value={edition}
                  onChange={(e) => setEdition(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                  placeholder="e.g. Second edition"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Category *</span>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-emerald-700"
                >
                  <option value="">Select a category</option>
                  <option value="Fiction">Fiction</option>
                  <option value="Non-fiction">Non-fiction</option>
                  <option value="Magazine">Magazine</option>
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Language</span>
                <input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                  placeholder="e.g. Bengali"
                />
              </label>

              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Description</span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-700"
                  placeholder="A short description of the book"
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Cover image</h2>

            <p className="text-sm text-stone-500">
              Optional. JPEG, PNG, or WebP, up to 5 MB.
            </p>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:font-medium file:text-emerald-800"
            />

            {cover && (
              <p className="text-sm text-stone-600">
                Selected: {cover.name}
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Physical copies</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Add each copy separately.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCopies((current) => [...current, emptyCopy()])
                }
                className="rounded-full border border-emerald-800 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
              >
                + Add copy
              </button>
            </div>

            {copies.map((copy, index) => (
              <div
                key={index}
                className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Copy {index + 1}</h3>

                  {copies.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setCopies((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Accession number *</span>
                  <input
                    required
                    value={copy.accessionNumber}
                    onChange={(e) =>
                      updateCopy(index, "accessionNumber", e.target.value)
                    }
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-emerald-700"
                    placeholder="e.g. RS-0001"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Shelf location *</span>
                  <input
                    required
                    value={copy.shelf}
                    onChange={(e) => updateCopy(index, "shelf", e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-emerald-700"
                    placeholder="e.g. Shelf A, Level 2"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Condition</span>
                  <select
                    value={copy.condition}
                    onChange={(e) =>
                      updateCopy(index, "condition", e.target.value)
                    }
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-emerald-700"
                  >
                    <option value="good">Good</option>
                    <option value="worn">Worn</option>
                    <option value="damaged">Damaged</option>
                    <option value="under_repair">Under repair</option>
                  </select>
                </label>
              </div>
            ))}
          </section>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="rounded-xl bg-green-50 p-4 text-sm text-green-800"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-emerald-800 px-6 py-3.5 font-medium text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving book…" : "Save book and copies"}
          </button>

          <p className="text-xs leading-5 text-stone-500">
            Only an authenticated, active librarian can save records. Do not
            use this page with real member accounts until we have completed
            authentication and tested the security policies.
          </p>
        </form>
      </div>
    </main>
  );
}
