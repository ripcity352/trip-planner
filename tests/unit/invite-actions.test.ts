/**
 * Unit tests for `acceptInviteAction` (#432 item: post-accept false-failure).
 *
 * The load-bearing case: once the `accept_invite` RPC has SUCCEEDED, the
 * caller IS a member — a failure in the cosmetic slug lookup afterwards
 * must never surface as an error (it used to return errorKey:"network",
 * telling a successfully-joined user the join failed). The action now
 * falls back to redirect("/trips"), where the fresh membership is visible.
 *
 * Pre-accept error paths (unauthenticated, RPC rejection) stay unchanged
 * and are pinned here too.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mocks -------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockMemberMaybeSingle = vi.fn();
const mockTripMaybeSingle = vi.fn();

// Table-dispatching from() mock: trip_members → member lookup chain,
// trips → slug lookup chain. Both are .select().eq().maybeSingle().
const mockFrom = vi.fn((table: string) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle:
        table === "trip_members" ? mockMemberMaybeSingle : mockTripMaybeSingle,
    })),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      rpc: mockRpc,
      from: mockFrom,
    })
  ),
}));

vi.mock("@/lib/db/invites", () => ({
  createInviteRecord: vi.fn(),
  revokeInvite: vi.fn(),
}));

vi.mock("@/lib/db/trips", () => ({
  setMemberDisplayName: vi.fn(),
}));

vi.mock("@/lib/db/profiles", () => ({
  setProfileDisplayNameIfEmpty: vi.fn(),
}));

const mockRateLimitedAction = vi.fn(
  async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
);

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMIT_SCOPES: {
    ACCEPT_INVITE: "acceptInvite",
    MINT_INVITE: "mintInvite",
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

// Mirror Next's real redirect(): it THROWS, so anything after the call is
// unreachable — matching prod control flow keeps the tests honest.
const mockRedirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// Import AFTER mocks.
import { acceptInviteAction } from "@/lib/actions/invites";

// --- tests -------------------------------------------------------------------

const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111";

describe("acceptInviteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dave@example.com" } },
    });
    mockRateLimitedAction.mockImplementation(
      async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
    );
  });

  it("redirects to /trips/<slug> when the accept and slug lookup both succeed", async () => {
    mockRpc.mockResolvedValue({ data: "member-1", error: null });
    mockMemberMaybeSingle.mockResolvedValue({ data: { trip_id: "trip-1" } });
    mockTripMaybeSingle.mockResolvedValue({ data: { slug: "vegas-2026" } });

    await expect(acceptInviteAction("tok123", IDEMPOTENCY_KEY)).rejects.toThrow(
      "NEXT_REDIRECT:/trips/vegas-2026"
    );

    expect(mockRedirect).toHaveBeenCalledWith("/trips/vegas-2026");
  });

  // #432 — the false-failure fix. The RPC already succeeded; a failed slug
  // lookup must NOT return an error to a user who IS on the trip.
  it("redirects to /trips (NOT an error) when the post-accept slug lookup finds no row", async () => {
    mockRpc.mockResolvedValue({ data: "member-1", error: null });
    mockMemberMaybeSingle.mockResolvedValue({ data: null });

    await expect(acceptInviteAction("tok123", IDEMPOTENCY_KEY)).rejects.toThrow(
      "NEXT_REDIRECT:/trips"
    );

    expect(mockRedirect).toHaveBeenCalledWith("/trips");
  });

  it("redirects to /trips (NOT an error) when the post-accept lookup throws", async () => {
    mockRpc.mockResolvedValue({ data: "member-1", error: null });
    mockMemberMaybeSingle.mockRejectedValue(new Error("connection reset"));

    await expect(acceptInviteAction("tok123", IDEMPOTENCY_KEY)).rejects.toThrow(
      "NEXT_REDIRECT:/trips"
    );

    expect(mockRedirect).toHaveBeenCalledWith("/trips");
  });

  // Pre-accept paths — unchanged by #432, pinned so the fix can't creep.
  it("returns auth_failed (no redirect) when the caller is unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await acceptInviteAction("tok123", IDEMPOTENCY_KEY);

    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns invite_not_found (no redirect) when the accept RPC itself fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "invite_not_found" },
    });

    const result = await acceptInviteAction("tok123", IDEMPOTENCY_KEY);

    expect(result).toEqual({ ok: false, errorKey: "invite_not_found" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
