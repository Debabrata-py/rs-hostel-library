
"use client";

import { useState } from "react";
import Link from "next/link";

type ImportPreview = {
  message: string;
  totalRows: number;
  validRows: number;
  bookCount: number;
  copyCount: number;
  errors: { row: number; message: string }[];
  preview: {
    title: string;
    author: string;
    category: string;
    copies: number;
  }[];
};

export default function ImportBooksPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: "preview" | "import") {
    if (!file) {
      setMessage("Please select a CSV or Excel file first.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("action", action);

      const response = await fetch("/api/librarian/books/import", {
        method: "POST",
        body: form,
      });

      const result = await response.json();

      if (action === "preview") {
        setPreview(result as ImportPreview);
      }

      setMessage(result.message || "Request completed.");

      if (action === "import" && response.ok) {
        setPreview(null);
        setFile(null);
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-10 text-stone-900">
      <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <Link
          href="/librarian/books"
          className="text-sm font-medium text-sky-800 hover:text-sky-950 hover:underline"
        >
          ← Back to Manage Books
        </Link>

        <h1 className="mt-4 text-3xl font-semibold text-gray-950">
          Import Books
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-700">
          Upload a CSV or Excel spreadsheet to add books and their physical
          copies to the library catalogue.
        </p>
      </div>

      <section className="rounded-xl border border-gray-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">
          1. Select your spreadsheet
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-700">
          Supported formats: CSV and XLSX. Maximum file size: 3 MB.
          Maximum 500 data rows.
        </p>

        <div className="mt-5">
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMessage("");
            }}
            className="block w-full text-sm text-gray-900 file:mr-4 file:rounded-lg file:border file:border-gray-300 file:bg-gray-100 file:px-4 file:py-2 file:font-medium file:text-gray-800 hover:file:bg-gray-200"
          />
        </div>

        {file && (
          <p className="mt-3 text-sm text-gray-800">
            Selected: <strong>{file.name}</strong>
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => submit("preview")}
            disabled={!file || busy}
            className="rounded-lg bg-sky-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Please wait..." : "Preview Spreadsheet"}
          </button>

          <Link
            href="/librarian/books"
            className="rounded-lg border border-gray-400 bg-white px-5 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            Cancel
          </Link>
        </div>

        {message && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-950"
          >
            {message}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-gray-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">
          2. Spreadsheet columns
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-700">
          Use one row for each physical copy. If several rows have the same
          ISBN, they will be grouped as copies of one book.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-800">
            <thead>
              <tr className="border-b-2 border-gray-300 bg-gray-50">
                <th className="py-3 pr-4 font-semibold text-gray-950">
                  Column
                </th>
                <th className="py-3 pr-4 font-semibold text-gray-950">
                  Required?
                </th>
                <th className="py-3 font-semibold text-gray-950">
                  Example
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["title", "Yes", "The Guide"],
                ["author", "Yes", "R. K. Narayan"],
                ["category", "Yes", "Fiction"],
                ["accessionNumber", "Yes", "RS001"],
                ["shelf", "Yes", "A-02"],
                ["isbn", "No", "978014XXXXXXX"],
                ["publisher", "No", "Penguin"],
                ["publicationYear", "No", "1958"],
                ["edition", "No", "First Edition"],
                ["language", "No", "English"],
                ["description", "No", "A short description"],
                ["condition", "No", "good"],
              ].map(([column, required, example]) => (
                <tr
                  key={column}
                  className="border-b border-gray-200 last:border-0 hover:bg-gray-50"
                >
                  <td className="py-2.5 pr-4 font-mono text-gray-950">
                    {column}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-800">{required}</td>
                  <td className="py-2.5 text-gray-700">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs leading-5 text-gray-700">
          Categories: Fiction, Non-fiction, Magazine. Conditions: good,
          worn, damaged, under_repair. If condition is blank, it defaults to
          good.
        </p>
      </section>

      {preview && (
        <section className="mt-6 rounded-xl border border-gray-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">
            3. Import preview
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Rows", preview.totalRows],
              ["Valid rows", preview.validRows],
              ["Books", preview.bookCount],
              ["Copies", preview.copyCount],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-950">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {preview.errors?.length > 0 && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="font-semibold text-red-900">
                Errors ({preview.errors.length})
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-red-800">
                {preview.errors.map((error, index) => (
                  <li key={`${error.row}-${index}`}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.preview?.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-950">
                Books detected
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-800">
                  <thead>
                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                      <th className="py-3 pr-3 font-semibold text-gray-950">
                        Title
                      </th>
                      <th className="py-3 pr-3 font-semibold text-gray-950">
                        Author
                      </th>
                      <th className="py-3 pr-3 font-semibold text-gray-950">
                        Category
                      </th>
                      <th className="py-3 font-semibold text-gray-950">
                        Copies
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((book, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-200 last:border-0 hover:bg-gray-50"
                      >
                        <td className="py-3 pr-3 font-medium text-gray-950">
                          {book.title}
                        </td>
                        <td className="py-3 pr-3 text-gray-800">
                          {book.author}
                        </td>
                        <td className="py-3 pr-3 text-gray-800">
                          {book.category}
                        </td>
                        <td className="py-3 font-semibold text-gray-950">
                          {book.copies}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.bookCount > 20 && (
                <p className="mt-2 text-xs text-gray-600">
                  Showing the first 20 books only.
                </p>
              )}
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => submit("import")}
              disabled={
                busy ||
                preview.errors.length > 0 ||
                preview.validRows === 0
              }
              className="rounded-lg bg-sky-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Importing..." : "Confirm and Import"}
            </button>
            <p className="mt-2 text-xs leading-5 text-gray-700">
              Import is cancelled automatically if validation detects an error.
            </p>
          </div>
        </section>
      )}
        </div>
    </main>
  );
}
