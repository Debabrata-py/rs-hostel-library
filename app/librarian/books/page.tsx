
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BookCopy = {
  id: string;
  accessionNumber: string;
  shelfLocation: string;
  condition: string;
  status: string;
  totalLoans: number;
};

type Book = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  publicationYear: number | null;
  edition: string | null;
  category: string;
  language: string | null;
  description: string | null;
  coverImagePath: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  totalCopies: number;
  availableCopies: number;
  borrowedCopies: number;
  reviewCount: number;
  copies: BookCopy[];
};

type StatusFilter = "ALL" | "ACTIVE" | "ARCHIVED";

type BookForm = {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  publicationYear: string;
  edition: string;
  category: string;
  language: string;
  description: string;
};

type CopyForm = {
  accessionNumber: string;
  shelfLocation: string;
  condition: string;
};

type CopyEditForm = {
  shelfLocation: string;
  condition: string;
  status: string;
};

const emptyForm: BookForm = {
  title: "",
  author: "",
  isbn: "",
  publisher: "",
  publicationYear: "",
  edition: "",
  category: "FICTION",
  language: "",
  description: "",
};

const emptyCopy: CopyForm = {
  accessionNumber: "",
  shelfLocation: "",
  condition: "GOOD",
};

function categoryLabel(category: string) {
  switch (category) {
    case "FICTION":
      return "Fiction";
    case "NON_FICTION":
      return "Non-fiction";
    case "MAGAZINE":
      return "Magazine";
    default:
      return category;
  }
}

function conditionLabel(condition: string) {
  switch (condition) {
    case "GOOD":
      return "Good";
    case "WORN":
      return "Worn";
    case "DAMAGED":
      return "Damaged";
    case "UNDER_REPAIR":
      return "Under repair";
    default:
      return condition;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "AVAILABLE":
      return "Available";
    case "BORROWED":
      return "Borrowed";
    case "UNAVAILABLE":
      return "Unavailable";
    case "RETIRED":
      return "Retired";
    default:
      return status;
  }
}

