"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { TAG_COMPANIES } from "@/lib/queries";

// Accepts a bare hostname or a full URL, normalizes to the lowercase hostname
// (strips scheme, path, and any leading "www."), and validates it looks like a
// real domain. Rejects junk so we never render an abusive/broken outbound link.
const domainSchema = z
  .string()
  .trim()
  .transform((value) =>
    value
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "")
      .toLowerCase()
  )
  .refine(
    (host) =>
      /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host),
    { error: "Enter a valid domain, e.g. acme.com" }
  );

const companySchema = z.object({
  name: z.string().min(2, { error: "Company name must be at least 2 characters." }).max(100).trim(),
  domain: domainSchema.optional(),
  description: z.string().max(500).trim().optional(),
  category: z.string().trim().optional(),
});

type ActionState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function addCompany(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "You must be signed in to add a company." };

  const parsed = companySchema.safeParse({
    name: formData.get("name"),
    domain: formData.get("domain") || undefined,
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const baseSlug = slugify(parsed.data.name) || "company";

  const companyData = {
    name: parsed.data.name,
    domain: parsed.data.domain || null,
    description: parsed.data.description || null,
    category: parsed.data.category || null,
    created_by: user.id,
  };

  // Different names can slugify to the same base (e.g. "Acme!" and "Acme?").
  // Try the base slug first, then disambiguate with -2, -3, … on collision.
  // A collision against a company with the *same name* is treated as a genuine
  // duplicate and surfaced as a friendly error instead.
  const MAX_ATTEMPTS = 10;
  let createdSlug: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;

    const { data, error } = await supabase
      .from("companies")
      .insert({ slug, ...companyData })
      .select("slug")
      .single();

    if (!error) {
      createdSlug = data.slug;
      break;
    }

    if (error.code !== "23505") {
      return { error: error.message };
    }

    const { data: conflict } = await supabase
      .from("companies")
      .select("name")
      .eq("slug", slug)
      .maybeSingle();

    if (
      conflict &&
      conflict.name.trim().toLowerCase() === parsed.data.name.toLowerCase()
    ) {
      return { error: "A company with this name already exists." };
    }
    // Otherwise a different company owns this slug — try the next suffix.
  }

  if (!createdSlug) {
    return {
      error:
        "Could not generate a unique URL for this company. Please try a different name.",
    };
  }

  // A new company appears in the home + listing rankings.
  revalidateTag(TAG_COMPANIES, "max");
  revalidatePath("/");
  revalidatePath("/companies");

  redirect(`/companies/${createdSlug}`);
}
