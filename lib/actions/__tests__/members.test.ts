/**
 * Tests for `lib/actions/members.ts` (#386 — organizer member management).
 *
 * The db layer is mocked at the module boundary (its query shape has its
 * own suite in lib/db/__tests__/trips.test.ts). Here we pin validation,
 * auth, the organizer-only app-layer check (RLS gates WHO can touch a
 * row and — as of #418 — also WHAT via WITH CHECK; this action layer
 * mirrors those seat protections with warm copy), the #386 guards
 * (self / celebrant / original organizer), idempotency replay,
 * rate-limit scopes, and error mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const getViewerMemberMock = vi.fn();
const getTripMemberByIdMock = vi.fn();
const updateTripMemberRoleMock = vi.fn();
const deleteTripMemberMock = vi.fn();
const setTripCelebrantMock = vi.fn();
vi.mock("@/lib/db/trips", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/trips")>(
    "@/lib/db/trips"
  );
  return {
    ...actual,
    getViewerMember: (...args: unknown[]) =>
      getViewerMemberMock(...(args as [])),
    getTripMemberById: (...args: unknown[]) =>
      getTripMemberByIdMock(...(args as [])),
    updateTripMemberRole: (...args: unknown[]) =>
      updateTripMemberRoleMock(...(args as [])),
    deleteTripMember: (...args: unknown[]) =>
      deleteTripMemberMock(...(args as [])),
    setTripCelebrant: (...args: unknown[]) =>
      setTripCelebrantMock(...(args as [])),
  };
});

const memberHasExpenseTiesMock = vi.fn();
vi.mock("@/lib/db/expenses", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/expenses")>(
    "@/lib/db/expenses"
  );
  return {
    ...actual,
    memberHasExpenseTies: (...args: unknown[]) =>
      memberHasExpenseTiesMock(...(args as [])),
  };
});

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

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const TRIP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const KEY = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99";
const VIEWER_MEMBER_ID = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01";
const TARGET_MEMBER_ID = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02";

const ORGANIZER_VIEWER = {
  id: VIEWER_MEMBER_ID,
  role: "organizer",
  is_celebrant: false,
  display_name: "Dave",
};
const ATTENDEE_VIEWER = {
  id: VIEWER_MEMBER_ID,
  role: "attendee",
  is_celebrant: false,
  display_name: "Pete",
};

/** Plain attendee target — the happy-path subject for both actions. */
const ATTENDEE_TARGET = {
  id: TARGET_MEMBER_ID,
  trip_id: TRIP_ID,
  user_id: "u-target",
  role: "attendee",
  rsvp_status: "going",
  is_celebrant: false,
  display_name: "Kevin",
  idempotency_key: null,
};

function resetMocks() {
  getUserMock.mockReset();
  createClientMock.mockReset();
  getViewerMemberMock.mockReset();
  getTripMemberByIdMock.mockReset();
  updateTripMemberRoleMock.mockReset();
  deleteTripMemberMock.mockReset();
  setTripCelebrantMock.mockReset();
  memberHasExpenseTiesMock.mockReset();
  rateLimitedActionMock.mockClear();
  revalidatePathMock.mockReset();

  createClientMock.mockResolvedValue({ auth: { getUser: getUserMock } });
  getUserMock.mockResolvedValue({
    data: { user: { id: "u-viewer" } },
    error: null,
  });
  getViewerMemberMock.mockResolvedValue(ORGANIZER_VIEWER);
  getTripMemberByIdMock.mockResolvedValue(ATTENDEE_TARGET);
  updateTripMemberRoleMock.mockResolvedValue(true);
  deleteTripMemberMock.mockResolvedValue(1);
  setTripCelebrantMock.mockResolvedValue(undefined);
  memberHasExpenseTiesMock.mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
}

const PROMOTE_INPUT = {
  tripId: TRIP_ID,
  memberId: TARGET_MEMBER_ID,
  role: "co_organizer" as const,
};

const REMOVE_INPUT = {
  tripId: TRIP_ID,
  memberId: TARGET_MEMBER_ID,
};

