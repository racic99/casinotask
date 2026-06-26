/**
 * Integration tests against a local Supabase instance.
 *
 * These exercise the *database* guarantees that protect review integrity:
 *   1. one review per (company, user)       — unique (company_id, user_id)
 *   2. one review per (company, ip_hash)     — reviews_company_ip_unique
 *   3. unverified email is blocked at insert — RLS policy reviews_insert_verified
 *
 * They are SKIPPED unless the local Supabase env vars are present, so unit-only
 * CI stays green. To run them locally:
 *
 *   supabase start
 *   export SUPABASE_TEST_URL=http://127.0.0.1:54321
 *   export SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role key from `supabase status`>
 *   export SUPABASE_TEST_ANON_KEY=<anon key from `supabase status`>
 *   npm test
 *
 * Assumes the default local auth config (email confirmations disabled), so an
 * admin-created *unverified* user can still sign in — letting us prove the RLS
 * email gate rejects their insert while email_confirmed_at is null.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;

const configured = Boolean(URL && SERVICE_KEY && ANON_KEY);

const run = 1; // bump to force unique emails/slugs per run if needed
const stamp = `${Date.now()}-${run}`;

describe.skipIf(!configured)("review integrity (local Supabase)", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const createdCompanyIds: string[] = [];

  async function createUser(verified: boolean): Promise<string> {
    const email = `it-${stamp}-${createdUserIds.length}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Password123!",
      email_confirm: verified,
    });
    if (error) throw error;
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function createCompany(): Promise<string> {
    const slug = `it-company-${stamp}-${createdCompanyIds.length}`;
    const { data, error } = await admin
      .from("companies")
      .insert({ slug, name: `IT Company ${slug}` })
      .select("id")
      .single();
    if (error) throw error;
    createdCompanyIds.push(data.id as string);
    return data.id as string;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    // Companies cascade-delete their reviews; then remove the auth users.
    for (const id of createdCompanyIds) {
      await admin.from("companies").delete().eq("id", id);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("rejects a second review from the same user for the same company", async () => {
    const companyId = await createCompany();
    const userId = await createUser(true);

    const first = await admin.from("reviews").insert({
      company_id: companyId,
      user_id: userId,
      rating: 5,
      title: "First review",
      body: "This is my honest first review.",
    });
    expect(first.error).toBeNull();

    const second = await admin.from("reviews").insert({
      company_id: companyId,
      user_id: userId,
      rating: 1,
      title: "Trying again",
      body: "Attempting to post a duplicate review.",
    });
    expect(second.error?.code).toBe("23505");
  });

  it("rejects a second review from the same IP for the same company", async () => {
    const companyId = await createCompany();
    const userA = await createUser(true);
    const userB = await createUser(true);
    const sharedIpHash = `iphash-${stamp}`;

    const first = await admin.from("reviews").insert({
      company_id: companyId,
      user_id: userA,
      rating: 4,
      title: "From the office",
      body: "Posting from a shared network connection.",
      ip_hash: sharedIpHash,
    });
    expect(first.error).toBeNull();

    const second = await admin.from("reviews").insert({
      company_id: companyId,
      user_id: userB, // different user...
      rating: 5,
      title: "Also from the office",
      body: "Same network, different account entirely.",
      ip_hash: sharedIpHash, // ...same IP hash
    });
    expect(second.error?.code).toBe("23505");
    expect(second.error?.message).toContain("reviews_company_ip_unique");
  });

  it("blocks an unverified email at insert, then allows it once verified", async () => {
    const companyId = await createCompany();
    const email = `it-unverified-${stamp}@example.com`;
    const password = "Password123!";

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // email_confirmed_at stays null
    });
    if (createErr) throw createErr;
    createdUserIds.push(created.user.id);
    const userId = created.user.id;

    // Authenticate as the unverified user (local config allows this).
    const userClient = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    expect(signInErr).toBeNull();

    // RLS reviews_insert_verified must reject — is_email_verified() is false.
    const blocked = await userClient.from("reviews").insert({
      company_id: companyId,
      user_id: userId,
      rating: 5,
      title: "Sneaky review",
      body: "Trying to post before verifying my email.",
    });
    expect(blocked.error).not.toBeNull();

    // Verify the email, refresh the session, and retry.
    const { error: confirmErr } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    expect(confirmErr).toBeNull();

    await userClient.auth.signInWithPassword({ email, password });
    const allowed = await userClient.from("reviews").insert({
      company_id: companyId,
      user_id: userId,
      rating: 5,
      title: "Verified review",
      body: "Now that my email is verified this should succeed.",
    });
    expect(allowed.error).toBeNull();
  });
});
