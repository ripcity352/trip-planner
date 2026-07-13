/**
 * Unit tests for `setRsvpAction` (#432 item: the no-row UPDATE case).
 *
 * The load-bearing distinction: a transient DB error keeps the
 * retry-framed `rsvp_save_failed`, but an UPDATE that matched no row —
 * the caller's membership vanished between lookup and write — is
 * PERMANENT and must surface the honest `rsvp_not_member` instead of
 * telling the user to tap again forever.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mocks -------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockLookupMaybeSingle = vi.fn();
const mockUpdateMaybeSingle = vi.fn();

// One from("trip_members") mock serving both chains in the action:
//   lookup: .select().eq().eq().maybeSingle()
//   update: .update().eq().eq().select().maybeSingle()
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: mockLookupMaybeSingle })),
    })),
  })),
  update: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({ maybeSingle: mockUpdateMaybeSingle })),
      })),
    })),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const mockRateLimitedAction = vi.fn(
  async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
);

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMIT_SCOPES: {
    SET_RSVP: "setRsvp",
  },
  RateLimitError: class RateLimitError extends Error {
    constructor(scope: string) {
      super(`Rate limit exceeded for scope "${scope}"`);
      this.name = "RateLimitError";
    }
  },
  rateLimitedAction: (...args: Parameters<typeof mockRateLimitedAction>) =>
    mockRateLimitedAction(...args),
}));

// Import AFTER mocks.
import { setRsvpAction } from "@/lib/actions/rsvp";

// --- tests -------------------------------------------------------------------

const TRIP_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111";

describe("setRsvpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dave@example.com" } },
    });
    // Existing membership row with a DIFFERENT idempotency key, so the
    // action proceeds to the UPDATE branch.
    mockLookupMaybeSingle.mockResolvedValue({
      data: { id: "member-1", rsvp_status: "pending", idempotency_key: null },
      error: null,
    });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("returns { ok: true } and revalidates when the UPDATE lands", async () => {
    mockUpdateMaybeSingle.mockResolvedValue({
      data: { id: "member-1" },
      error: null,
    });

    const result = await setRsvpAction(
      { tripId: TRIP_ID, status: "going" },
      IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: true, status: "going" });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips", "layout");
  });

  // #432 — the permanent case: UPDATE matched no row (membership vanished
  // between lookup and write). Retry framing would loop forever.
  it("returns rsvp_not_member (NOT the retry-framed rsvp_save_failed) when the UPDATE matches no row", async () => {
    mockUpdateMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await setRsvpAction(
      { tripId: TRIP_ID, status: "going" },
      IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rsvp_not_member" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  // Transient DB errors keep the retry framing (#432 leaves this path as-is).
  it("returns rsvp_save_failed when the UPDATE errors (transient, retry-framed)", async () => {
    mockUpdateMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "57P01", message: "connection terminated" },
    });

    const result = await setRsvpAction(
      { tripId: TRIP_ID, status: "going" },
      IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rsvp_save_failed" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns rls_denied when the caller has no membership row at lookup time", async () => {
    mockLookupMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await setRsvpAction(
      { tripId: TRIP_ID, status: "going" },
      IDEMPOTENCY_KEY
    );

    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});
