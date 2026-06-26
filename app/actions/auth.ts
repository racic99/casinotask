"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const signUpSchema = z.object({
  displayName: z.string().min(2, { error: "Name must be at least 2 characters." }).trim(),
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
});

const signInSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Password is required." }),
});

type ActionState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

/**
 * Only honor a `next` redirect target when it's a root-relative, same-origin
 * path. Rejects absolute URLs, protocol-relative `//host` and backslash
 * variants, and anything with a scheme — preventing open-redirect abuse.
 */
function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  // `//evil.com` and `/\evil.com` are treated as protocol-relative by browsers.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

export async function signUp(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState & { emailConfirmation?: boolean }> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();

  // Point the email-confirmation link at our callback route so the code is
  // exchanged there. (The proxy also handles a code landing on any other route
  // as a fallback.) Requires this URL to be allow-listed in Supabase Auth.
  const { headers } = await import("next/headers");
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  // A session is only returned when email confirmation is disabled — in that
  // case the user is signed in immediately.
  if (data.session) redirect("/");

  // No session => email confirmation is required, OR the address is already
  // registered (Supabase returns an obfuscated user to prevent account
  // enumeration). Show the same neutral "check your inbox" state for both so we
  // never reveal whether an email already exists.
  return { emailConfirmation: true };
}

export async function signIn(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  const next = formData.get("next") as string | null;
  redirect(safeRedirectPath(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState & { success?: boolean }> {
  const email = formData.get("email") as string;
  const parsed = z
    .email({ error: "Please enter a valid email." })
    .trim()
    .safeParse(email);

  if (!parsed.success) {
    return { fieldErrors: { email: [parsed.error.issues[0].message] } };
  }

  const { headers } = await import("next/headers");
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "http://localhost:3000";

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function updatePassword(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = formData.get("password") as string;
  const parsed = z
    .string()
    .min(8, { error: "Password must be at least 8 characters." })
    .safeParse(password);

  if (!parsed.success) {
    return { fieldErrors: { password: [parsed.error.issues[0].message] } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });

  if (error) return { error: error.message };
  redirect("/account");
}
