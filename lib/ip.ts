import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Resolve the client IP from the platform's forwarding headers.
 *
 * Trust model: these headers are only trustworthy when the app sits behind a
 * proxy/CDN that sets them (e.g. Vercel, which overwrites `x-forwarded-for`).
 * Run directly without such a proxy and a client can spoof them — so the
 * IP-based limit is a speed bump, not a hard guarantee. We prefer `x-real-ip`
 * (single value set by the proxy) and fall back to the left-most entry of
 * `x-forwarded-for`.
 */
async function getClientIp(): Promise<string | null> {
  const headerList = await headers();

  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return null;
}

/**
 * Return a salted, non-reversible hash of the client IP, or `null` when the IP
 * can't be resolved or no salt is configured.
 *
 * A salt is mandatory: the IPv4 space is small enough that an unsalted hash is
 * trivially reversible via a precomputed table. If `IP_HASH_SALT` is unset we
 * deliberately return `null` (skipping the IP limit) rather than store a weak,
 * guessable hash. The raw IP is never returned, stored, or logged.
 */
export async function getClientIpHash(): Promise<string | null> {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) return null;

  const ip = await getClientIp();
  if (!ip) return null;

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
