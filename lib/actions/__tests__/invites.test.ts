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

describe("createInviteAction — rate-limit scope (#107)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    rateLimitedActionMock.mockClear();
    redirectMock.mockReset();
    createClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetModules();
  });

  const VALID_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

  function primeAuth(userId: string | null) {
    getUserMock.mockResolvedValue(
      userId
        ? { data: { user: { id: userId } }, error: null }
        : { data: { user: null }, error: null }
    );
  }

  it("rate-limits under MINT_INVITE, not ACCEPT_INVITE", async () => {
    // Issue #107: createInviteAction was using ACCEPT_INVITE scope,
    // meaning a burst of mints drained the accept bucket. This test
    // pins that createInviteAction uses the dedicated MINT_INVITE scope.
    primeAuth("u-1");

    // Minimal Supabase client double with a successful insert chain.
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        token: "tok-1",
        trip_id: VALID_UUID,
        created_by: "u-1",
        expires_at: null,
        uses_left: null,
        created_at: new Date().toISOString(),
      },
      error: null,
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: insertSingle,
          }),
        }),
      }),
    });

    const { createInviteAction: action } = await import("@/lib/actions/invites");

    await action(
      { tripId: VALID_UUID, usesLeft: null, expiresAt: null },
      "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99"
    );

    // rateLimitedAction must be called with "mintInvite" scope specifically.
    // (RATE_LIMIT_SCOPES.MINT_INVITE === "mintInvite")
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "mintInvite",
      "u-1",
      expect.any(Function),
    );
    // Must NOT have been called with the "acceptInvite" bucket.
    const scopesUsed = rateLimitedActionMock.mock.calls.map((c) => c[0]);
    expect(scopesUsed).not.toContain("acceptInvite");
  });

  it("returns rate_limit when MINT_INVITE bucket is exhausted", async () => {
    primeAuth("u-1");
    createClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: vi.fn(),
    });

    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("mintInvite", { remaining: 0, reset: 0 }),
    );

    const { createInviteAction: action } = await import("@/lib/actions/invites");
    const result = await action(
      { tripId: VALID_UUID, usesLeft: null, expiresAt: null },
      "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99"
    );

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  // #366: the guard index shipped in M4 Delta 2 but the action never
  // populated the column — organizer double-tap minted duplicate invites.
  it("returns validation_failed for a malformed idempotency key", async () => {
    primeAuth("u-1");
    createClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: vi.fn(),
    });

    const { createInviteAction: action } = await import("@/lib/actions/invites");
    const result = await action(
      { tripId: VALID_UUID, usesLeft: null, expiresAt: null },
      "not-a-uuid"
    );

    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("threads the idempotency key into the insert payload", async () => {
    primeAuth("u-1");

    const KEY = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99";
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            token: "tok-1",
            trip_id: VALID_UUID,
            created_by: "u-1",
            expires_at: null,
            uses_left: null,
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    });

    const { createInviteAction: action } = await import("@/lib/actions/invites");
    await action({ tripId: VALID_UUID, usesLeft: null, expiresAt: null }, KEY);

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: KEY })
    );
  });
});

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
