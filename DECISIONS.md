# DECISIONS

This document records the choices, trade-offs, and reasoning behind the work done to take
the AI-generated review app from a flawed demo to a production-ready state, plus how AI
tooling was used and how its output was verified.

The work was planned in [ANALYSIS.md](ANALYSIS.md) (a read-only audit) and executed as a
series of focused commits:

| Commit | Scope |
|--------|-------|
| `0f63e77` | Tooling (Vitest + typecheck), N+1 fixes, correctness bugs, collision-safe slugs |
| `ebaaad7` | DB migration (Bayesian columns/triggers, IP gate, email-verification RLS, indexes) + app-layer security & auth hardening |
| `bebbdbf` | SEO layer (metadata, JSON-LD, sitemap/robots, Bayesian ranking, pagination) |
| `28d7613` | Caching/revalidation, accessibility, security headers, env validation |
| `d668970` | Unit + integration tests, CI workflow, Lighthouse measurement & perf fixes |

> **Stack:** Next.js 16.2.6 (App Router, `proxy.ts` — *not* `middleware.ts`), React 19,
> Supabase (`@supabase/ssr`), Zod 4, Tailwind 4, Vitest 3.

---

## 1. Site Architecture

### Individual review URLs — **NOT added** (no pages, no anchors)
- A standalone page per review is, by definition, **thin / duplicate content**: the same
  title + body + rating already render on the company profile. At hundreds of reviews this
  would spawn thousands of low-value URLs competing with the page we actually want to rank.
- A naive `#review-{id}` anchor doesn't solve shareability either: once reviews are
  paginated (required for crawlability), a review on page 3 isn't in the page-1 DOM, so the
  anchor silently scrolls nowhere.
- A *working* permalink would need a dynamic resolver route
  (`/companies/[slug]/reviews/[reviewId]`) that recomputes which page the review currently
  falls on and redirects — real engineering effort, with **zero SEO value** and only
  marginal product value. Deferred until genuinely requested.

### Public user-profile pages — **NOT added**
- Essentially nobody searches for "reviews by Jane Smith," so **SEO value ≈ 0**, and most
  profiles would be thin (one review each).
