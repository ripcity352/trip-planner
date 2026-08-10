/**
 * Tests for `lib/actions/rsvp-confirm-prompts.ts` (#549).
 *
 * The load-bearing invariant: an organizer NEVER writes rsvp_status — they
 * send a pending ask; the member's own tap (setRsvpAction) writes it. These
 * tests cover the three actions' control flow (auth, organizer gate, self-
 * target, tenancy, rate-limit) and the attribution on the upsert payload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

// setRsvpAction is the ONLY writer of rsvp_status — mock it so the confirm
// path is tested for "delegates to the canonical action", not re-implemented.
const setRsvpActionMock = vi.fn();
vi.mock("@/lib/actions/rsvp", () => ({
  setRsvpAction: (...args: unknown[]) => setRsvpActionMock(...args),
}));

const getUserMock = vi.fn();
const tableResolvers = new Map<string, () => { data: unknown; error: unknown }>();
const lastUpsert = new Map<string, unknown>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

const rateLimitedActionMock = vi.fn(
  async (_scope: string, _key: string, fn: () => Promise<unknown>) => fn()
);
vi.mock("@/lib/rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
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

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const resolver = tableResolvers.get(table);
        const result = resolver ? resolver() : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "upsert") {
          return (payload: unknown) => {
            lastUpsert.set(table, payload);
            return proxy;
          };
        }
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };
  return { auth: { getUser: getUserMock }, from: vi.fn((t: string) => tableProxy(t)) };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "33333333-3333-4333-8333-333333333333";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const CALLER_MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_ID = "66666666-6666-4666-8666-666666666666";

function primeMembersSequence(results: ReadonlyArray<{ data: unknown; error: unknown }>) {
  let call = 0;
  tableResolvers.set("trip_members", () => {
    const r = results[Math.min(call, results.length - 1)];
    call += 1;
    return r;
  });
}

function primeOrganizerAndTarget() {
  primeMembersSequence([
    { data: { id: CALLER_MEMBER_ID, role: "organizer" }, error: null },
    { data: { id: TARGET_ID }, error: null },
  ]);
}

function reset() {
  getUserMock.mockReset();
  setRsvpActionMock.mockReset();
  tableResolvers.clear();
  lastUpsert.clear();
  rateLimitedActionMock.mockClear();
  revalidatePathMock.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("sendRsvpConfirmPromptAction", () => {
  beforeEach(reset);
  afterEach(() => vi.resetModules());

  it("rejects a non-uuid idempotency key", async () => {
    primeAuth(USER_ID);
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await sendRsvpConfirmPromptAction(
      { tripId: TRIP_ID, targetTripMemberId: TARGET_ID, proposedStatus: "going" },
      "nope"
    );
    expect(r).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("rejects an invalid proposed status", async () => {
    primeAuth(USER_ID);
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await sendRsvpConfirmPromptAction(
      // @ts-expect-error 'pending' is not a proposable status
      { tripId: TRIP_ID, targetTripMemberId: TARGET_ID, proposedStatus: "pending" },
      KEY
    );
    expect(r).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when the caller is not an organizer", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await sendRsvpConfirmPromptAction(
      { tripId: TRIP_ID, targetTripMemberId: TARGET_ID, proposedStatus: "going" },
      KEY
    );
    expect(r).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("rejects self-targeting (validation_failed)", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "organizer" },
      error: null,
    }));
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await sendRsvpConfirmPromptAction(
      { tripId: TRIP_ID, targetTripMemberId: CALLER_MEMBER_ID, proposedStatus: "going" },
      KEY
    );
    expect(r).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when the target is not in the trip (cross-tenant)", async () => {
    primeAuth(USER_ID);
    primeMembersSequence([
      { data: { id: CALLER_MEMBER_ID, role: "organizer" }, error: null },
      { data: null, error: null },
    ]);
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await sendRsvpConfirmPromptAction(
      { tripId: TRIP_ID, targetTripMemberId: TARGET_ID, proposedStatus: "going" },
      KEY
    );
    expect(r).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(rateLimitedActionMock).not.toHaveBeenCalled();
  });

  it("sends the ask attributed to the caller and returns ok", async () => {
    primeAuth(USER_ID);
    primeOrganizerAndTarget();
    tableResolvers.set("rsvp_confirm_prompts", () => ({ data: null, error: null }));
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await sendRsvpConfirmPromptAction(
      { tripId: TRIP_ID, targetTripMemberId: TARGET_ID, proposedStatus: "going", note: "  Rob texted  " },
      KEY
    );
    expect(r).toEqual({ ok: true });
    expect(lastUpsert.get("rsvp_confirm_prompts")).toMatchObject({
      trip_id: TRIP_ID,
      trip_member_id: TARGET_ID,
      sent_by_trip_member_id: CALLER_MEMBER_ID,
      proposed_status: "going",
      note: "Rob texted",
    });
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("uses the SEND_RSVP_PROMPT rate-limit scope keyed by user id", async () => {
    primeAuth(USER_ID);
    primeOrganizerAndTarget();
    tableResolvers.set("rsvp_confirm_prompts", () => ({ data: null, error: null }));
    const { sendRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    await sendRsvpConfirmPromptAction(
      { tripId: TRIP_ID, targetTripMemberId: TARGET_ID, proposedStatus: "maybe" },
      KEY
    );
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "sendRsvpPrompt",
      USER_ID,
      expect.any(Function)
    );
  });
});

describe("confirmRsvpConfirmPromptAction", () => {
  beforeEach(reset);
  afterEach(() => vi.resetModules());

  it("returns validation_failed when there is no pending ask", async () => {
    primeAuth(USER_ID);
    // caller membership resolves, but the prompt read returns nothing.
    let call = 0;
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    tableResolvers.set("rsvp_confirm_prompts", () => {
      call += 1;
      return { data: null, error: null };
    });
    const { confirmRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await confirmRsvpConfirmPromptAction(TRIP_ID, "going", KEY);
    expect(r).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(setRsvpActionMock).not.toHaveBeenCalled();
    void call;
  });

  it("rejects a stale confirm when the ask was replaced (expected != current)", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    // The DB now holds 'declined' but the member's banner tapped 'going'.
    tableResolvers.set("rsvp_confirm_prompts", () => ({
      data: {
        id: "p1",
        proposed_status: "declined",
        note: null,
        sent_by_trip_member_id: "org-1",
        sender: null,
      },
      error: null,
    }));
    const { confirmRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await confirmRsvpConfirmPromptAction(TRIP_ID, "going", KEY);
    expect(r).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(setRsvpActionMock).not.toHaveBeenCalled();
  });

  it("applies the proposed status via setRsvpAction, then clears the ask", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    tableResolvers.set("rsvp_confirm_prompts", () => ({
      data: {
        id: "p1",
        proposed_status: "maybe",
        note: null,
        sent_by_trip_member_id: "org-1",
        sender: null,
      },
      error: null,
    }));
    setRsvpActionMock.mockResolvedValue({ ok: true, status: "maybe" });
    const { confirmRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await confirmRsvpConfirmPromptAction(TRIP_ID, "maybe", KEY);
    expect(r).toEqual({ ok: true });
    // The member's own tap goes through the canonical RSVP writer with the
    // proposed status read from the DB (not client-supplied).
    expect(setRsvpActionMock).toHaveBeenCalledWith({ tripId: TRIP_ID, status: "maybe" }, KEY);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("surfaces the setRsvpAction error and does not clear the ask", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    tableResolvers.set("rsvp_confirm_prompts", () => ({
      data: {
        id: "p1",
        proposed_status: "going",
        note: null,
        sent_by_trip_member_id: "org-1",
        sender: null,
      },
      error: null,
    }));
    setRsvpActionMock.mockResolvedValue({ ok: false, errorKey: "rate_limit" });
    const { confirmRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await confirmRsvpConfirmPromptAction(TRIP_ID, "going", KEY);
    expect(r).toEqual({ ok: false, errorKey: "rate_limit" });
  });
});

describe("dismissRsvpConfirmPromptAction", () => {
  beforeEach(reset);
  afterEach(() => vi.resetModules());

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { dismissRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await dismissRsvpConfirmPromptAction(TRIP_ID);
    expect(r).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("deletes the caller's own ask and returns ok", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("trip_members", () => ({
      data: { id: CALLER_MEMBER_ID, role: "attendee" },
      error: null,
    }));
    tableResolvers.set("rsvp_confirm_prompts", () => ({ data: null, error: null }));
    const { dismissRsvpConfirmPromptAction } = await import("@/lib/actions/rsvp-confirm-prompts");
    const r = await dismissRsvpConfirmPromptAction(TRIP_ID);
    expect(r).toEqual({ ok: true });
    expect(rateLimitedActionMock).toHaveBeenCalledWith(
      "sendRsvpPrompt",
      USER_ID,
      expect.any(Function)
    );
  });
});
