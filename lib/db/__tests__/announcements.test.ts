/**
 * Tests for `lib/db/announcements.ts`.
 *
 * Tests:
 *   1. `getAnnouncements` — success, empty, null data, error propagation.
 *   2. `enrichAnnouncements` (#250) — the single post-fetch author-
 *      enrichment path: map hit, map miss, null created_by, null
 *      display_name, input immutability.
 *   3. `subscribeToAnnouncements` — channel is returned, correct event
 *      type and table filter, onInsert callback fires with the payload.
 *   4. `deleteAnnouncement` / `setAnnouncementPinned` (#393) — exact-count
 *      delete/update, ANNOUNCEMENT_NO_ROW on a zero-row match, error.code
 *      preserved on failure (mirrors `deleteExpense`/`updateExpenseWithSplits`).
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ANNOUNCEMENT_NO_ROW,
  AnnouncementDbError,
  deleteAnnouncement,
  enrichAnnouncements,
  getAnnouncements,
  setAnnouncementPinned,
  subscribeToAnnouncements,
} from "../announcements";
import type { Announcement } from "../types";

// ---------------------------------------------------------------------------
// Query mock
// ---------------------------------------------------------------------------

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? {
          data: [],
          error: null,
        };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        return () => proxy;
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  return {
    from: vi.fn((table: string) => buildProxy(table)),
  } as unknown as SupabaseClient;
}

/**
 * Fluent-builder mock that also carries `count` — needed for the
 * exact-count delete/update mutations (#393, mirrors expenses.test.ts).
 */
function makeSequencedBuilder(
  responses: Array<{ data: unknown; error: unknown; count?: number | null }>
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = [...responses];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") {
        const next = queue.shift() ?? { data: null, error: null };
        const p = Promise.resolve(next);
        return p.then.bind(p);
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

const mockAnnouncement: Announcement = {
  id: "ann-1",
  trip_id: TRIP_ID,
  author_id: "user-1",
  body: "Pack light, boys.",
  pinned: false,
  created_at: "2026-05-20T10:00:00.000Z",
  idempotency_key: null,
  visibility: "everyone",
  created_by: "user-1",
};

// ---------------------------------------------------------------------------
// getAnnouncements
// ---------------------------------------------------------------------------

describe("getAnnouncements", () => {
  it("returns announcements on success", async () => {
    const client = makeClient({
      announcements: () => ({ data: [mockAnnouncement], error: null }),
    });
    const result = await getAnnouncements(client, TRIP_ID);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("Pack light, boys.");
    expect(result[0].created_by).toBe("user-1");
  });

  it("returns empty array when no announcements", async () => {
    const client = makeClient({
      announcements: () => ({ data: [], error: null }),
    });
    const result = await getAnnouncements(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      announcements: () => ({ data: null, error: null }),
    });
    const result = await getAnnouncements(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      announcements: () => ({
        data: null,
        error: { message: "rls denied" },
      }),
    });
    await expect(getAnnouncements(client, TRIP_ID)).rejects.toThrow(
      "getAnnouncements failed: rls denied"
    );
  });
});

// ---------------------------------------------------------------------------
// enrichAnnouncements (#250 — the one post-fetch enrichment path)
// ---------------------------------------------------------------------------

describe("enrichAnnouncements", () => {
  const memberUserMap = new Map<string, string | null>([
    ["user-1", "Dave"],
    ["user-2", null],
  ]);

  it("resolves authorDisplayName from the map by created_by", () => {
    const result = enrichAnnouncements([mockAnnouncement], memberUserMap);
    expect(result).toHaveLength(1);
    expect(result[0].authorDisplayName).toBe("Dave");
  });

  it("yields null when created_by is missing from the map", () => {
    const orphan: Announcement = { ...mockAnnouncement, created_by: "gone" };
    const [enriched] = enrichAnnouncements([orphan], memberUserMap);
    expect(enriched.authorDisplayName).toBeNull();
  });

  it("yields null when created_by is null", () => {
    const legacy: Announcement = { ...mockAnnouncement, created_by: null };
    const [enriched] = enrichAnnouncements([legacy], memberUserMap);
    expect(enriched.authorDisplayName).toBeNull();
  });

  it("yields null when the member has no display_name", () => {
    const anon: Announcement = { ...mockAnnouncement, created_by: "user-2" };
    const [enriched] = enrichAnnouncements([anon], memberUserMap);
    expect(enriched.authorDisplayName).toBeNull();
  });

  it("does not mutate the input rows", () => {
    const input = { ...mockAnnouncement };
    enrichAnnouncements([input], memberUserMap);
    expect(input).toEqual(mockAnnouncement);
  });
});

