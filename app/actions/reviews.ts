"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getClientIpHash } from "@/lib/ip";
import { TAG_COMPANIES, companyTag, companyReviewsTag } from "@/lib/queries";

const reviewSchema = z.object({
  companyId: z.string().uuid({ error: "Invalid company." }),
  companySlug: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().min(3, { error: "Title must be at least 3 characters." }).max(120).trim(),
  body: z.string().min(10, { error: "Review must be at least 10 characters." }).max(2000).trim(),
});

type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]>; needsVerification?: boolean }
  | undefined;

export async function postReview(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "You must be signed in to write a review." };

  // Email-verification gate (defense-in-depth; the DB RLS policy enforces this
  // too, but checking here lets us return a friendly, actionable message).
  if (!user.email_confirmed_at) {
    return {
      error: "Please verify your email before posting a review.",
      needsVerification: true,
    };
  }

  const parsed = reviewSchema.safeParse({
    companyId: formData.get("companyId"),
    companySlug: formData.get("companySlug"),
    rating: formData.get("rating"),
    title: formData.get("title"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  // Salted hash of the client IP (never the raw IP). Null when no salt is
  // configured or the IP can't be resolved — the per-IP limit simply doesn't
  // apply in that case (the DB index excludes null ip_hash).
  const ipHash = await getClientIpHash();

  const { error } = await supabase.from("reviews").insert({
    company_id: parsed.data.companyId,
    user_id: user.id,
    rating: parsed.data.rating,
    title: parsed.data.title,
    body: parsed.data.body,
    ip_hash: ipHash,
  });

  if (error) {
    if (error.code === "23505") {
      // Two unique constraints can trip here: one review per user per company,
      // and one review per IP per company. Distinguish by the constraint name
      // so the message is accurate.
      if (error.message.includes("reviews_company_ip_unique")) {
        return { error: "A review for this company has already been submitted from your network." };
      }
      return { error: "You have already reviewed this company." };
    }
    return { error: error.message };
  }

  // A new review changes this company's reviews, its rating aggregate, and the
  // ranking used by the home/listing pages — invalidate all three. revalidatePath
  // forces the poster's own view of the company page to refresh immediately.
  revalidateTag(companyReviewsTag(parsed.data.companyId), "max");
  revalidateTag(companyTag(parsed.data.companySlug), "max");
  revalidateTag(TAG_COMPANIES, "max");
  revalidatePath(`/companies/${parsed.data.companySlug}`);
  return undefined;
}

export async function resendVerification(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You must be signed in." };
  if (user.email_confirmed_at) return { success: true };

  const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
  if (error) return { error: error.message };
  return { success: true };
}

