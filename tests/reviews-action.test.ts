import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------
// The action imports the cookie-based server client, next/cache, and the IP
// helper. We mock all three so the test exercises only the action's logic
// (validation + Postgres error mapping), not real I/O.

const insertMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({ insert: insertMock })),
  })),
}));

vi.mock("next/cache", () => ({
  // lib/queries calls unstable_cache at import time; keep it a pass-through.
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/ip", () => ({
  getClientIpHash: vi.fn(async () => "deadbeef"),
}));

import { postReview } from "@/app/actions/reviews";

function makeFormData() {
  const fd = new FormData();
  fd.set("companyId", "11111111-1111-4111-8111-111111111111");
  fd.set("companySlug", "acme");
  fd.set("rating", "5");
  fd.set("title", "Great service");
  fd.set("body", "Really happy with the whole experience.");
  return fd;
}

const verifiedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "user@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};

describe("postReview — Postgres error mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: verifiedUser } });
  });

  it("maps a 23505 on the (company,user) constraint to the friendly duplicate message", async () => {
    insertMock.mockResolvedValue({
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "reviews_company_id_user_id_key"',
      },
    });

    const result = await postReview(undefined, makeFormData());

    expect(result).toEqual({ error: "You have already reviewed this company." });
  });

  it("maps a 23505 on the IP constraint to the network-duplicate message", async () => {
    insertMock.mockResolvedValue({
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "reviews_company_ip_unique"',
      },
    });

    const result = await postReview(undefined, makeFormData());

    expect(result).toEqual({
      error: "A review for this company has already been submitted from your network.",
    });
  });

  it("returns the raw message for non-duplicate database errors", async () => {
    insertMock.mockResolvedValue({
      error: { code: "23503", message: "insert or update violates foreign key constraint" },
    });

    const result = await postReview(undefined, makeFormData());

    expect(result).toEqual({
      error: "insert or update violates foreign key constraint",
    });
  });

  it("returns undefined (success) when the insert succeeds", async () => {
    insertMock.mockResolvedValue({ error: null });

    const result = await postReview(undefined, makeFormData());

    expect(result).toBeUndefined();
    expect(insertMock).toHaveBeenCalledOnce();
  });

  it("blocks unverified users before touching the database", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { ...verifiedUser, email_confirmed_at: null } },
    });

    const result = await postReview(undefined, makeFormData());

    expect(result).toMatchObject({ needsVerification: true });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects anonymous submissions", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await postReview(undefined, makeFormData());

    expect(result).toEqual({ error: "You must be signed in to write a review." });
    expect(insertMock).not.toHaveBeenCalled();
  });
});
