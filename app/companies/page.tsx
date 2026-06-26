import Link from "next/link";
import type { Metadata } from "next";
import CompanyCard from "@/components/CompanyCard";
import type { CompanyCardItem } from "@/types/database";
import { JsonLd, breadcrumbList } from "@/lib/jsonld";
import { getRankedCompanies } from "@/lib/queries";

const PAGE_SIZE = 24;

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  if (q) {
    // Bare search-query URLs are thin/duplicate; keep them out of the index.
    return {
      title: `Search: ${q}`,
      description: `Companies matching "${q}".`,
      robots: { index: false, follow: true },
      alternates: { canonical: "/companies" },
    };
  }

  // Self-referencing canonical per page so paginated views aren't deduped.
  const canonical = page > 1 ? `/companies?page=${page}` : "/companies";

  return {
    title: page > 1 ? `All companies — Page ${page}` : "All companies",
    description: "Browse and compare companies ranked by verified review scores.",
    alternates: { canonical },
  };
}

export default async function CompaniesPage({ searchParams }: Props) {
  const { q, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Cached, cookie-less read ranked by Bayesian score; cards show raw avg + count.
  const { rows, count } = await getRankedCompanies(q, from, to);

  const companiesWithRatings: CompanyCardItem[] = rows.map((row) => {
    const rating = (row.company_ratings as { avg_rating: number | null; review_count: number }[] | null)?.[0];
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      domain: row.domain as string | null,
      category: row.category as string | null,
      description: row.description as string | null,
      avg_rating: rating?.avg_rating ?? null,
      review_count: rating?.review_count ?? 0,
    };
  });

  const totalCount = count;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/companies?${qs}` : "/companies";
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <JsonLd
        schema={breadcrumbList([
          { name: "Home", path: "/" },
          { name: "Companies", path: "/companies" },
        ])}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {q ? `Results for "${q}"` : "All companies"}
        </h1>
        <Link
          href="/companies/new"
          className="px-4 py-2 text-sm font-medium text-white bg-green-700 rounded-full hover:bg-green-800 text-center"
        >
          + Add company
        </Link>
      </div>

      {/* Search */}
      <form action="/companies" method="get" className="mb-8">
        <div className="flex gap-2 max-w-md">
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search companies…"
            className="flex-1 rounded-full border border-gray-300 px-5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium text-white bg-green-700 rounded-full hover:bg-green-800"
          >
            Search
          </button>
          {q && (
            <Link
              href="/companies"
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {companiesWithRatings.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {q ? (
            <>
              <p>No companies found for &quot;{q}&quot;.</p>
              <Link href="/companies/new" className="mt-2 inline-block text-green-700 hover:underline text-sm">
                Add it →
              </Link>
            </>
          ) : (
            <p>No companies yet.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companiesWithRatings.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}

      {(hasPrev || hasNext) && (
        <nav
          className="mt-10 flex items-center justify-between"
          aria-label="Pagination"
        >
          {hasPrev ? (
            <Link
              href={buildHref(page - 1)}
              rel="prev"
              className="px-4 py-2 text-sm font-medium text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          {hasNext ? (
            <Link
              href={buildHref(page + 1)}
              rel="next"
              className="px-4 py-2 text-sm font-medium text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
