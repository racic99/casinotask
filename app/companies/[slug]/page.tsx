import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import StarRating from "@/components/StarRating";
import ReviewCard from "@/components/ReviewCard";
import ReviewForm from "@/components/ReviewForm";
import Link from "next/link";
import type { Review } from "@/types/database";
import { JsonLd, organizationSchema, breadcrumbList } from "@/lib/jsonld";
import { getCompanyBySlug, getCompanyReviews } from "@/lib/queries";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

const REVIEWS_PER_PAGE = 20;
// Number of reviews embedded into the Organization JSON-LD as a sample.
const JSONLD_REVIEW_SAMPLE = 5;

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// React cache() dedupes the (already cached) profile read within a single
// request so generateMetadata and the page don't both pay for it.
const getCompany = cache((slug: string) => getCompanyBySlug(slug));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const company = await getCompany(slug);

  if (!company) {
    return { title: "Company not found", robots: { index: false, follow: false } };
  }

  const rating = company.company_ratings?.[0];
  const avgRating = rating?.avg_rating ?? 0;
  const reviewCount = rating?.review_count ?? 0;

  const ratingFragment =
    reviewCount > 0
      ? `Rated ${avgRating.toFixed(1)}/5 from ${reviewCount} review${reviewCount !== 1 ? "s" : ""}. `
      : "";
  const description =
    company.description?.trim() ||
    `${ratingFragment}Read verified reviews of ${company.name}.`;

  // Self-referencing canonical per page so paginated review views aren't deduped.
  const canonical =
    page > 1
      ? `/companies/${company.slug}?page=${page}`
      : `/companies/${company.slug}`;

  return {
    title: page > 1 ? `${company.name} reviews — Page ${page}` : `${company.name} reviews`,
    description: description.slice(0, 160),
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${company.name} reviews`,
      description: description.slice(0, 200),
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: `${company.name} reviews`,
      description: description.slice(0, 200),
    },
  };
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const supabase = await createClient();

  const [company, { data: { user } }] = await Promise.all([
    getCompany(slug),
    supabase.auth.getUser(),
  ]);

  if (!company) notFound();

  const from = (page - 1) * REVIEWS_PER_PAGE;
  const to = from + REVIEWS_PER_PAGE - 1;

  // Cached public reviews (cookie-less). The to-one `profiles` embed is a single
  // object at runtime; the untyped client widens it to an array, so normalize.
  const { rows: reviewRows, count: reviewTotal } = await getCompanyReviews(
    company.id,
    from,
    to
  );
  const reviews = reviewRows as unknown as Review[];

  const rating = company.company_ratings?.[0];
  const avgRating = rating?.avg_rating ?? 0;
  const reviewCount = rating?.review_count ?? 0;

  const totalPages = Math.max(1, Math.ceil((reviewTotal ?? 0) / REVIEWS_PER_PAGE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const buildHref = (target: number) =>
    target > 1
      ? `/companies/${company.slug}?page=${target}`
      : `/companies/${company.slug}`;

  let hasReviewed = false;
  if (user) {
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("company_id", company.id)
      .eq("user_id", user.id)
      .maybeSingle();
    hasReviewed = existingReview !== null;
  }

  const orgSchema = organizationSchema({
    name: company.name,
    slug: company.slug,
    description: company.description,
    domain: company.domain,
    avgRating,
    reviewCount,
    reviews: reviews.slice(0, JSONLD_REVIEW_SAMPLE).map((r) => ({
      author: r.profiles?.display_name ?? "Anonymous",
      rating: r.rating,
      title: r.title,
      body: r.body,
      datePublished: r.created_at,
    })),
  });

  const breadcrumbs = breadcrumbList([
    { name: "Home", path: "/" },
    { name: "Companies", path: "/companies" },
    { name: company.name, path: `/companies/${company.slug}` },
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <JsonLd schema={[orgSchema, breadcrumbs]} />
      {/* Company header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-500 shrink-0">
            {company.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
                {company.domain && (
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:underline"
                  >
                    {company.domain}
                  </a>
                )}
              </div>
              {company.category && (
                <span className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                  {company.category}
                </span>
              )}
            </div>
            {company.description && (
              <p className="mt-2 text-gray-500 text-sm">{company.description}</p>
            )}
          </div>
        </div>

        {/* TrustScore */}
        <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-3">
          <span className="text-3xl font-bold text-gray-900">
            {avgRating > 0 ? avgRating.toFixed(1) : "—"}
          </span>
          <div>
            <StarRating rating={avgRating} size="md" />
            <p className="text-sm text-gray-400 mt-0.5">
              {reviewCount === 0
                ? "No reviews yet"
                : `${reviewCount} review${reviewCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Write a review */}
        <div className="lg:col-span-1">
          {user ? (
            hasReviewed ? (
              <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-500">
                You have already reviewed this company.
              </div>
            ) : (
              <ReviewForm companyId={company.id} companySlug={company.slug} />
            )
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
              <p className="text-sm text-gray-500 mb-3">Sign in to write a review</p>
              <Link
                href={`/auth/login?next=/companies/${company.slug}`}
                className="inline-block px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-full hover:bg-green-700"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>

        {/* Reviews list */}
        <div className="lg:col-span-2 space-y-3">
          {reviews.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No reviews yet — be the first!
            </div>
          ) : (
            <>
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}

              {(hasPrev || hasNext) && (
                <nav
                  className="pt-4 flex items-center justify-between"
                  aria-label="Reviews pagination"
                >
                  {hasPrev ? (
                    <Link
                      href={buildHref(page - 1)}
                      rel="prev"
                      className="px-4 py-2 text-sm font-medium text-gray-700 rounded-full border border-gray-200 hover:bg-gray-50"
                    >
                      ← Newer
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
                      Older →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