describe("setMemberRoleAction", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.resetModules();
  });

  it("rejects a non-UUID idempotency key", async () => {
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, "not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateTripMemberRoleMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid role value at the schema level", async () => {
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(
      // "organizer" is NOT settable — the original-organizer seat is
      // never assigned through this action.
      { ...PROMOTE_INPUT, role: "organizer" as never },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns auth_failed when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("denies a non-organizer viewer (app-layer mirror of RLS)", async () => {
    getViewerMemberMock.mockResolvedValue(ATTENDEE_VIEWER);
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(updateTripMemberRoleMock).not.toHaveBeenCalled();
  });

  it("denies when the viewer is not a member at all", async () => {
    getViewerMemberMock.mockResolvedValue(null);
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("denies when the target row is not visible", async () => {
    getTripMemberByIdMock.mockResolvedValue(null);
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("refuses to change the celebrant's role", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      is_celebrant: true,
    });
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "member_role_celebrant" });
    expect(updateTripMemberRoleMock).not.toHaveBeenCalled();
  });

  it("refuses to demote the original organizer", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      role: "organizer",
    });
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(
      { ...PROMOTE_INPUT, role: "attendee" },
      KEY
    );
    expect(result).toEqual({
      ok: false,
      errorKey: "member_organizer_locked",
    });
    expect(updateTripMemberRoleMock).not.toHaveBeenCalled();
  });

  it("treats a replayed idempotency key as a no-op returning the stored role", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      role: "co_organizer",
      idempotency_key: KEY,
    });
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: true, role: "co_organizer" });
    expect(updateTripMemberRoleMock).not.toHaveBeenCalled();
  });

  it("no-ops (ok) when the target already has the requested role", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      role: "co_organizer",
    });
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: true, role: "co_organizer" });
    expect(updateTripMemberRoleMock).not.toHaveBeenCalled();
  });

  it("promotes under the dedicated setMemberRole scope and revalidates", async () => {
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);

    expect(result).toEqual({ ok: true, role: "co_organizer" });
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "setMemberRole",
      "u-viewer",
      expect.any(Function)
    );
    expect(updateTripMemberRoleMock).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_MEMBER_ID,
      "co_organizer",
      KEY
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("allows a co-organizer viewer to demote a co-organizer back to attendee", async () => {
    getViewerMemberMock.mockResolvedValue({
      ...ORGANIZER_VIEWER,
      role: "co_organizer",
    });
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      role: "co_organizer",
    });
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(
      { ...PROMOTE_INPUT, role: "attendee" },
      KEY
    );
    expect(result).toEqual({ ok: true, role: "attendee" });
  });

  it("maps a zero-row update (RLS swallowed it) to rls_denied", async () => {
    updateTripMemberRoleMock.mockResolvedValue(false);
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps RateLimitError to rate_limit", async () => {
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setMemberRole", { reset: 0, remaining: 0 })
    );
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("maps an unexpected db failure to member_role_save_failed", async () => {
    updateTripMemberRoleMock.mockRejectedValue(new Error("boom"));
    const { setMemberRoleAction } = await import("@/lib/actions/members");
    const result = await setMemberRoleAction(PROMOTE_INPUT, KEY);
    expect(result).toEqual({
      ok: false,
      errorKey: "member_role_save_failed",
    });
  });
});

describe("removeMemberAction", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.resetModules();
  });

  it("rejects a non-UUID idempotency key", async () => {
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, "nope");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed member id", async () => {
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(
      { ...REMOVE_INPUT, memberId: "42" },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns auth_failed when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("denies a non-organizer viewer", async () => {
    getViewerMemberMock.mockResolvedValue(ATTENDEE_VIEWER);
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  it("is idempotent when the target is already gone (drunk double-tap)", async () => {
    getTripMemberByIdMock.mockResolvedValue(null);
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({ ok: true });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  it("refuses to remove yourself", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      id: VIEWER_MEMBER_ID,
    });
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(
      { ...REMOVE_INPUT, memberId: VIEWER_MEMBER_ID },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "member_remove_self" });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  it("refuses to remove the celebrant", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      is_celebrant: true,
    });
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({
      ok: false,
      errorKey: "member_remove_celebrant",
    });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  it("refuses to remove the original organizer", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      role: "organizer",
    });
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({
      ok: false,
      errorKey: "member_organizer_locked",
    });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  // Money invariant (fix-first on #416): expense_splits.trip_member_id is
  // ON DELETE CASCADE, so removing a tied member would silently delete
  // their splits and break sum(splits) == amount_cents. Removal is
  // refused while ties exist; split rewrite is deliberately out of scope.
  it("refuses to remove a member who is on the hook for expenses", async () => {
    memberHasExpenseTiesMock.mockResolvedValue(true);
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);

    expect(result).toEqual({
      ok: false,
      errorKey: "member_remove_has_expenses",
    });
    expect(deleteTripMemberMock).not.toHaveBeenCalled();
  });

  it("checks ties against the target's member id AND user id (payer side)", async () => {
    const { removeMemberAction } = await import("@/lib/actions/members");
    await removeMemberAction(REMOVE_INPUT, KEY);

    expect(memberHasExpenseTiesMock).toHaveBeenCalledWith(
      expect.anything(),
      TRIP_ID,
      TARGET_MEMBER_ID,
      "u-target"
    );
  });

  it("removes under the dedicated removeMember scope and revalidates", async () => {
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);

    expect(result).toEqual({ ok: true });
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "removeMember",
      "u-viewer",
      expect.any(Function)
    );
    expect(deleteTripMemberMock).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_MEMBER_ID
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("maps a zero-row delete (RLS swallowed it) to rls_denied", async () => {
    deleteTripMemberMock.mockResolvedValue(0);
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps RateLimitError to rate_limit", async () => {
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("removeMember", { reset: 0, remaining: 0 })
    );
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("maps an unexpected db failure to member_remove_failed", async () => {
    deleteTripMemberMock.mockRejectedValue(new Error("boom"));
    const { removeMemberAction } = await import("@/lib/actions/members");
    const result = await removeMemberAction(REMOVE_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "member_remove_failed" });
  });
});