// ---------------------------------------------------------------------------
// subscribeToAnnouncements
// ---------------------------------------------------------------------------

describe("subscribeToAnnouncements", () => {
  it("creates a channel scoped to the trip", () => {
    const subscribeMock = vi.fn().mockReturnValue({});
    const onMock = vi.fn().mockReturnThis();

    const channelMock = { on: onMock, subscribe: subscribeMock };
    const channelFn = vi.fn().mockReturnValue(channelMock);

    const client = { channel: channelFn } as unknown as SupabaseClient;

    const onInsert = vi.fn();
    subscribeToAnnouncements(client, TRIP_ID, onInsert);

    // Channel name includes the trip id
    expect(channelFn).toHaveBeenCalledWith(`announcements:${TRIP_ID}`);
    expect(onMock).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "announcements",
        filter: `trip_id=eq.${TRIP_ID}`,
      }),
      expect.any(Function)
    );
    expect(subscribeMock).toHaveBeenCalled();
  });

  it("calls onInsert with the enriched row when a change fires", () => {
    // W1c: subscribeToAnnouncements now enriches the payload with
    // authorDisplayName before invoking onInsert. When no memberUserMap is
    // passed (or the map is empty), the fallback "Someone" is used.
    const onInsert = vi.fn();
    let capturedCallback: ((payload: { new: unknown }) => void) | null = null;

    const onMock = vi.fn(
      (_event: string, _config: unknown, callback: (payload: { new: unknown }) => void) => {
        capturedCallback = callback;
        return { subscribe: vi.fn().mockReturnValue({}) };
      }
    );

    const client = {
      channel: vi.fn().mockReturnValue({ on: onMock }),
    } as unknown as SupabaseClient;

    subscribeToAnnouncements(client, TRIP_ID, onInsert);

    expect(capturedCallback).not.toBeNull();
    capturedCallback!({ new: mockAnnouncement });
    // The payload is enriched — authorDisplayName added with fallback "Someone"
    // because no memberUserMap was provided (empty map default).
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ...mockAnnouncement,
        authorDisplayName: "Someone",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// deleteAnnouncement (#393)
// ---------------------------------------------------------------------------

describe("deleteAnnouncement", () => {
  it("deletes by id with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);

    await deleteAnnouncement(client as unknown as SupabaseClient, "ann-1");

    expect(calls.find((c) => c.method === "delete")?.args[0]).toEqual({
      count: "exact",
    });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "ann-1",
    ]);
  });

  it("throws ANNOUNCEMENT_NO_ROW when nothing matched (non-organizer / already-deleted)", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);

    const err = await deleteAnnouncement(
      client as unknown as SupabaseClient,
      "ann-1"
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(AnnouncementDbError);
    expect((err as AnnouncementDbError).code).toBe(ANNOUNCEMENT_NO_ROW);
  });

  it("preserves error.code on failure", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: { code: "42501", message: "rls" }, count: null },
    ]);

    const err = await deleteAnnouncement(
      client as unknown as SupabaseClient,
      "ann-1"
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(AnnouncementDbError);
    expect((err as AnnouncementDbError).code).toBe("42501");
  });
});

// ---------------------------------------------------------------------------
// setAnnouncementPinned (#393)
// ---------------------------------------------------------------------------

describe("setAnnouncementPinned", () => {
  it("updates pinned to the desired end state with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);

    await setAnnouncementPinned(
      client as unknown as SupabaseClient,
      "ann-1",
      true
    );

    expect(calls.find((c) => c.method === "update")?.args).toEqual([
      { pinned: true },
      { count: "exact" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "ann-1",
    ]);
  });

  it("throws ANNOUNCEMENT_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);

    const err = await setAnnouncementPinned(
      client as unknown as SupabaseClient,
      "ann-1",
      false
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(AnnouncementDbError);
    expect((err as AnnouncementDbError).code).toBe(ANNOUNCEMENT_NO_ROW);
  });

  it("preserves error.code on failure", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: { code: "42501", message: "rls" }, count: null },
    ]);

    const err = await setAnnouncementPinned(
      client as unknown as SupabaseClient,
      "ann-1",
      true
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(AnnouncementDbError);
    expect((err as AnnouncementDbError).code).toBe("42501");
  });
});
