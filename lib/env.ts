import { z } from "zod";

/**
 * Runtime-validated environment variables.
 *
 * Only `NEXT_PUBLIC_*` values are validated here because this module is safe to
 * import from both server and client code (those values are inlined into the
 * client bundle by Next.js). Server-only secrets (e.g. `IP_HASH_SALT`) are
 * intentionally NOT referenced here so they never leak into the browser bundle.
 *
 * The `process.env.X` references are written as literals so Next.js can statically
 * replace them at build time.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL.",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required." })
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required." }),
  NEXT_PUBLIC_SITE_URL: z
    .url({ error: "NEXT_PUBLIC_SITE_URL must be a valid URL." })
    .optional(),
});

function validatePublicEnv() {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return parsed.data;
}

export const env = validatePublicEnv();