export default function ManageBooksPage() {
  const router = useRouter();

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editForm, setEditForm] = useState<BookForm>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);

  const [addingCopiesTo, setAddingCopiesTo] = useState<Book | null>(null);
  const [copyForms, setCopyForms] = useState<CopyForm[]>([
    { ...emptyCopy },
  ]);
  const [savingCopies, setSavingCopies] = useState(false);

  const [editingCopy, setEditingCopy] = useState<{
    book: Book;
    copy: BookCopy;
  } | null>(null);
  const [copyEditForm, setCopyEditForm] = useState<CopyEditForm>({
    shelfLocation: "",
    condition: "GOOD",
    status: "AVAILABLE",
  });
  const [savingCopyEdit, setSavingCopyEdit] = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/librarian/books/manage", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load the book list.");
      }

      setBooks(data.books ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the book list."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBooks();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBooks]);

  function openEditForm(book: Book) {
    setEditingBook(book);
    setAddingCopiesTo(null);
    setEditingCopy(null);
    setError("");
    setMessage("");

    setEditForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn ?? "",
      publisher: book.publisher ?? "",
      publicationYear: book.publicationYear?.toString() ?? "",
      edition: book.edition ?? "",
      category: book.category,
      language: book.language ?? "",
      description: book.description ?? "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeEditForm() {
    if (savingEdit) return;
    setEditingBook(null);
    setEditForm(emptyForm);
  }

  function updateEditField(field: keyof BookForm, value: string) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveBookDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBook) return;

    setSavingEdit(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/librarian/books/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: editingBook.id,
          action: "EDIT",
          ...editForm,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not update this book.");
      }

      setMessage(data.message || "Book details updated successfully.");
      setEditingBook(null);
      setEditForm(emptyForm);
      await loadBooks();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this book."
      );
    } finally {
      setSavingEdit(false);
    }
  }

  function openAddCopiesForm(book: Book) {
    setAddingCopiesTo(book);
    setEditingBook(null);
    setEditingCopy(null);
    setCopyForms([{ ...emptyCopy }]);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeAddCopiesForm() {
    if (savingCopies) return;
    setAddingCopiesTo(null);
    setCopyForms([{ ...emptyCopy }]);
  }

  function updateCopyField(
    index: number,
    field: keyof CopyForm,
    value: string
  ) {
    setCopyForms((current) =>
      current.map((copy, copyIndex) =>
        copyIndex === index ? { ...copy, [field]: value } : copy
      )
    );
  }

  function addCopyRow() {
    if (copyForms.length >= 100) return;
    setCopyForms((current) => [...current, { ...emptyCopy }]);
  }

  function removeCopyRow(index: number) {
    setCopyForms((current) =>
      current.length <= 1
        ? current
        : current.filter((_, copyIndex) => copyIndex !== index)
    );
  }

  async function savePhysicalCopies(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!addingCopiesTo) return;

    setError("");
    setMessage("");

    const preparedCopies = copyForms.map((copy) => ({
      accessionNumber: copy.accessionNumber.trim(),
      shelfLocation: copy.shelfLocation.trim(),
      condition: copy.condition,
    }));

    if (
      preparedCopies.some(
        (copy) => !copy.accessionNumber || !copy.shelfLocation
      )
    ) {
      setError(
        "Please provide an accession number and shelf location for every copy."
      );
      return;
    }

    const accessionNumbers = preparedCopies.map((copy) =>
      copy.accessionNumber.toLowerCase()
    );

    if (new Set(accessionNumbers).size !== accessionNumbers.length) {
      setError("Duplicate accession numbers exist in this submission.");
      return;
    }

    setSavingCopies(true);

    try {
      const response = await fetch("/api/librarian/books/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: addingCopiesTo.id,
          copies: preparedCopies,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not add physical copies.");
      }

      setMessage(data.message || "Physical copies added successfully.");
      setExpandedId(addingCopiesTo.id);
      setAddingCopiesTo(null);
      setCopyForms([{ ...emptyCopy }]);
      await loadBooks();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add physical copies."
      );
    } finally {
      setSavingCopies(false);
    }
  }

  function openCopyEditor(book: Book, copy: BookCopy) {
    if (copy.status === "BORROWED") {
      setError(
        "This copy currently has an active loan and cannot be edited until it is returned."
      );
      return;
    }

    setEditingBook(null);
    setAddingCopiesTo(null);
    setError("");
    setMessage("");

    setEditingCopy({ book, copy });
    setCopyEditForm({
      shelfLocation: copy.shelfLocation,
      condition: copy.condition,
      status: copy.status,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeCopyEditor() {
    if (savingCopyEdit) return;
    setEditingCopy(null);
  }

  async function saveCopyDetails(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!editingCopy) return;

    setSavingCopyEdit(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/librarian/books/manage/copy",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            copyId: editingCopy.copy.id,
            ...copyEditForm,
          }),
        }
      );

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not update this copy.");
      }

      setMessage(data.message || "Physical copy updated successfully.");
      setExpandedId(editingCopy.book.id);
      setEditingCopy(null);
      await loadBooks();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this physical copy."
      );
    } finally {
      setSavingCopyEdit(false);
    }
  }

  async function updateBook(
    book: Book,
    action: "ARCHIVE" | "RESTORE"
  ) {
    const actionLabel = action === "ARCHIVE" ? "archive" : "restore";

    if (
      !window.confirm(
        `Are you sure you want to ${actionLabel} "${book.title}"?`
      )
    ) {
      return;
    }

    setUpdatingId(book.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/librarian/books/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, action }),
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not update this book.");
      }

      setMessage(data.message);
      await loadBooks();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this book."
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

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return books.filter((book) => {
      const matchesSearch =
        !query ||
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query) ||
        (book.isbn ?? "").toLowerCase().includes(query) ||
        book.copies.some((copy) =>
          copy.accessionNumber.toLowerCase().includes(query)
        );

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && !book.isArchived) ||
        (statusFilter === "ARCHIVED" && book.isArchived);

      return matchesSearch && matchesStatus;
    });
  }, [books, search, statusFilter]);

  const activeCount = books.filter((book) => !book.isArchived).length;
  const archivedCount = books.filter((book) => book.isArchived).length;
  const totalCopies = books.reduce(
    (total, book) => total + book.totalCopies,
    0
  );

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-10 text-stone-800 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
          href="/"
          className="text-sm font-medium text-emerald-800 hover:underline"
        >
          ← Back to catalogue
        </Link>

          <button
            onClick={() => void handleLogout()}
            className="text-sm font-medium text-stone-600 hover:text-red-700"
          >
            Log out
          </button>
        </div>

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
    className="rounded-full bg-emerald-800 px-4 py-2 text-white"
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
            Book management
          </h1>
          <p className="mt-3 leading-7 text-stone-600">
            Search, inspect and manage the library catalogue and its physical
            copies.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {message && (
          <p role="status" className="mb-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            {message}
          </p>
        )}

        {editingCopy && (
          <section className="mb-8 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-sky-800">
                  Physical copy management
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  Edit physical copy
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  {editingCopy.book.title}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  Accession number:{" "}
                  <strong>{editingCopy.copy.accessionNumber}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={closeCopyEditor}
                disabled={savingCopyEdit}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={saveCopyDetails} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label htmlFor="copy-edit-shelf" className="mb-2 block text-sm font-medium">
                    Shelf location *
                  </label>
                  <input
                    id="copy-edit-shelf"
                    required
                    maxLength={200}
                    value={copyEditForm.shelfLocation}
                    onChange={(event) =>
                      setCopyEditForm((current) => ({
                        ...current,
                        shelfLocation: event.target.value,
                      }))
                    }
                    disabled={savingCopyEdit}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-sky-700 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label htmlFor="copy-edit-condition" className="mb-2 block text-sm font-medium">
                    Physical condition *
                  </label>
                  <select
                    id="copy-edit-condition"
                    value={copyEditForm.condition}
                    onChange={(event) =>
                      setCopyEditForm((current) => ({
                        ...current,
                        condition: event.target.value,
                      }))
                    }
                    disabled={savingCopyEdit}
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-700 disabled:opacity-60"
                  >
                    <option value="GOOD">Good</option>
                    <option value="WORN">Worn</option>
                    <option value="DAMAGED">Damaged</option>
                    <option value="UNDER_REPAIR">Under repair</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="copy-edit-status" className="mb-2 block text-sm font-medium">
                    Copy status *
                  </label>
                  <select
                    id="copy-edit-status"
                    value={copyEditForm.status}
                    onChange={(event) =>
                      setCopyEditForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                    disabled={savingCopyEdit}
                    className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-700 disabled:opacity-60"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                    <option value="RETIRED">Retired</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-900">
                The accession number cannot be changed here. Borrowing history
                will be preserved.
              </div>

              <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
                <button
                  type="submit"
                  disabled={savingCopyEdit}
                  className="rounded-full bg-sky-800 px-6 py-3 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-50"
                >
                  {savingCopyEdit ? "Saving…" : "Save copy changes"}
                </button>
                <button
                  type="button"
                  onClick={closeCopyEditor}
                  disabled={savingCopyEdit}
                  className="rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {editingBook && (
          <section className="mb-8 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
                  Edit catalogue record
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  Edit book details
                </h2>
              </div>
              <button
                type="button"
                onClick={closeEditForm}
                disabled={savingEdit}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={saveBookDetails} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-title" className="mb-2 block text-sm font-medium">Book title *</label>
                  <input id="edit-title" required maxLength={500} value={editForm.title} onChange={(event) => updateEditField("title", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
                <div>
                  <label htmlFor="edit-author" className="mb-2 block text-sm font-medium">Author *</label>
                  <input id="edit-author" required maxLength={300} value={editForm.author} onChange={(event) => updateEditField("author", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
                <div>
                  <label htmlFor="edit-isbn" className="mb-2 block text-sm font-medium">ISBN</label>
                  <input id="edit-isbn" maxLength={30} value={editForm.isbn} onChange={(event) => updateEditField("isbn", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
                <div>
                  <label htmlFor="edit-publisher" className="mb-2 block text-sm font-medium">Publisher</label>
                  <input id="edit-publisher" maxLength={300} value={editForm.publisher} onChange={(event) => updateEditField("publisher", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
                <div>
                  <label htmlFor="edit-year" className="mb-2 block text-sm font-medium">Publication year</label>
                  <input id="edit-year" type="number" min="1" max="9999" value={editForm.publicationYear} onChange={(event) => updateEditField("publicationYear", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
                <div>
                  <label htmlFor="edit-edition" className="mb-2 block text-sm font-medium">Edition</label>
                  <input id="edit-edition" maxLength={100} value={editForm.edition} onChange={(event) => updateEditField("edition", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
                <div>
                  <label htmlFor="edit-category" className="mb-2 block text-sm font-medium">Category *</label>
                  <select id="edit-category" required value={editForm.category} onChange={(event) => updateEditField("category", event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700">
                    <option value="FICTION">Fiction</option>
                    <option value="NON_FICTION">Non-fiction</option>
                    <option value="MAGAZINE">Magazine</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-language" className="mb-2 block text-sm font-medium">Language</label>
                  <input id="edit-language" maxLength={100} value={editForm.language} onChange={(event) => updateEditField("language", event.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
                </div>
              </div>

              <div>
                <label htmlFor="edit-description" className="mb-2 block text-sm font-medium">Description</label>
                <textarea id="edit-description" rows={5} maxLength={10000} value={editForm.description} onChange={(event) => updateEditField("description", event.target.value)} className="w-full resize-y rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700" />
              </div>

              <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
                <button type="submit" disabled={savingEdit} className="rounded-full bg-emerald-800 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">
                  {savingEdit ? "Saving changes…" : "Save changes"}
                </button>
                <button type="button" onClick={closeEditForm} disabled={savingEdit} className="rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
                  Cancel
                </button>
              </div>

              <p className="text-xs leading-5 text-stone-500">
                Editing these details will not change physical copies,
                accession numbers, reviews or borrowing history.
              </p>
            </form>
          </section>
        )}

        {addingCopiesTo && (
          <section className="mb-8 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-sky-800">Physical copy registration</p>
                <h2 className="mt-2 text-xl font-semibold">Add physical copies</h2>
                <p className="mt-1 text-sm text-stone-600">Book: <strong>{addingCopiesTo.title}</strong></p>
                <p className="mt-1 text-xs text-stone-500">You can register up to 100 copies in one submission.</p>
              </div>
              <button type="button" onClick={closeAddCopiesForm} disabled={savingCopies} className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
            </div>

            <form onSubmit={savePhysicalCopies} className="space-y-5">
              <div className="space-y-4">
                {copyForms.map((copy, index) => (
                  <div key={index} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-stone-800">Copy {index + 1}</h3>
                      {copyForms.length > 1 && (
                        <button type="button" onClick={() => removeCopyRow(index)} disabled={savingCopies} className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50">Remove</button>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label htmlFor={`copy-accession-${index}`} className="mb-2 block text-sm font-medium">Accession number *</label>
                        <input id={`copy-accession-${index}`} required maxLength={100} value={copy.accessionNumber} onChange={(event) => updateCopyField(index, "accessionNumber", event.target.value)} placeholder="e.g. RS002" disabled={savingCopies} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-700 disabled:opacity-60" />
                      </div>
                      <div>
                        <label htmlFor={`copy-shelf-${index}`} className="mb-2 block text-sm font-medium">Shelf location *</label>
                        <input id={`copy-shelf-${index}`} required maxLength={200} value={copy.shelfLocation} onChange={(event) => updateCopyField(index, "shelfLocation", event.target.value)} placeholder="e.g. Shelf A-2" disabled={savingCopies} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-700 disabled:opacity-60" />
                      </div>
                      <div>
                        <label htmlFor={`copy-condition-${index}`} className="mb-2 block text-sm font-medium">Condition *</label>
                        <select id={`copy-condition-${index}`} value={copy.condition} onChange={(event) => updateCopyField(index, "condition", event.target.value)} disabled={savingCopies} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-700 disabled:opacity-60">
                          <option value="GOOD">Good</option>
                          <option value="WORN">Worn</option>
                          <option value="DAMAGED">Damaged</option>
                          <option value="UNDER_REPAIR">Under repair</option>
                        </select>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-stone-500">Initial status: Available</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={addCopyRow} disabled={savingCopies || copyForms.length >= 100} className="rounded-full border border-sky-800 px-5 py-2.5 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50">+ Add another copy</button>
                <span className="text-sm text-stone-500">{copyForms.length} of 100 copies</span>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
                <button type="submit" disabled={savingCopies} className="rounded-full bg-sky-800 px-6 py-3 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-50">
                  {savingCopies ? "Adding copies…" : `Save ${copyForms.length} ${copyForms.length === 1 ? "copy" : "copies"}`}
                </button>
                <button type="button" onClick={closeAddCopiesForm} disabled={savingCopies} className="rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
              </div>
              <p className="text-xs leading-5 text-stone-500">
                Accession numbers must be unique across the entire library.
                New copies will be registered as available.
              </p>
            </form>
          </section>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Active books</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-800">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Archived books</p>
            <p className="mt-1 text-3xl font-semibold text-stone-700">{archivedCount}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">Physical copies</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-800">{totalCopies}</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-stone-200 p-5">
            <div>
              <h2 className="text-lg font-semibold">Library books</h2>
              <p className="mt-1 text-sm text-stone-500">
                Showing {filteredBooks.length} of {books.length} book records
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, author, ISBN or accession number..."
                className="min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-emerald-700"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700"
              >
                <option value="ACTIVE">Active books</option>
                <option value="ARCHIVED">Archived books</option>
                <option value="ALL">All books</option>
              </select>
              <button onClick={() => void loadBooks()} disabled={loading} className="rounded-xl border border-emerald-800 px-5 py-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-stone-500">Loading books…</p>
          ) : filteredBooks.length === 0 ? (
            <p className="p-8 text-center text-sm text-stone-500">
              {books.length === 0 ? "No books have been added yet." : "No books match your search or filter."}
            </p>
          ) : (
            <div className="divide-y divide-stone-200">
              {filteredBooks.map((book) => (
                <article key={book.id} className="p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{book.title}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${book.isArchived ? "bg-stone-100 text-stone-700" : "bg-emerald-50 text-emerald-800"}`}>
                          {book.isArchived ? "Archived" : "Active"}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-stone-600">by {book.author}</p>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-500">
                        <span>{categoryLabel(book.category)}</span>
                        {book.isbn && <span>ISBN: {book.isbn}</span>}
                        {book.publicationYear && <span>{book.publicationYear}</span>}
                        {book.publisher && <span>{book.publisher}</span>}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg bg-stone-50 p-3">
                          <p className="text-xs text-stone-500">Total copies</p>
                          <p className="mt-1 font-semibold">{book.totalCopies}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3">
                          <p className="text-xs text-emerald-700">Available</p>
                          <p className="mt-1 font-semibold text-emerald-800">{book.availableCopies}</p>
                        </div>
                        <div className="rounded-lg bg-amber-50 p-3">
                          <p className="text-xs text-amber-700">Borrowed</p>
                          <p className="mt-1 font-semibold text-amber-800">{book.borrowedCopies}</p>
                        </div>
                        <div className="rounded-lg bg-stone-50 p-3">
                          <p className="text-xs text-stone-500">Reviews</p>
                          <p className="mt-1 font-semibold">{book.reviewCount}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === book.id ? null : book.id)}
                        className="mt-4 text-sm font-medium text-emerald-800 hover:underline"
                      >
                        {expandedId === book.id ? "Hide physical copies ↑" : `View physical copies (${book.totalCopies}) ↓`}
                      </button>

                      {expandedId === book.id && (
                        <div className="mt-4 space-y-3">
                          {book.copies.length === 0 ? (
                            <p className="text-sm text-stone-500">No physical copies registered.</p>
                          ) : (
                            book.copies.map((copy) => (
                              <div key={copy.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <p className="font-medium">{copy.accessionNumber}</p>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                                      {statusLabel(copy.status)}
                                    </span>
                                  </div>

                                  {copy.status !== "BORROWED" && (
                                    <button
                                      type="button"
                                      onClick={() => openCopyEditor(book, copy)}
                                      className="rounded-full border border-sky-800 px-4 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50"
                                    >
                                      Edit copy
                                    </button>
                                  )}
                                </div>

                                <div className="mt-2 grid gap-1 text-sm text-stone-600 sm:grid-cols-3">
                                  <p>Shelf: {copy.shelfLocation}</p>
                                  <p>Condition: {conditionLabel(copy.condition)}</p>
                                  <p>Previous loans: {copy.totalLoans}</p>
                                </div>

                                {copy.status === "BORROWED" && (
                                  <p className="mt-2 text-xs text-amber-700">
                                    Currently borrowed. Copy editing is disabled until it is returned.
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!book.isArchived && (
                        <button type="button" onClick={() => openAddCopiesForm(book)} className="rounded-full border border-sky-800 px-5 py-2.5 text-sm font-medium text-sky-800 hover:bg-sky-50">
                          + Add copies
                        </button>
                      )}

                      <button type="button" onClick={() => openEditForm(book)} className="rounded-full border border-emerald-800 px-5 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
                        Edit
                      </button>

                      {book.isArchived ? (
                        <button onClick={() => void updateBook(book, "RESTORE")} disabled={updatingId === book.id} className="rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">
                          {updatingId === book.id ? "Updating…" : "Restore"}
                        </button>
                      ) : (
                        <button onClick={() => void updateBook(book, "ARCHIVE")} disabled={updatingId === book.id} className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">
                          {updatingId === book.id ? "Updating…" : "Archive"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="mt-5 text-xs leading-5 text-stone-500">
          Archiving hides a book from the public catalogue without deleting its
          physical copies, reviews or borrowing history. Editing changes only
          catalogue details. New physical copies receive unique accession
          numbers. Borrowed copies cannot be edited until returned.
        </p>
      </div>
    </main>
  );
}