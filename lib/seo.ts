/**
 * Canonical site URL used for metadata, canonicals, sitemap, robots, and JSON-LD.
 *
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://reviewhub.com). Falls
 * back to localhost for local development.
 */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url) return url.replace(/\/$/, "");

  return "http://localhost:3000";
}

export const SITE_NAME = "ReviewHub";
export const SITE_DESCRIPTION =
  "Read and write honest reviews for any company.";

/** Build an absolute URL from a root-relative path against the site URL. */
export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
