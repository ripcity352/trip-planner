/**
 * Tests for `lib/db/announcements.ts`.
 *
 * Tests:
 *   1. `getAnnouncements` — success, empty, null data, error propagation.
 *   2. `subscribeToAnnouncements` — channel is returned, correct event
 *      type and table filter, onInsert callback fires with the payload.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnnouncements, subscribeToAnnouncements } from "../announcements";
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

  it("calls onInsert with the new row when a change fires", () => {
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
    expect(onInsert).toHaveBeenCalledWith(mockAnnouncement);
  });
});
