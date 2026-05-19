/**
 * Smoke tests for lib/db/trips.ts query shape. We mock the Supabase
 * fluent builder and assert that the M1 columns + soft-delete filter
 * are present on `listMyTrips`.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listMyTrips, getTripBySlug, createTrip } from "../trips";

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

  // ----------------------------------------------------------------
  // M2 — createTrip now routes through the SECURITY DEFINER RPC
  // `public.create_trip_with_organizer(...)` so the trip insert and
  // organizer membership insert land in the same transaction.
  // ----------------------------------------------------------------
  describe("createTrip (M2, via RPC)", () => {
    function makeRpcClient(rpcReturn: {
      data: unknown;
      error: { message: string } | null;
    }) {
      // Explicit signature so `mock.calls[0]` is a 2-tuple, not `[]`.
      // The arguments are introspected by tests via `rpcMock.mock.calls`;
      // we don't read them inside the function body.
      const rpcMock = vi.fn<
        (name: string, args: Record<string, unknown>) => Promise<typeof rpcReturn>
      >(async () => rpcReturn);
      const client = {
        from: vi.fn(),
        rpc: rpcMock,
      } as unknown as SupabaseClient;
      return { client, rpcMock };
    }

    const insertedTrip = {
      id: "trip-1",
      slug: "vegas-bach",
      name: "Vegas",
      description: null,
      location: null,
      starts_at: null,
      ends_at: null,
      created_by: "user-1",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      kind: "bachelor",
      is_template: false,
      deleted_at: null,
      archived_at: null,
      vibe_tags: [],
    };

    it("calls create_trip_with_organizer RPC with the input mapped to p_ params", async () => {
      const { client, rpcMock } = makeRpcClient({
        data: insertedTrip,
        error: null,
      });

      const out = await createTrip(client, {
        slug: "vegas-bach",
        name: "Vegas",
      });

      expect(rpcMock).toHaveBeenCalledTimes(1);
      const [fnName, args] = rpcMock.mock.calls[0];
      expect(fnName).toBe("create_trip_with_organizer");
      expect(args).toMatchObject({
        p_slug: "vegas-bach",
        p_name: "Vegas",
        p_description: null,
        p_location: null,
        p_starts_at: null,
        p_ends_at: null,
        p_vibe_tags: [],
      });
      expect(out).toEqual(insertedTrip);
    });

    it("forwards optional fields (vibe_tags, dates) when set", async () => {
      const { client, rpcMock } = makeRpcClient({
        data: insertedTrip,
        error: null,
      });

      await createTrip(client, {
        slug: "vegas-bach",
        name: "Vegas",
        description: "the big one",
        location: "Vegas, NV",
        starts_at: "2026-06-15",
        ends_at: "2026-06-18",
        vibe_tags: ["low-key"],
      });

      const args = rpcMock.mock.calls[0][1];
      expect(args.p_description).toBe("the big one");
      expect(args.p_location).toBe("Vegas, NV");
      expect(args.p_starts_at).toBe("2026-06-15");
      expect(args.p_ends_at).toBe("2026-06-18");
      expect(args.p_vibe_tags).toEqual(["low-key"]);
    });

    it("unwraps a 1-element array response (some driver shapes)", async () => {
      const { client } = makeRpcClient({
        data: [insertedTrip],
        error: null,
      });

      const out = await createTrip(client, {
        slug: "vegas-bach",
        name: "Vegas",
      });
      expect(out).toEqual(insertedTrip);
    });

    it("throws with a descriptive message when the RPC errors", async () => {
      const { client } = makeRpcClient({
        data: null,
        error: { message: "duplicate slug" },
      });

      await expect(
        createTrip(client, { slug: "vegas-bach", name: "Vegas" })
      ).rejects.toThrow(/createTrip failed.*duplicate slug/);
    });

    it("throws when the RPC returns an empty array", async () => {
      const { client } = makeRpcClient({ data: [], error: null });
      await expect(
        createTrip(client, { slug: "vegas-bach", name: "Vegas" })
      ).rejects.toThrow(/empty response/);
    });
  });
});
