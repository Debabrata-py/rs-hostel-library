
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Book = {
  id: string;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  isbn: string | null;
  cover_image_path: string | null;
  created_at: string;
  shelf_locations: string;
  available_copies: number;
  borrowed_copies: number;
  total_reads: number;
  copies: {
    id: string;
    accession_number: string;
    shelf_location: string;
    status: "AVAILABLE" | "BORROWED" | "UNAVAILABLE" | "RETIRED";
  }[];
};

const CATEGORIES = ["Fiction", "Non-fiction", "Magazine"] as const;

type SortOption =
  | "title_asc"
  | "title_desc"
  | "newest"
  | "oldest"
  | "most_read"
  | "least_read";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "title_asc", label: "Alphabetical (A–Z)" },
  { value: "title_desc", label: "Reverse alphabetical (Z–A)" },
  { value: "newest", label: "Date added (newest)" },
  { value: "oldest", label: "Date added (oldest)" },
  { value: "most_read", label: "Most read" },
  { value: "least_read", label: "Least read" },
];

function getAvailability(book: Book) {
  if (book.available_copies > 0) {
    return {
      label: "Available to borrow",
      color: "text-emerald-700",
      dot: "bg-emerald-600",
    };
  }

  if (book.borrowed_copies > 0) {
    return {
      label: "Borrowed by someone",
      color: "text-red-700",
      dot: "bg-red-600",
    };
  }

  return {
    label: "Unavailable",
    color: "text-stone-500",
    dot: "bg-stone-400",
  };
}

function getCoverUrl(path: string | null) {
  if (!path || !path.startsWith("/uploads/book-covers/")) {
    return null;
  }

  return path;
}

