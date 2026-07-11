/**
 * Tests for `lib/actions/announcement-reactions.ts`.
 * TDD: written before implementation (RED phase).
 *
 * Covers:
 *   - validation_failed on bad announcementId / emoji outside the fixed set
 *   - rls_denied when unauthenticated
 *   - rls_denied when the parent announcement is not visible to the caller
 *     (RLS-filtered select returns no row)
 *   - rls_denied when the caller has no member row in the trip
 *   - toggle ON happy path (insert)
 *   - toggle ON replay: 23505 treated as success (natural-key idempotency)
 *   - toggle OFF happy path (delete; 0-row delete is still success)
 *   - 42501 on write → rls_denied
 *   - rate_limit when the limiter throws
 *   - F2/#110: revalidatePath fires on every success branch (incl. the
 *     23505 replay) and never on a failure branch
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

interface TableResult {
  data: unknown;
  error: unknown;
}
const tableResolvers = new Map<string, () => TableResult>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
}));

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
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

function buildClient(): unknown {
  const tableProxy = (table: string): Record<string, unknown> => {
    const thenable: PromiseLike<TableResult> = {
      then(onfulfilled) {
        const resolver = tableResolvers.get(table);
        const result = resolver ? resolver() : { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  return {
    auth: { getUser: getUserMock },
    from: vi.fn((table: string) => tableProxy(table)),
  };
}

function primeAuth(userId: string | null) {
  getUserMock.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: null }
  );
}

function primeAnnouncementAndMember(tripId: string, memberId: string) {
  tableResolvers.set("announcements", () => ({
    data: { trip_id: tripId },
    error: null,
  }));
  tableResolvers.set("trip_members", () => ({
    data: { id: memberId },
    error: null,
  }));
}

const ANN_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";

async function importAction() {
  const mod = await import("@/lib/actions/announcement-reactions");
  return mod.toggleReactionAction;
}

describe("toggleReactionAction", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    rateLimitedActionMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on a non-uuid announcementId", async () => {
    primeAuth(USER_ID);
    const toggleReactionAction = await importAction();
    const result = await toggleReactionAction({
      announcementId: "nope",
      emoji: "🔥",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns validation_failed on an emoji outside the fixed set", async () => {
    primeAuth(USER_ID);
    const toggleReactionAction = await importAction();
    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🎳",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const toggleReactionAction = await importAction();
    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rls_denied when the announcement is invisible to the caller", async () => {
    primeAuth(USER_ID);
    // RLS-filtered select: no row comes back for a hidden parent.
    tableResolvers.set("announcements", () => ({ data: null, error: null }));
    const toggleReactionAction = await importAction();
    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns rls_denied when the caller has no member row", async () => {
    primeAuth(USER_ID);
    tableResolvers.set("announcements", () => ({
      data: { trip_id: TRIP_ID },
      error: null,
    }));
    tableResolvers.set("trip_members", () => ({ data: null, error: null }));
    const toggleReactionAction = await importAction();
    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("toggles ON (insert) and revalidates on success", async () => {
    primeAuth(USER_ID);
    primeAnnouncementAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("announcement_reactions", () => ({
      data: null,
      error: null,
    }));
    const toggleReactionAction = await importAction();

    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });

    expect(result).toEqual({ ok: true, active: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 23505 replay as success (natural-key idempotency) and still revalidates", async () => {
    primeAuth(USER_ID);
    primeAnnouncementAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("announcement_reactions", () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    }));
    const toggleReactionAction = await importAction();

    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });

    expect(result).toEqual({ ok: true, active: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
  });

  it("toggles OFF (delete) and revalidates on success", async () => {
    primeAuth(USER_ID);
    primeAnnouncementAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("announcement_reactions", () => ({
      data: null,
      error: null,
    }));
    const toggleReactionAction = await importAction();

    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: false,
    });

    expect(result).toEqual({ ok: true, active: false });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
  });

  it("maps a 42501 write rejection to rls_denied and does NOT revalidate", async () => {
    primeAuth(USER_ID);
    primeAnnouncementAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("announcement_reactions", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const toggleReactionAction = await importAction();

    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });

    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns rate_limit when the limiter denies", async () => {
    primeAuth(USER_ID);
    primeAnnouncementAndMember(TRIP_ID, MEMBER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("toggleReaction", { remaining: 0, reset: 0 })
    );
    const toggleReactionAction = await importAction();

    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });

    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps an unexpected write error to reaction_save_failed", async () => {
    primeAuth(USER_ID);
    primeAnnouncementAndMember(TRIP_ID, MEMBER_ID);
    tableResolvers.set("announcement_reactions", () => ({
      data: null,
      error: { code: "XX000", message: "kaboom" },
    }));
    const toggleReactionAction = await importAction();

    const result = await toggleReactionAction({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });

    expect(result).toEqual({ ok: false, errorKey: "reaction_save_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
