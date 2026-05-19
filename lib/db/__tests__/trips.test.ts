/**
 * Smoke tests for lib/db/trips.ts query shape. We mock the Supabase
 * fluent builder and assert that the M1 columns + soft-delete filter
 * are present on `listMyTrips`.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listMyTrips, getTripBySlug } from "../trips";

const M1_COLUMNS = [
  "kind",
  "is_template",
  "deleted_at",
  "archived_at",
  "vibe_tags",
];

function makeBuilder(rows: unknown) {
  // Inline immutable chain tracker — captures every call argument without
  // mutating across tests. The Supabase client returns `this` for fluent
  // builders, so each chained call records the args and returns the same
  // proxy.
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<{ data: unknown; error: null }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
    },
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") return thenable.then.bind(thenable);
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };

  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

describe("lib/db/trips.ts", () => {
  it("listMyTrips selects every M1 trip column and filters soft-deleted + templates", async () => {
    const { calls, client } = makeBuilder([]);

    await listMyTrips(client as unknown as SupabaseClient);

    const selectCall = calls.find((c) => c.method === "select");
    expect(selectCall).toBeDefined();

    const selectArg = String(selectCall?.args[0]);
    for (const col of M1_COLUMNS) {
      expect(selectArg).toContain(col);
    }

    // Soft-delete + template defense-in-depth filter.
    const filterCalls = calls.filter(
      (c) => c.method === "is" || c.method === "eq"
    );
    const filterArgs = filterCalls.map((c) => `${c.args[0]}=${c.args[1]}`);
    expect(filterArgs).toContain("deleted_at=null");
    expect(filterArgs).toContain("is_template=false");
  });

  it("getTripBySlug returns null when Supabase reports no row", async () => {
    const { client } = makeBuilder(null);

    const result = await getTripBySlug(
      client as unknown as SupabaseClient,
      "missing"
    );
    expect(result).toBeNull();
  });
});
