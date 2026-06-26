import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/utils/supabase/public";

/**
 * Cached public data access.
 *
 * Public, slow-changing data (company listings, profiles, reviews) is read
 * through a cookie-less client and memoized with `unstable_cache`, tagged so
 * writes can invalidate exactly what changed. User-specific data (the current
 * session, "have I reviewed this") is intentionally NOT cached and stays on the
 * cookie-based server client in the page/components.
 */

// Tag for anything that depends on the company ranking/list (home + listing).
export const TAG_COMPANIES = "companies";
// Tag for a single company's profile data.
export const companyTag = (slug: string) => `company:${slug}`;
// Tag for a single company's reviews.
export const companyReviewsTag = (companyId: string) => `company-reviews:${companyId}`;

// Revalidate at most hourly as a safety net; on-demand invalidation via tags
// keeps data fresh the moment a review or company is written.
const REVALIDATE_SECONDS = 3600;

const COMPANY_SELECT =
  "id, slug, name, domain, category, description, company_ratings (avg_rating, review_count)";

const COMPANY_DETAIL_SELECT =
  "id, slug, name, domain, category, description, company_ratings (avg_rating, review_count)";

const REVIEW_SELECT =
  "id, company_id, user_id, rating, title, body, created_at, profiles (display_name)";

export type RankedCompaniesResult = {
  rows: Record<string, unknown>[];
  count: number;
};

/** Companies ranked by Bayesian score, optionally filtered by name, paginated. */
export const getRankedCompanies = unstable_cache(
  async (q: string | undefined, from: number, to: number): Promise<RankedCompaniesResult> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("companies")
      .select(COMPANY_SELECT, { count: "exact" })
      .order("bayesian_rating", { ascending: false });

    if (q) query = query.ilike("name", `%${q}%`);

    const { data, count } = await query.range(from, to);
    return { rows: (data ?? []) as Record<string, unknown>[], count: count ?? 0 };
  },
  ["ranked-companies"],
  { tags: [TAG_COMPANIES], revalidate: REVALIDATE_SECONDS }
);

/** A single company profile by slug, or null. */
export function getCompanyBySlug(slug: string) {
  return unstable_cache(
    async () => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("companies")
        .select(COMPANY_DETAIL_SELECT)
        .eq("slug", slug)
        .single();
      return data;
    },
    ["company-by-slug", slug],
    { tags: [companyTag(slug), TAG_COMPANIES], revalidate: REVALIDATE_SECONDS }
  )();
}

export type CompanyReviewsResult = {
  rows: Record<string, unknown>[];
  count: number;
};

/** A page of reviews for a company, newest first. */
export function getCompanyReviews(companyId: string, from: number, to: number) {
  return unstable_cache(
    async (): Promise<CompanyReviewsResult> => {
      const supabase = createPublicClient();
      const { data, count } = await supabase
        .from("reviews")
        .select(REVIEW_SELECT, { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { rows: (data ?? []) as Record<string, unknown>[], count: count ?? 0 };
    },
    ["company-reviews", companyId, String(from), String(to)],
    { tags: [companyReviewsTag(companyId)], revalidate: REVALIDATE_SECONDS }
  )();
}
