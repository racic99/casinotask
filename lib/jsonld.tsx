import { absoluteUrl, SITE_NAME } from "./seo";

/**
 * Minimal, typed builders for the JSON-LD schemas this site emits. Each returns
 * a plain object that is serialized into a <script type="application/ld+json">
 * via the <JsonLd> component below. Shapes follow schema.org and Google's
 * structured-data guidelines so they qualify for rich results.
 */

type JsonLdDocument = Record<string, unknown> & { "@context": "https://schema.org" };

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbList(items: BreadcrumbItem[]): JsonLdDocument {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webSiteSearch(): JsonLdDocument {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/companies")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export type OrganizationReview = {
  author: string;
  rating: number;
  title: string;
  body: string;
  datePublished: string;
};

export type OrganizationSchemaInput = {
  name: string;
  slug: string;
  description?: string | null;
  domain?: string | null;
  avgRating: number;
  reviewCount: number;
  reviews: OrganizationReview[];
};

export function organizationSchema(input: OrganizationSchemaInput): JsonLdDocument {
  const schema: JsonLdDocument = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: absoluteUrl(`/companies/${input.slug}`),
  };

  if (input.description) schema.description = input.description;
  if (input.domain) schema.sameAs = [`https://${input.domain}`];

  // aggregateRating reports the honest raw mean + count (not the Bayesian
  // ranking score). Only emitted when at least one review exists, per Google's
  // requirement that aggregateRating reference real reviews.
  if (input.reviewCount > 0 && input.avgRating > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.avgRating.toFixed(1),
      reviewCount: input.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (input.reviews.length > 0) {
    schema.review = input.reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      datePublished: r.datePublished,
      name: r.title,
      reviewBody: r.body,
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
    }));
  }

  return schema;
}

/**
 * Renders one or more JSON-LD documents as a server-rendered script tag.
 * Safe because the input is our own typed objects, not user-controlled HTML;
 * we still guard against the `</script>` break-out sequence.
 */
export function JsonLd({ schema }: { schema: object | object[] }) {
  const json = JSON.stringify(schema).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
