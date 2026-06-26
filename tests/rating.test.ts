import { describe, expect, it } from "vitest";
import { computeBayesian, formatTrustScore } from "@/lib/rating";

const C = 3.5; // a representative global mean for these tests
const M = 10; // default prior weight (matches DB bayesian_prior_weight())

describe("computeBayesian", () => {
  it("returns the prior (global mean) when there are zero reviews", () => {
    expect(computeBayesian(5, 0, C)).toBe(C);
    expect(computeBayesian(1, 0, C)).toBe(C);
    // Negative/invalid counts are treated as "no reviews".
    expect(computeBayesian(4.8, -3, C)).toBe(C);
  });

  it("converges to the raw mean as review volume grows", () => {
    const R = 4.7;
    const lowVolume = computeBayesian(R, 5, C);
    const midVolume = computeBayesian(R, 100, C);
    const highVolume = computeBayesian(R, 100_000, C);

    // Each step gets closer to the raw mean...
    expect(Math.abs(R - midVolume)).toBeLessThan(Math.abs(R - lowVolume));
    expect(Math.abs(R - highVolume)).toBeLessThan(Math.abs(R - midVolume));
    // ...and at very high volume it is effectively the raw mean.
    expect(highVolume).toBeCloseTo(R, 3);
  });

  it("is bounded between the raw mean and the global mean", () => {
    const R = 4.7;
    const score = computeBayesian(R, 20, C);
    expect(score).toBeGreaterThan(C);
    expect(score).toBeLessThan(R);
  });

  it("pulls harder toward the prior as m increases (monotonic in m)", () => {
    const R = 4.7;
    const v = 20;
    const scoreSmallM = computeBayesian(R, v, C, 1);
    const scoreMidM = computeBayesian(R, v, C, 10);
    const scoreLargeM = computeBayesian(R, v, C, 100);

    // Larger m => closer to the global mean C (which is below R here).
    expect(scoreMidM).toBeLessThan(scoreSmallM);
    expect(scoreLargeM).toBeLessThan(scoreMidM);
    // Distance to C shrinks monotonically as m grows.
    expect(scoreLargeM - C).toBeLessThan(scoreMidM - C);
    expect(scoreMidM - C).toBeLessThan(scoreSmallM - C);
  });

  it("does not let a single 5★ review outrank a high-volume 4.7★ company", () => {
    // The whole point of the shrinkage score.
    const newcomer = computeBayesian(5.0, 1, C, M); // one perfect review
    const established = computeBayesian(4.7, 500, C, M); // 500 reviews at 4.7

    expect(established).toBeGreaterThan(newcomer);
    // And the newcomer is dragged well below its raw 5.0 toward the prior.
    expect(newcomer).toBeLessThan(4.0);
  });

  it("throws when the prior weight is negative", () => {
    expect(() => computeBayesian(4, 10, C, -1)).toThrow();
  });
});

describe("formatTrustScore", () => {
  it("formats a real score to one decimal", () => {
    expect(formatTrustScore(4.25, 10)).toBe("4.3");
    expect(formatTrustScore(4, 10)).toBe("4.0");
  });

  it("shows an em dash when there are no reviews or no rating", () => {
    expect(formatTrustScore(null)).toBe("—");
    expect(formatTrustScore(undefined)).toBe("—");
    expect(formatTrustScore(4.5, 0)).toBe("—");
    expect(formatTrustScore(0, 5)).toBe("—");
  });
});
