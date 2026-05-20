/**
 * Tests for `lib/actions/lodging-assignments.ts`.
 *
 * Covers:
 *   - validation_failed on bad input
 *   - rls_denied when not authenticated
 *   - rate_limit when limiter throws
 *   - assignMemberToLodging happy path (upsert)
 *   - assignMemberToLodging maps P0001 → validation_failed
 *     (trigger fired: item.kind != 'lodging')
 *   - removeLodgingAssignment happy path
 *   - removeLodgingAssignment validation_failed on non-uuid
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const tableResolvers = new Map<
  string,
  () => { data: unknown; error: unknown }
>();

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

const VALID_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const VALID_MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const VALID_ASSIGNMENT_ID = "44444444-4444-4444-8444-444444444444";
const VALID_USER_ID = "55555555-5555-4555-8555-555555555555";

const mockAssignment = {
  id: VALID_ASSIGNMENT_ID,
  item_id: VALID_ITEM_ID,
  trip_member_id: VALID_MEMBER_ID,
  room_label: "King Suite",
  created_at: "2026-05-20T00:00:00.000Z",
};

describe("assignMemberToLodging", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    rateLimitedActionMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid itemId", async () => {
    primeAuth(VALID_USER_ID);
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: "not-a-uuid",
      tripMemberId: VALID_MEMBER_ID,
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns validation_failed on non-uuid tripMemberId", async () => {
    primeAuth(VALID_USER_ID);
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: VALID_ITEM_ID,
      tripMemberId: "not-a-uuid",
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: VALID_ITEM_ID,
      tripMemberId: VALID_MEMBER_ID,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns rate_limit when limiter throws", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("lodging_assignments", () => ({ data: null, error: null }));
    const { RateLimitError } = await import("@/lib/rate-limit");
    rateLimitedActionMock.mockRejectedValueOnce(
      new RateLimitError("assignLodging", { reset: Date.now() + 60000, remaining: 0 })
    );
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: VALID_ITEM_ID,
      tripMemberId: VALID_MEMBER_ID,
      roomLabel: "King Suite",
    });
    expect(result).toEqual({ ok: false, errorKey: "rate_limit" });
  });

  it("returns the assignment on success", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("lodging_assignments", () => ({
      data: mockAssignment,
      error: null,
    }));
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: VALID_ITEM_ID,
      tripMemberId: VALID_MEMBER_ID,
      roomLabel: "King Suite",
    });
    expect(result).toEqual({ ok: true, assignment: mockAssignment });
  });

  it("maps P0001 (trigger: wrong item kind) to validation_failed", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("lodging_assignments", () => ({
      data: null,
      error: { code: "P0001", message: "lodging assignment requires item.kind = lodging" },
    }));
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: VALID_ITEM_ID,
      tripMemberId: VALID_MEMBER_ID,
    });
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("lodging_assignments", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { assignMemberToLodging } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await assignMemberToLodging({
      itemId: VALID_ITEM_ID,
      tripMemberId: VALID_MEMBER_ID,
    });
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});

describe("removeLodgingAssignment", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    tableResolvers.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.resetModules());

  it("returns validation_failed on non-uuid id", async () => {
    primeAuth(VALID_USER_ID);
    const { removeLodgingAssignment } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await removeLodgingAssignment("not-a-uuid");
    expect(result).toEqual({ ok: false, errorKey: "validation_failed" });
  });

  it("returns rls_denied when not authenticated", async () => {
    primeAuth(null);
    const { removeLodgingAssignment } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await removeLodgingAssignment(VALID_ASSIGNMENT_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });

  it("returns ok: true on successful delete", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("lodging_assignments", () => ({ data: null, error: null }));
    const { removeLodgingAssignment } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await removeLodgingAssignment(VALID_ASSIGNMENT_ID);
    expect(result).toEqual({ ok: true });
  });

  it("returns rls_denied on 42501", async () => {
    primeAuth(VALID_USER_ID);
    tableResolvers.set("lodging_assignments", () => ({
      data: null,
      error: { code: "42501", message: "rls" },
    }));
    const { removeLodgingAssignment } = await import(
      "@/lib/actions/lodging-assignments"
    );
    const result = await removeLodgingAssignment(VALID_ASSIGNMENT_ID);
    expect(result).toEqual({ ok: false, errorKey: "rls_denied" });
  });
});
