/**
 * Tests for `lib/db/trip-notes.ts`.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getTripNotes } from "../trip-notes";

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? {
          data: null,
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

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

describe("getTripNotes", () => {
  it("returns the notes string when set", async () => {
    const client = makeClient({
      trips: () => ({ data: { notes: "Bring sunscreen." }, error: null }),
    });
    const result = await getTripNotes(client, TRIP_ID);
    expect(result).toBe("Bring sunscreen.");
  });

  it("returns null when notes column is null", async () => {
    const client = makeClient({
      trips: () => ({ data: { notes: null }, error: null }),
    });
    const result = await getTripNotes(client, TRIP_ID);
    expect(result).toBeNull();
  });

  it("returns null when trip row not found (caller not a member)", async () => {
    const client = makeClient({
      trips: () => ({ data: null, error: null }),
    });
    const result = await getTripNotes(client, TRIP_ID);
    expect(result).toBeNull();
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      trips: () => ({
        data: null,
        error: { message: "connection failed" },
      }),
    });
    await expect(getTripNotes(client, TRIP_ID)).rejects.toThrow(
      "getTripNotes failed: connection failed"
    );
  });
});
