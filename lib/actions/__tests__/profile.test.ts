/**
 * Tests for `lib/actions/profile.ts` (#368 / #262 — self-service /me
 * profile editing).
 *
 * The db layer is mocked at the module boundary (its query shape has its
 * own suite in lib/db/__tests__/trips.test.ts). Here we pin validation
 * (name bounds + phone normalization), auth, the own-row resolution
 * (client never names a memberId), idempotency replay, the no-op
 * shortcut, rate-limit scope, and honest error mapping — including the
 * deterministic duplicate-phone rejection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@/lib/rate-limit";

const getUserMock = vi.fn();
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const getViewerMemberMock = vi.fn();
const updateMyMemberProfileMock = vi.fn();
vi.mock("@/lib/db/trips", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/trips")>(
    "@/lib/db/trips"
  );
  return {
    ...actual,
    getViewerMember: (...args: unknown[]) =>
      getViewerMemberMock(...(args as [])),
    updateMyMemberProfile: (...args: unknown[]) =>
      updateMyMemberProfileMock(...(args as [])),
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

// Dynamic import so the hoisted vi.mock factories run against
// initialized mock consts (same pattern as members.test.ts).
const { updateMyProfileAction } = await import("@/lib/actions/profile");

const TRIP_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const KEY = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99";
const VIEWER_MEMBER_ID = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01";

const VIEWER = {
  id: VIEWER_MEMBER_ID,
  role: "attendee",
  is_celebrant: false,
  display_name: "Carl",
  phone_e164: null,
  idempotency_key: null,
};

function resetMocks() {
  getUserMock.mockReset();
  createClientMock.mockReset();
  getViewerMemberMock.mockReset();
  updateMyMemberProfileMock.mockReset();
  rateLimitedActionMock.mockClear();
  revalidatePathMock.mockReset();

  createClientMock.mockResolvedValue({ auth: { getUser: getUserMock } });
  getUserMock.mockResolvedValue({ data: { user: { id: "u-viewer" } } });
  getViewerMemberMock.mockResolvedValue({ ...VIEWER });
  updateMyMemberProfileMock.mockResolvedValue("updated");
}

beforeEach(resetMocks);
afterEach(() => {
  vi.restoreAllMocks();
});

const INPUT = {
  tripId: TRIP_ID,
  displayName: "Carl C",
  phone: "(415) 555-1212",
};

describe("updateMyProfileAction", () => {
  it("rejects a non-uuid idempotency key", async () => {
    const result = await updateMyProfileAction(INPUT, "not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateMyMemberProfileMock).not.toHaveBeenCalled();
  });

  it("rejects an empty display name", async () => {
    const result = await updateMyProfileAction(
      { ...INPUT, displayName: "   " },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a display name over the shared 80-char bound", async () => {
    const result = await updateMyProfileAction(
      { ...INPUT, displayName: "x".repeat(81) },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects a phone that can't normalize to E.164", async () => {
    const result = await updateMyProfileAction(
      { ...INPUT, phone: "555-1212" },
      KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(updateMyMemberProfileMock).not.toHaveBeenCalled();
  });

  it("returns auth_failed when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await updateMyProfileAction(INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "auth_failed" });
  });

  it("returns rls_denied when the caller is not a member of the trip", async () => {
    getViewerMemberMock.mockResolvedValue(null);
    const result = await updateMyProfileAction(INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(updateMyMemberProfileMock).not.toHaveBeenCalled();
  });

  it("writes the NORMALIZED phone to the caller's own member row", async () => {
    const result = await updateMyProfileAction(INPUT, KEY);

    expect(result).toEqual({
      ok: true,
      displayName: "Carl C",
      phoneE164: "+14155551212",
    });
    expect(updateMyMemberProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      TRIP_ID,
      VIEWER_MEMBER_ID, // resolved server-side, never client-supplied
      "Carl C",
      "+14155551212",
      KEY
    );
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "updateMyProfile",
      "u-viewer",
      expect.any(Function)
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips", "layout");
  });

  it("clears the phone when the field is submitted empty", async () => {
    const result = await updateMyProfileAction({ ...INPUT, phone: "" }, KEY);

    expect(result).toEqual({
      ok: true,
      displayName: "Carl C",
      phoneE164: null,
    });
    expect(updateMyMemberProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      TRIP_ID,
      VIEWER_MEMBER_ID,
      "Carl C",
      null,
      KEY
    );
  });

  it("replays idempotently when the stored key matches (no second write)", async () => {
    getViewerMemberMock.mockResolvedValue({
      ...VIEWER,
      display_name: "Stored Name",
      phone_e164: "+14155550000",
      idempotency_key: KEY,
    });

    const result = await updateMyProfileAction(INPUT, KEY);

    expect(result).toEqual({
      ok: true,
      displayName: "Stored Name",
      phoneE164: "+14155550000",
    });
    expect(updateMyMemberProfileMock).not.toHaveBeenCalled();
  });

  it("skips the write when nothing changed", async () => {
    getViewerMemberMock.mockResolvedValue({
      ...VIEWER,
      display_name: "Carl C",
      phone_e164: "+14155551212",
    });

    const result = await updateMyProfileAction(INPUT, KEY);

    expect(result).toEqual({
      ok: true,
      displayName: "Carl C",
      phoneE164: "+14155551212",
    });
    expect(updateMyMemberProfileMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps duplicate_phone to the deterministic profile_phone_taken key", async () => {
    updateMyMemberProfileMock.mockResolvedValue("duplicate_phone");
    const result = await updateMyProfileAction(INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "profile_phone_taken" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces rls_denied when the update matches zero rows", async () => {
    updateMyMemberProfileMock.mockResolvedValue("missing");
    const result = await updateMyProfileAction(INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("maps RateLimitError to rate_limit", async () => {
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("updateMyProfile", { reset: 0, remaining: 0 })
    );
    const result = await updateMyProfileAction(INPUT, KEY);
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("maps unexpected db throws to profile_save_failed", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    updateMyMemberProfileMock.mockRejectedValue(new Error("boom"));

    const result = await updateMyProfileAction(INPUT, KEY);

    expect(result).toEqual({ ok: false, errorKey: "profile_save_failed" });
    expect(consoleSpy).toHaveBeenCalled();
  });
});
