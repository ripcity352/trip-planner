/**
 * Tests for `lib/actions/announcements.ts`.
 *
 * Covers:
 *   - validation_failed on non-uuid idempotency key / empty body
 *   - rls_denied when not authenticated
 *   - rate_limit when limiter throws
 *   - happy path postAnnouncement returns the announcement
 *   - idempotency replay (23505) returns existing row
 *   - rls_denied on 42501
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
>();
const insertCalls: Array<{ table: string; payload: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => buildClient()),
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
        if (prop === "insert") {
          return (payload: unknown) => {
            insertCalls.push({ table, payload });
            return proxy;
          };
        }
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

const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";

const mockAnnouncement = {
  id: "ann-1",
  trip_id: VALID_TRIP_ID,
  author_id: VALID_USER_ID,
  body: "Pack light.",
  pinned: false,
  created_at: "2026-05-20T10:00:00.000Z",
  idempotency_key: VALID_IDEMPOTENCY_KEY,
  visibility: "everyone",
  created_by: VALID_USER_ID,
};

describe("postAnnouncement", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    insertCalls.length = 0;
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid idempotency key", async () => {
    primeAuth(VALID_USER_ID);
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Hello" },
      "bad-key"
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on empty body", async () => {
    primeAuth(VALID_USER_ID);
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "" },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Pack light." },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("postAnnouncement", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Pack light." },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns the announcement on success", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("announcements", () => ({
      data: mockAnnouncement,
      error: null,
    }));
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Pack light." },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, announcement: mockAnnouncement });
  });

  it("returns existing announcement on idempotency replay (23505)", async () => {
    primeAuth(VALID_USER_ID);
    let callCount = 0;
    tableResolvers.set("announcements", () => {
      callCount++;
      if (callCount === 1) {
        return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      return { data: mockAnnouncement, error: null };
    });
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Pack light." },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: true, announcement: mockAnnouncement });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("announcements", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Pack light." },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns announcement_post_failed on generic DB error", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("announcements", () => ({
      data: null,
      error: { code: "XXXXX", message: "unexpected" },
    }));
    const { postAnnouncement } = await import("@/lib/actions/announcements");
    const result = await postAnnouncement(
      { tripId: VALID_TRIP_ID, body: "Pack light." },
      VALID_IDEMPOTENCY_KEY
    );
    expect(result).toEqual({ ok: false, errorKey: "announcement_post_failed" });
  });
});
