/**
 * Bayesian (shrinkage) average for company ratings.
 *
 * Pulls low-volume companies toward the global mean so a single 5★ review
 * cannot outrank a company with hundreds of reviews. This mirrors the
 * `bayesian_rating` column maintained in the database (see migration 0002),
 * and is kept here as a pure function for display and unit testing.
 *
 *   score = (v / (v + m)) * R  +  (m / (v + m)) * C
 *
 * @param meanRating  R — the company's own mean rating
 * @param reviewCount v — number of reviews for the company
 * @param globalMean  C — global mean rating across all reviews (the prior)
 * @param m           prior weight: number of "virtual" reviews at the global
 *                    mean. Larger m => stronger pull toward C for low v.
 *                    Defaults to 10 to match the DB `bayesian_prior_weight()`.
 *
 * Properties:
 *   - reviewCount = 0          => returns globalMean (the prior)
 *   - reviewCount -> infinity  => returns meanRating
 *   - larger m                 => stronger pull toward globalMean for small v
 */
export function computeBayesian(
  meanRating: number,
  reviewCount: number,
  globalMean: number,
  m = 10
): number {
  if (m < 0) throw new Error("Prior weight m must be non-negative.");
  if (reviewCount <= 0) return globalMean;

  const v = reviewCount;
  return (v / (v + m)) * meanRating + (m / (v + m)) * globalMean;
}

/**
 * Format a rating for display as a one-decimal "TrustScore", or an em dash when
 * there are no reviews.
 */
export function formatTrustScore(rating: number | null | undefined, reviewCount = 1): string {
  if (rating == null || reviewCount <= 0 || rating <= 0) return "—";
  return rating.toFixed(1);
}
