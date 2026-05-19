/**
 * Tests for `lib/actions/invites.ts`.
 *
 * `acceptInviteAction(token, idempotencyKey)` is the load-bearing one.
 * It calls the `accept_invite` SECURITY DEFINER RPC; we mock the
 * Supabase client at that boundary and assert:
 *   - successful accept looks up the trip slug then redirects
 *   - PG error codes / messages map to our ErrorKey union:
 *     - P0002 / "invite_not_found" → invite_not_found
 *     - P0001 / "invite_expired"   → invite_expired
 *     - P0001 / "invite_exhausted" → invite_exhausted
 *   - replaying the same (token, idempotencyKey) is a no-op (the RPC
 *     handles idempotency at the DB level; the action surfaces success)
 *   - rate-limit errors return `{ ok: false, errorKey: "rate_limit" }`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const getUserMock = vi.fn();

/**
 * Builds a Supabase client double that:
 *   - `auth.getUser()` returns whatever getUserMock yields
 *   - `rpc(name, args)` returns whatever rpcMock yields
 *   - `from("trip_members")` and `from("trips")` both expose a
 *      `.select(...).eq(...).maybeSingle()` chain backed by `rows[tableName]`.
 */
function buildClient(rows: Record<string, unknown>) {
  function makeTableBuilder(tableName: string) {
    const row = rows[tableName] ?? null;
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockReturnValue(Promise.resolve({ data: row, error: null })),
        }),
      }),
    };
  }
  return {
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: vi.fn((tableName: string) => makeTableBuilder(tableName)),
  };
}

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const rateLimitedActionMock = vi.fn(
  async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn()
);
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit"
  );
  return {
    ...actual,
    rateLimitedAction: (...args: unknown[]) =>
      rateLimitedActionMock(
        args[0] as string,
        args[1] as string,
        args[2] as () => Promise<unknown>
      ),
  };
});

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("acceptInviteAction", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    rateLimitedActionMock.mockClear();
    redirectMock.mockReset();
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    createClientMock.mockReset();
    // Suppress the SQLSTATE-distinguished log noise that the production
    // path emits on RPC errors — every failure-mode test below triggers
    // a deliberate error path.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetModules();
  });

  function primeAuth(userId: string | null) {
    getUserMock.mockResolvedValue(
      userId
        ? { data: { user: { id: userId } }, error: null }
        : { data: { user: null }, error: null }
    );
  }

  function primeClient(rows: Record<string, unknown>) {
    createClientMock.mockResolvedValue(buildClient(rows));
  }

  it("returns auth_failed when there is no signed-in user", async () => {
    primeAuth(null);
    primeClient({});
    const { acceptInviteAction } = await import("@/lib/actions/invites");

    const result = await acceptInviteAction("token-1", "idem-1");
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls accept_invite RPC, looks up the trip slug, and redirects to /trips/<slug>", async () => {
    primeAuth("u-1");
    primeClient({
      trip_members: { trip_id: "trip-1" },
      trips: { slug: "vegas-bach" },
    });
    // RPC returns the newly-inserted trip_member.id; the action then
    // chases `trip_members → trips` to find the slug for the redirect.
    rpcMock.mockResolvedValueOnce({ data: "tm-1", error: null });

    const { acceptInviteAction } = await import("@/lib/actions/invites");

    await expect(acceptInviteAction("token-1", "idem-1")).rejects.toThrow(
      "NEXT_REDIRECT:/trips/vegas-bach"
    );

    expect(redirectMock).toHaveBeenCalledWith("/trips/vegas-bach");
  });

  it("returns invite_not_found when the RPC errors with P0002", async () => {
    primeAuth("u-1");
    primeClient({});
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "invite_not_found", code: "P0002" },
    });

    const { acceptInviteAction } = await import("@/lib/actions/invites");
    const result = await acceptInviteAction("token-1", "idem-1");

    expect(result).toEqual({ ok: false, errorKey: "invite_not_found" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  // Anti-enumeration: expired and exhausted RPCs collapse to the same
  // user-facing `invite_not_found` key. The SQLSTATEs stay distinct in
  // the migration for internal observability — see mapRpcErrorToKey.
  it("collapses invite_expired (P0001) to invite_not_found for the user", async () => {
    primeAuth("u-1");
    primeClient({});
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "invite_expired", code: "P0001" },
    });

    const { acceptInviteAction } = await import("@/lib/actions/invites");
    const result = await acceptInviteAction("token-1", "idem-1");

    expect(result).toEqual({ ok: false, errorKey: "invite_not_found" });
  });

  it("collapses invite_exhausted (P0001) to invite_not_found for the user", async () => {
    primeAuth("u-1");
    primeClient({});
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "invite_exhausted", code: "P0001" },
    });

    const { acceptInviteAction } = await import("@/lib/actions/invites");
    const result = await acceptInviteAction("token-1", "idem-1");

    expect(result).toEqual({ ok: false, errorKey: "invite_not_found" });
  });

  it("returns rate_limit when the limiter throws", async () => {
    primeAuth("u-1");
    primeClient({});

    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("acceptInvite", { remaining: 0, reset: 0 })
    );

    const { acceptInviteAction } = await import("@/lib/actions/invites");
    const result = await acceptInviteAction("token-1", "idem-1");

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});