// Celebrant assignment — FOUNDER-only (role='organizer', stricter than
// the organizer-or-co gate of the sibling actions). The write goes
// through the naturally idempotent set_trip_celebrant RPC, so the key
// is validated per rule 9 but not persisted (same as removeMemberAction).
describe("setCelebrantAction", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    vi.resetModules();
  });

  const ASSIGN_INPUT = { tripId: TRIP_ID, memberId: TARGET_MEMBER_ID };
  const CLEAR_INPUT = { tripId: TRIP_ID, memberId: null };

  it("rejects a non-UUID idempotency key", async () => {
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, "nope");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(setTripCelebrantMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed member id", async () => {
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(
      { ...ASSIGN_INPUT, memberId: "42" },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns auth_failed when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("denies a co-organizer viewer — the gate is FOUNDER, not organizer-or-co", async () => {
    getViewerMemberMock.mockResolvedValue({
      ...ORGANIZER_VIEWER,
      role: "co_organizer",
    });
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(setTripCelebrantMock).not.toHaveBeenCalled();
  });

  it("denies when the viewer is not a member at all", async () => {
    getViewerMemberMock.mockResolvedValue(null);
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("denies when the target row is not visible (cross-trip probe)", async () => {
    getTripMemberByIdMock.mockResolvedValue(null);
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(setTripCelebrantMock).not.toHaveBeenCalled();
  });

  it("no-ops (ok) when the target already holds the seat — natural idempotency", async () => {
    getTripMemberByIdMock.mockResolvedValue({
      ...ATTENDEE_TARGET,
      is_celebrant: true,
    });
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: true });
    expect(setTripCelebrantMock).not.toHaveBeenCalled();
  });

  it("assigns under the dedicated setCelebrant scope and revalidates", async () => {
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);

    expect(result).toEqual({ ok: true });
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "setCelebrant",
      "u-viewer",
      expect.any(Function)
    );
    expect(setTripCelebrantMock).toHaveBeenCalledWith(
      expect.anything(),
      TRIP_ID,
      TARGET_MEMBER_ID
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("clears the seat when memberId is null without fetching a target", async () => {
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(CLEAR_INPUT, KEY);

    expect(result).toEqual({ ok: true });
    expect(getTripMemberByIdMock).not.toHaveBeenCalled();
    expect(setTripCelebrantMock).toHaveBeenCalledWith(
      expect.anything(),
      TRIP_ID,
      null
    );
  });

  it("maps the RPC's founder denial to rls_denied (app check raced the DB)", async () => {
    setTripCelebrantMock.mockRejectedValue(
      new Error(
        "setTripCelebrant failed: set_trip_celebrant: caller is not the trip founder"
      )
    );
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("maps RateLimitError to rate_limit", async () => {
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("setCelebrant", { reset: 0, remaining: 0 })
    );
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("maps an unexpected db failure to celebrant_save_failed", async () => {
    setTripCelebrantMock.mockRejectedValue(new Error("boom"));
    const { setCelebrantAction } = await import("@/lib/actions/members");
    const result = await setCelebrantAction(ASSIGN_INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "celebrant_save_failed" });
  });
});