- The only real argument is *product* trust/credibility, which carries a privacy cost
  (aggregating a person's review history into an indexable page). If ever built, it should
  be a minimal, **`noindex`**, opt-in surface. Author attribution on the review card is
  sufficient for now.

### Indexability decisions
- **Index:** home, company profiles, paginated review pages (`?page=`).
- **`noindex`** (robots + per-page meta): `/account`, `/auth/*`, `/companies/new`, and arbitrary search-query URLs (`/companies?q=...`).
- **Net effect:** the content-rich **company profile** stays the single strong indexable surface per company, undiluted by thin per-review/per-user duplicates.

---

## 2. SEO

- **Metadata:** `metadataBase` + default OG/Twitter set in root layout; `generateMetadata`
  on company profile and listing produce unique title/description, canonical, and OG tags.
  Search-query listings are `noindex` with a canonical to the clean listing.
- **JSON-LD** (server-rendered, in `lib/jsonld.tsx`):
  - Company page → `Organization` with `aggregateRating` + a sample of `Review` items.
  - Home → `WebSite` + `SearchAction`.
  - All pages → `BreadcrumbList`.
  - The JSON is serialized with a `<`→`\u003c` break-out guard to prevent script injection.
- **`aggregateRating` reports the raw mean + count**, not the Bayesian score — schema must
  reflect the honest average users actually see.
- **Bayesian ranking vs. displayed average (deliberate split):** listings and "Top rated"
  **rank** by `companies.bayesian_rating`, but the UI **displays** the raw average +
  review count. This stops a single 5★ review from outranking a company with 500 reviews at
  4.7★, while keeping the displayed number honest. See §4 for the math.
- **Pagination:** reviews and listings paginate via a `?page=` search param with
  server-rendered `<a rel="prev/next">` links, per-page self-canonical, and SQL
  `range()`/`limit`. Chosen over infinite scroll because crawlers won't trigger scroll
  events — full review text must be in the initial HTML.
- **`sitemap.ts` / `robots.ts`:** sitemap enumerates indexable companies; robots disallows
  the non-indexable routes above and points at the sitemap.

---

## 3. Security

### The three required guarantees
| Guarantee | How it's enforced |
|-----------|-------------------|
| One review per **user** per company | DB unique `(company_id, user_id)` (pre-existing) + reliable `maybeSingle()` "already reviewed" read in the UI |
| One review per **IP** per company | New `ip_hash` column + `reviews_company_ip_unique` partial unique index (DB-level) |
| **Email-verified** users only | `reviews_insert_verified` RLS policy using a `SECURITY DEFINER is_email_verified()` function, **plus** an app-layer `email_confirmed_at` check for a friendly message |

### Defense-in-depth: DB-level *and* app-level
Constraints live in the **database** so they can't be bypassed by calling the API directly;
the **server action** mirrors them to return friendly messages (e.g. mapping Postgres
`23505` to "You have already reviewed this company" vs. the IP-collision message).

### Other hardening
- **Open redirect fixed:** `next` is only honored if it's a root-relative same-origin path
  (starts with `/`, not `//` or a scheme), via a reusable `safeRedirect()` helper.
- **IP privacy:** the client IP is taken from the platform's trusted header, **salted and
  hashed** (`IP_HASH_SALT`, server-only) before storage — raw IPs are never logged or
  stored (GDPR-conscious).
- **Input validation:** `domain` is validated as a real hostname; password minimum raised
  to 8; review fields validated with Zod.
- **Security headers** (`next.config.ts`): CSP (derives the Supabase https/wss origin from
  the env URL, `frame-ancestors 'none'`), HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`; `poweredByHeader: false`.
- **Env safety:** only `NEXT_PUBLIC_*` (the **publishable** key — RLS-protected, safe for
  the client by design) reaches the browser. `IP_HASH_SALT` is deliberately kept out of the
  validated *public* env so the secret can never enter the client bundle.

### Threat model — what's NOT prevented
IP limiting is a **speed bump, not a wall**: it's trivially bypassed via VPN/proxy and
hurts users behind shared NAT/CGNAT. At production scale I'd add it as one signal among
many: captcha-on-suspicion, device fingerprinting, account-age/anomaly detection, a WAF,
and audit logging.

---

## 4. Performance

### Database / data layer
- **N+1 eliminated** (the biggest real-world issue): the listing and home pages now fetch
  companies + ratings in a **single** query instead of one round-trip per company.
  `CompanyCard` is now purely presentational (receives a `company` prop, fetches nothing).
- **Denormalized ratings via triggers:** `rating_count`, `rating_sum`, and
  `bayesian_rating` are maintained on `companies` by `AFTER INSERT/UPDATE/DELETE` triggers,
  so ranking/sorting and SEO `aggregateRating` are cheap and consistent (no per-read
  aggregation over all reviews).
- **Indexes:** composite `reviews(company_id, created_at desc)` for ordered review reads,
  and a `pg_trgm` GIN index so company-name search isn't a leading-wildcard full table scan.
- **Caching:** public, slow-changing data (profiles, listings) is wrapped in
  `unstable_cache` with tag-based invalidation (`companies`, `company:{slug}`,
  `company-reviews:{id}`); writing a review/company invalidates the right tags + paths.
  User-specific bits (nav state, the review form, `auth.getUser()`) stay dynamic.

### Bayesian rating — the math
$$\text{score} = \frac{v}{v+m}\,R + \frac{m}{v+m}\,C$$
where $R$ = company mean, $v$ = review count, $C$ = global mean (prior), $m = 10$ (weight).
Properties unit-tested: $v=0\Rightarrow C$; $v\to\infty\Rightarrow R$; larger $m$ pulls
harder toward $C$; a lone 5★ doesn't beat 500×4.7★. The pure helper lives in
`lib/rating.ts` and mirrors the DB `bayesian_rating` column.

### Lighthouse (mobile, simulated throttling) — before → after

| Page | Perf | Accessibility | LCP | CLS |
|------|------|---------------|-----|-----|
| **Home** | 95 → **98** | 96 → **100** | 3.0 s → **2.4 s** | 0 → **0** |
| **Company** | 98 → **98** | 93 → **100** | 2.3 s → **2.3 s** | 0 → **0** |

Fixes applied:
- **LCP** (home hero `<h1>` was the LCP element): `next/font` `display: "swap"` (renders
  text immediately in a metric-compatible fallback instead of waiting on the web font) +
  `preconnect`/`dns-prefetch` to the Supabase origin. Home LCP dropped below the 2.5 s
  target. Lighthouse confirmed no render-blocking resources.
- **CLS** already 0 (avatar/logo boxes use fixed `w/h shrink-0`, reserving space).
- **Accessibility → 100:** raised brand `green-600` buttons/links to `green-700`/`800` and
  `gray-400` secondary text to `gray-500` for WCAG AA contrast; fixed heading order
  (h1→h2→h3, with an `sr-only` "Reviews" section heading).

---

## 5. Verification

- **Test runner: Vitest** — fast, TS-native, zero-config alias support, integrates cleanly
  with this stack. Scripts: `test`, `test:watch`, `typecheck` (`tsc --noEmit`).
- **Unit — Bayesian** (`tests/rating.test.ts`): zero-reviews → prior, high-volume → raw
  mean, bounded between $R$ and $C$, monotonicity in $m$, the "single 5★ doesn't beat
  500×4.7★" case, and `formatTrustScore` formatting.
- **Unit — review action** (`tests/reviews-action.test.ts`): maps Postgres `23505` to the
  correct friendly message (per-user vs. IP constraint), passes through non-duplicate DB
  errors, blocks unverified/anonymous users before hitting the DB, returns `undefined` on
  success.
- **Integration — local Supabase** (`tests/integration/reviews.integration.test.ts`):
  proves the *constraints themselves* reject a duplicate `(company,user)` review, a
  duplicate IP on the same company, and an unverified-email insert (then allows it after
  confirmation). Gated behind `SUPABASE_TEST_*` env vars via `describe.skipIf`, so unit-only
  CI stays green without a database.
- **CI** (`.github/workflows/ci.yml`): runs lint + typecheck + tests on push/PR to `main`.
- **Result:** lint, typecheck, and 15 tests pass (3 integration tests skipped without a
  local DB); `npm run build` succeeds.

---

## 6. AI tooling usage & verification

- **Tool:** GitHub Copilot (Claude Opus 4.8) as an agent, driven by the six-commit prompt
  plan, one commit per prompt.
- **Next.js 16 caveat handled deliberately:** [AGENTS.md](AGENTS.md) warns that this Next
  version differs from training data. Before writing code, the agent read the **bundled
  docs** under `node_modules/next/dist/docs/` (metadata, `generateMetadata`,
  `sitemap`/`robots` conventions). This caught real breaking changes the model would
  otherwise have gotten wrong — e.g. `revalidateTag(tag)` is now
  `revalidateTag(tag, "max")` in Next 16, and the project uses `proxy.ts` (not
  `middleware.ts`, which the agent was explicitly told not to "fix" back).
- **How AI output was verified at every step:**
  - Ran `npm run lint`, `npm run typecheck`, and `npm test` after each commit; fixed all
    findings (e.g. Zod-4 UUID validity in test fixtures, an unused `eslint-disable`, the
    JSON-LD `WithContext` type mismatch).
  - Ran `npm run build` to confirm route render modes and catch type/serialization errors.
  - **Measured** performance with the Lighthouse CLI against a real production build rather
    than asserting improvements — the before/after numbers in §4 are observed, not assumed.
  - Validated JSON-LD shape against Google's Rich Results expectations.
  - Manually reviewed every diff before committing.