export default function Home() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("keyword");
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [category, setCategory] = useState("All");
  const [availability, setAvailability] = useState("All");
  const [sort, setSort] = useState<SortOption>("title_asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [userRole, setUserRole] = useState<"MEMBER" | "LIBRARIAN" | null>(null);
  const canBorrow =
    userRole === "MEMBER" || userRole === "LIBRARIAN";
  const [requestedCopyIds, setRequestedCopyIds] = useState<string[]>([]);
  const [requestingCopyId, setRequestingCopyId] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const pageSize = 8;

  useEffect(() => {
    let cancelled = false;

    async function checkMemberSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!cancelled) {
          setUserRole(
            response.ok &&
              data.authenticated === true &&
              (data.user?.role === "MEMBER" || data.user?.role === "LIBRARIAN")
              ? data.user.role
              : null
          );
        }
      } catch {
        if (!cancelled) setUserRole(null);
      }
    }

    void checkMemberSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      setUserRole(null);
      setRequestedCopyIds([]);
      router.replace("/");
    }
  }

  async function requestCopy(copyId: string) {
    setRequestingCopyId(copyId);
    setRequestMessage("");
    setRequestError("");

    try {
      const response = await fetch("/api/member/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyId }),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not submit your request.");
      }

      setRequestedCopyIds((current) =>
        current.includes(copyId) ? current : [...current, copyId]
      );
      setRequestMessage(data.message || "Your borrowing request was submitted.");
    } catch (cause) {
      setRequestError(
        cause instanceof Error
          ? cause.message
          : "Could not submit your borrowing request."
      );
    } finally {
      setRequestingCopyId(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadBooks() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/catalogue", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Catalogue request failed (${response.status})`);
        }

        const data = (await response.json()) as Book[];

        if (!Array.isArray(data)) {
          throw new Error("The catalogue API returned an invalid response.");
        }

        setBooks(data);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") {
          return;
        }

        console.error("Catalogue loading error:", cause);
        setError(
          "We couldn't load the catalogue. Please refresh the page and try again."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadBooks();

    return () => {
      controller.abort();
    };
  }, []);

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    const result = books.filter((book) => {
      const matchesCategory =
        category === "All" || book.category === category;

      const matchesAvailability =
        availability === "All" ||
        (availability === "Available" && book.available_copies > 0) ||
        (availability === "Borrowed" &&
          book.available_copies === 0 &&
          book.borrowed_copies > 0) ||
        (availability === "Unavailable" &&
          book.available_copies === 0 &&
          book.borrowed_copies === 0);

      const searchableFields: Record<string, string> = {
        title: book.title,
        author: book.author,
        isbn: book.isbn ?? "",
        category: book.category ?? "",
        keyword: [
          book.title,
          book.author,
          book.isbn ?? "",
          book.category ?? "",
          book.description ?? "",
        ].join(" "),
      };

      const matchesSearch = searchableFields[searchField]
        .toLocaleLowerCase()
        .includes(query);

      return matchesCategory && matchesAvailability && matchesSearch;
    });

    return result.sort((a, b) => {
      switch (sort) {
        case "title_desc":
          return b.title.localeCompare(a.title);

        case "newest":
          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );

        case "oldest":
          return (
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
          );

        case "most_read":
          return (
            b.total_reads - a.total_reads ||
            a.title.localeCompare(b.title)
          );

        case "least_read":
          return (
            a.total_reads - b.total_reads ||
            a.title.localeCompare(b.title)
          );

        default:
          return a.title.localeCompare(b.title);
      }
    });
  }, [books, search, searchField, category, availability, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));

  const visibleBooks = filteredBooks.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchSubmitted(true);
    setPage(1);

    document.getElementById("catalogue")?.scrollIntoView({
      behavior: "smooth",
    });
  }

  function resetFilters() {
    setSearch("");
    setSearchSubmitted(false);
    setCategory("All");
    setAvailability("All");
    setSort("title_asc");
    setPage(1);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#eaf5f8] text-[#30231f]">
      <header className="sticky top-0 z-30 border-b border-[#c4e0e8] bg-[#f8fcfd]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-3xl text-[#7e1720]">▣</span>

            <span>
              <span className="block font-serif text-xl font-bold text-[#2f7186] sm:text-2xl">
                RS Hostel Library
              </span>

              <span className="block text-xs text-[#668b95] sm:text-sm">
                A little space for curious minds
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 font-serif text-sm md:flex">
            <Link
              href="/"
              className="border-b-2 border-[#367f96] pb-1 text-[#367f96]"
            >
              Home
            </Link>

            <Link href="#catalogue" className="hover:text-[#367f96]">
              Catalogue
            </Link>

            <a href="#about" className="hover:text-[#367f96]">
              About
            </a>
          </nav>

          {userRole ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {userRole === "LIBRARIAN" && (
                <Link
                  href="/librarian/requests"
                  className="rounded-full bg-[#367f96] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2f7186] sm:px-5"
                >
                  Librarian Dashboard
                </Link>
              )}
              <Link
                href="/member"
                className="rounded-full bg-[#367f96] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2f7186] sm:px-5"
              >
                My Account
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-full border border-[#b9d9e3] bg-white px-3 py-2.5 text-sm font-medium text-[#367f96] transition hover:bg-[#eaf5f8]"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-[#367f96] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#5f1118] sm:px-6"
            >
              ♙ Member login
            </Link>
          )}
        </div>
      </header>

      <section
        className="relative isolate min-h-[300px] border-b border-[#c4e0e8] bg-[#cfe7ee] sm:min-h-[350px] lg:min-h-[390px]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(242,250,252,.97) 0%, rgba(242,250,252,.88) 30%, rgba(242,250,252,.20) 58%, rgba(242,250,252,.02) 100%), url('/library-reading-scene.jpg')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto flex max-w-[1440px] items-center px-6 py-12 sm:px-10 sm:py-14 lg:min-h-[390px]">
          <div className="relative z-10 max-w-xl">
            <h1 className="font-serif text-4xl font-bold leading-[1.08] text-[#2f7186] sm:text-5xl lg:text-6xl">
              Read.
              <br />
              Question. Resist.
            </h1>

            <p className="mt-3 font-serif text-lg text-[#302b27] sm:text-xl">
              Books keep the mind unconquered.
            </p>

            <div className="mt-5 h-px w-14 bg-[#367f96]" />
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-4 max-w-[1250px] px-4 sm:-mt-8 sm:px-8">
        <div className="rounded-2xl border border-[#c4e0e8] bg-[#f8fcfd] p-5 shadow-[0_16px_50px_rgba(80,47,26,0.12)] sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-6 border-b border-[#d4e8ee]">
            <h2 className="border-b-2 border-[#a21d2a] pb-3 font-serif text-sm font-bold text-[#367f96]">
              ⌕ &nbsp; Search the catalogue
            </h2>

            <span className="pb-3 font-serif text-sm text-[#536477]">
              ☷ &nbsp; Advanced search
            </span>
          </div>

          <form onSubmit={submitSearch} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
              <label className="sr-only" htmlFor="search-field">
                Search field
              </label>

              <select
                id="search-field"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                className="min-w-0 rounded-lg border border-[#b9d9e3] bg-white px-3 py-3 font-serif text-sm outline-none focus:border-[#367f96]"
              >
                <option value="keyword">Keyword</option>
                <option value="title">Title</option>
                <option value="author">Author</option>
                <option value="category">Category / Subject</option>
                <option value="isbn">ISBN</option>
              </select>

              <label className="sr-only" htmlFor="catalogue-search">
                Search books
              </label>

              <input
                id="catalogue-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, author, keyword or ISBN..."
                className="min-w-0 rounded-lg border border-[#b9d9e3] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#367f96] focus:ring-2 focus:ring-[#367f96]/10"
              />

              <button
                type="submit"
                className="rounded-lg bg-[#367f96] px-7 py-3 font-serif text-sm font-semibold text-white transition hover:bg-[#62121b]"
              >
                ⌕ &nbsp; Search
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr]">
              <label className="block text-xs text-[#587985]">
                Category

                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-[#b9d9e3] bg-white px-3 py-2.5 text-sm text-[#45352c] outline-none focus:border-[#367f96]"
                >
                  <option value="All">
                    All categories (Fiction / Non-fiction / Magazine)
                  </option>

                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-[#587985]">
                Availability

                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-[#b9d9e3] bg-white px-3 py-2.5 text-sm text-[#45352c] outline-none focus:border-[#367f96]"
                >
                  <option value="All">All books</option>
                  <option value="Available">Available to borrow</option>
                  <option value="Borrowed">Borrowed by someone</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </label>

              <div className="hidden items-center gap-3 rounded-lg bg-[#e8f4f7] px-4 py-3 lg:flex">
                <span className="text-2xl text-[#367f96]">♧</span>

                <div>
                  <p className="font-serif text-sm font-semibold text-[#302b27]">
                    Looking for something specific?
                  </p>

                  <p className="mt-1 text-xs text-[#8b7a6f]">
                    Search by title, author, ISBN or keyword to find books in
                    our collection.
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article
            className="relative flex min-h-[146px] items-center overflow-hidden rounded-lg border border-[#f0d8c5] bg-[#eaf5f8] p-5"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(242,250,252,.94), rgba(242,250,252,.68)), url('/quote-bg-1.jpg')",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div className="relative z-10 max-w-[90%]">
              <p className="font-serif text-xl italic leading-7 text-[#2f7186]">
                “A book is a weapon in the hands of those who refuse to be
                silent.”
              </p>

              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#527d89]">
                — James Baldwin
              </p>
            </div>
          </article>

          <article
            className="relative flex min-h-[146px] items-center overflow-hidden rounded-lg border border-[#f0d8c5] bg-[#d9edf3] p-5"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(242,250,252,.92), rgba(242,250,252,.30)), url('/quote-bg-2.jpg')",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div className="relative z-10 max-w-[82%]">
              <p className="font-serif text-xl italic leading-7 text-[#2f7186]">
                “Fascism thrives in ignorance; books keep the mind unconquered.”
              </p>

              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#527d89]">
                — A library motto
              </p>
            </div>
          </article>

          <article
            className="relative flex min-h-[146px] items-center overflow-hidden rounded-lg border border-[#c4e0e8] bg-[#e4f2f6] p-5"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(242,250,252,.95), rgba(242,250,252,.65)), url('/quote-bg-3.jpg')",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div className="relative z-10 max-w-[86%]">
              <p className="font-serif text-xl italic leading-7 text-[#2f7186]">
                “A room without books is a weaker room against tyranny.”
              </p>

              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#527d89]">
                — Reading and resistance
              </p>
            </div>
          </article>

          <article
            className="relative flex min-h-[140px] items-center overflow-hidden rounded-xl border border-[#c4e0e8] bg-[#d9edf3] p-5"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(242,250,252,.92) 0%, rgba(242,250,252,.48) 45%, rgba(242,250,252,.04) 100%), url('/hirak-rajar-deshe-illustration.png')",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div className="relative z-10">
              <p className="font-serif text-xl font-bold leading-7 text-[#367f96]">
                ওরা যত বেশি পড়ে,
                <br />
                তত বেশি জানে,
                <br />
                তত কম মানে।
              </p>

              <p className="mt-3 text-xs text-[#7c463a]">
                — হীরক রাজার দেশে
              </p>
            </div>
          </article>
        </div>
      </section>

      <section
        id="catalogue"
        className="mx-auto max-w-[1440px] scroll-mt-24 px-5 pb-14 sm:px-8"
      >
        {(requestMessage || requestError) && (
          <div
            role={requestError ? "alert" : "status"}
            className={`mb-5 rounded-xl p-4 text-sm ${
              requestError
                ? "border border-red-200 bg-red-50 text-red-800"
                : "border border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {requestError || requestMessage}
            <button
              type="button"
              onClick={() => {
                setRequestMessage("");
                setRequestError("");
              }}
              className="ml-3 font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#527d89]">
              The collection
            </p>

            <h2 className="mt-2 font-serif text-4xl font-bold text-[#2f7186] sm:text-5xl">
              Library catalogue
            </h2>

            <p className="mt-2 font-serif text-lg italic text-[#668b95]">
              Explore the collection and discover your next favourite book.
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm text-[#587985]">
            Sort by

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-lg border border-[#b9d9e3] bg-white px-3 py-2.5 text-[#45352c] outline-none focus:border-[#367f96]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-7 flex flex-wrap gap-2">
          {[
            { value: "All", label: "▦  All books" },
            { value: "Fiction", label: "▤  Fiction" },
            { value: "Non-fiction", label: "▤  Non-fiction" },
            { value: "Magazine", label: "▤  Magazine" },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setCategory(item.value);
                setPage(1);
              }}
              className={`rounded-lg border px-5 py-3 text-sm transition ${
                category === item.value
                  ? "border-[#367f96] bg-[#367f96] text-white shadow-sm"
                  : "border-[#c4e0e8] bg-white text-[#5e5048] hover:border-[#5b9caf] hover:text-[#367f96]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[245px_1fr]">
          <aside className="rounded-xl border border-[#c4e0e8] bg-[#f8fcfd]">
            <div className="border-b border-[#c4e0e8] bg-[#e0f0f4] px-4 py-3 font-serif font-semibold">
              ☷ &nbsp; Refine your search
            </div>

            <div className="space-y-6 p-4">
              <fieldset>
                <legend className="mb-3 font-serif text-sm font-bold">
                  Availability
                </legend>

                {[
                  ["All", "All books"],
                  ["Available", "Available to borrow"],
                  ["Borrowed", "Borrowed by someone"],
                  ["Unavailable", "Unavailable"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-[#587985]"
                  >
                    <input
                      type="radio"
                      name="sidebar-availability"
                      checked={availability === value}
                      onChange={() => {
                        setAvailability(value);
                        setPage(1);
                      }}
                      className="accent-[#367f96]"
                    />

                    {label}
                  </label>
                ))}
              </fieldset>

              <div className="border-t border-[#d4e8ee]" />

              <fieldset>
                <legend className="mb-3 font-serif text-sm font-bold">
                  Category
                </legend>

                {CATEGORIES.map((item) => (
                  <label
                    key={item}
                    className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-[#587985]"
                  >
                    <input
                      type="radio"
                      name="sidebar-category"
                      checked={category === item}
                      onChange={() => {
                        setCategory(item);
                        setPage(1);
                      }}
                      className="accent-[#367f96]"
                    />

                    {item}
                  </label>
                ))}

                <button
                  onClick={() => {
                    setCategory("All");
                    setPage(1);
                  }}
                  className="mt-1 text-xs text-[#367f96] underline underline-offset-2"
                >
                  Show all categories
                </button>
              </fieldset>

              <div className="border-t border-[#d4e8ee]" />

              <fieldset>
                <legend className="mb-3 font-serif text-sm font-bold">
                  Sort by
                </legend>

                {SORT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-[#587985]"
                  >
                    <input
                      type="radio"
                      name="sidebar-sort"
                      checked={sort === option.value}
                      onChange={() => {
                        setSort(option.value);
                        setPage(1);
                      }}
                      className="accent-[#367f96]"
                    />

                    {option.label}
                  </label>
                ))}
              </fieldset>

              <button
                onClick={resetFilters}
                className="w-full rounded-lg border border-[#b9d9e3] px-3 py-2 text-sm text-[#367f96] transition hover:bg-[#eaf5f8]"
              >
                Reset filters
              </button>
            </div>
          </aside>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-[#587985]">
              <p>
                {loading
                  ? "Loading catalogue…"
                  : `${filteredBooks.length} books found`}
              </p>

              {searchSubmitted && search.trim() && (
                <p>
                  Results for <strong>“{search.trim()}”</strong>
                </p>
              )}
            </div>

            {loading && (
              <div className="rounded-xl border border-[#c4e0e8] bg-white p-12 text-center text-[#587985]">
                Loading books from the library…
              </div>
            )}

            {!loading && error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800"
              >
                <p className="font-semibold">Catalogue unavailable</p>
                <p className="mt-2 text-sm">{error}</p>

                <p className="mt-2 text-xs">
                  Check the browser console for the database error.
                </p>
              </div>
            )}

            {!loading && !error && filteredBooks.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#b9d9e3] bg-white/70 p-12 text-center">
                <p className="font-serif text-xl text-[#2f7186]">
                  No books found
                </p>

                <p className="mt-2 text-sm text-[#587985]">
                  Try a different search or reset the filters.
                </p>

                <button
                  onClick={resetFilters}
                  className="mt-5 rounded-full bg-[#367f96] px-5 py-2.5 text-sm text-white"
                >
                  Show all books
                </button>
              </div>
            )}

            {!loading && !error && visibleBooks.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {visibleBooks.map((book) => {
                  const status = getAvailability(book);
                  const coverUrl = getCoverUrl(book.cover_image_path);

                  return (
                    <article
                      key={book.id}
                      className="group overflow-hidden rounded-xl border border-[#c4e0e8] bg-[#f8fcfd] transition duration-200 hover:-translate-y-1 hover:border-[#d7bba5] hover:shadow-[0_12px_30px_rgba(74,45,29,0.10)]"
                    >
                      <div className="flex h-56 items-center justify-center bg-[#e5f2f6] p-3">
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={`Cover of ${book.title}`}
                            loading="lazy"
                            className="h-full max-w-full object-contain drop-shadow-md"
                          />
                        ) : (
                          <div className="flex h-44 w-32 items-center justify-center rounded border border-[#b9d9e3] bg-[#ead9bd] px-3 text-center font-serif text-lg text-[#587985] shadow-md">
                            {book.title}
                          </div>
                        )}
                      </div>

                      <div className="p-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs ${
                            book.category === "Fiction"
                              ? "bg-rose-100 text-rose-800"
                              : book.category === "Non-fiction"
                                ? "bg-sky-100 text-sky-800"
                                : book.category === "Magazine"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {book.category || "Uncategorised"}
                        </span>

                        <h3 className="mt-3 line-clamp-2 font-serif text-lg font-bold leading-snug text-[#302b27]">
                          {book.title}
                        </h3>

                        <p className="mt-1 line-clamp-1 text-sm text-[#668b95]">
                          by {book.author}
                        </p>

                        <p
                          className={`mt-3 flex items-center gap-2 text-xs font-medium ${status.color}`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${status.dot}`}
                          />

                          {status.label}
                        </p>

                        <div className="mt-3 border-t border-[#d4e8ee] pt-3">
                          <p className="text-xs text-[#668b95]">
                            Shelf: {book.shelf_locations || "Not recorded"}
                          </p>

                          {book.isbn && (
                            <p className="mt-1 break-all text-xs text-[#a08e81]">
                              ISBN: {book.isbn}
                            </p>
                          )}

                          {book.copies.length > 0 && (
                            <div className="mt-4 space-y-2">
                              <p className="text-xs font-semibold text-[#587985]">
                                Physical copies
                              </p>

                              {book.copies.map((copy) => (
                                <div
                                  key={copy.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#eef7fa] p-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-[#302b27]">
                                      Accession: {copy.accession_number}
                                    </p>
                                    <p className="text-[11px] text-[#668b95]">
                                      Shelf: {copy.shelf_location}
                                    </p>
                                    <p
                                      className={`mt-0.5 text-[11px] font-medium ${
                                        copy.status === "AVAILABLE"
                                          ? "text-emerald-700"
                                          : "text-stone-500"
                                      }`}
                                    >
                                      {copy.status === "AVAILABLE"
                                        ? "Available"
                                        : copy.status === "BORROWED"
                                          ? "Borrowed"
                                          : copy.status === "RETIRED"
                                            ? "Retired"
                                            : "Unavailable"}
                                    </p>
                                  </div>

                                  {copy.status === "AVAILABLE" && (
                                    canBorrow ? (
                                      <button
                                        type="button"
                                        onClick={() => void requestCopy(copy.id)}
                                        disabled={
                                          requestingCopyId === copy.id ||
                                          requestedCopyIds.includes(copy.id)
                                        }
                                        className="shrink-0 rounded-full bg-[#367f96] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#2f7186] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {requestingCopyId === copy.id
                                          ? "Requesting…"
                                          : requestedCopyIds.includes(copy.id)
                                            ? "Request sent"
                                            : "Request to borrow"}
                                      </button>
                                    ) : (
                                      <Link
                                        href="/login"
                                        className="shrink-0 rounded-full border border-[#b9d9e3] bg-white px-3 py-1.5 text-xs font-medium text-[#367f96] hover:bg-[#eaf5f8]"
                                      >
                                        Log in to request
                                      </Link>
                                    )
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {!loading && !error && filteredBooks.length > pageSize && (
              <nav
                aria-label="Catalogue pagination"
                className="mt-8 flex flex-wrap items-center justify-center gap-2"
              >
                <button
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="rounded-lg border border-[#b9d9e3] bg-white px-3 py-2 text-sm disabled:opacity-40"
                >
                  ←
                </button>

                {Array.from(
                  { length: totalPages },
                  (_, index) => index + 1
                )
                  .filter(
                    (number) =>
                      number === 1 ||
                      number === totalPages ||
                      Math.abs(number - page) <= 2
                  )
                  .map((number, index, items) => (
                    <span key={number} className="contents">
                      {index > 0 && number - items[index - 1] > 1 && (
                        <span className="px-1 text-[#587985]">…</span>
                      )}

                      <button
                        onClick={() => setPage(number)}
                        aria-current={page === number ? "page" : undefined}
                        className={`min-w-9 rounded-lg border px-3 py-2 text-sm ${
                          page === number
                            ? "border-[#367f96] bg-[#367f96] text-white"
                            : "border-[#b9d9e3] bg-white text-[#5e5048] hover:border-[#367f96]"
                        }`}
                      >
                        {number}
                      </button>
                    </span>
                  ))}

                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-[#b9d9e3] bg-white px-3 py-2 text-sm disabled:opacity-40"
                >
                  →
                </button>
              </nav>
            )}
          </div>
        </div>
      </section>

      <section
        id="about"
        className="relative overflow-hidden border-y border-[#b9d9e3] bg-[#cfe7ee] px-5 py-12 text-center sm:py-16"
        style={{
          backgroundImage:
            "linear-gradient(rgba(230,246,250,.22), rgba(230,246,250,.22)), url('/protest-footer.jpg')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto max-w-3xl rounded-2xl bg-[#eff8fb]/80 px-6 py-5 shadow-sm backdrop-blur-[1px]">
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-[#527d89]">
            Read · Remember · Resist
          </p>

          <blockquote className="font-serif text-2xl italic leading-relaxed text-[#2f7186] sm:text-3xl">
            “To read is to refuse the world as it is and to insist on what it
            could be. That refusal is a form of resistance.”
          </blockquote>

          <p className="mt-5 text-xs uppercase tracking-[0.22em] text-[#527d89]">
            — bell hooks
          </p>
        </div>
      </section>

      <footer className="border-t border-[#b9d9e3] bg-[#f4fafc] px-5 py-7 text-center text-sm text-[#668b95]">
        <p className="font-serif text-base text-[#2f7186]">
          RS Hostel Library
        </p>

        <p className="mt-2">
          A library for curious minds and a world worth questioning.
        </p>

        <p className="mt-3 text-xs">
          © {new Date().getFullYear()} RS Hostel Library
        </p>
      </footer>
    </main>
  );
}