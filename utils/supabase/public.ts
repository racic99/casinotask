import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Anonymous, cookie-less Supabase client for cached public reads.
 *
 * `unstable_cache` forbids accessing request-scoped data (cookies/headers), and
 * the cookie-based server client touches cookies on every call. This client
 * carries no user session, so it is safe to call inside a cache scope. Use it
 * only for public, non-user-specific data (company listings/profiles/reviews).
 */
export function createPublicClient() {
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
