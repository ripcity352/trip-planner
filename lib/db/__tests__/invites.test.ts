/**
 * Smoke tests for lib/db/invites.ts. We mock the Supabase fluent
 * builder + RPC surface and assert shape, not behavior — RLS and the
 * SECURITY DEFINER preview function are exercised by the Playwright
 * specs against a real local DB.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createInviteRecord,
  getInvitePreview,
  getTripInvites,
} from "../invites";

/**
 * Builds a tiny proxy that records every method call on the Supabase
 * builder chain and resolves to a configurable `{ data, error }`. Each
 * test gets its own immutable instance.
 */
function makeBuilder(rows: unknown, error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: rows, error }).then(onfulfilled);
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

  const rpcMock = vi.fn(async () => ({ data: rows, error }));
  const fromMock = vi.fn(() => proxy);

  return {
    calls,
    client: { from: fromMock, rpc: rpcMock },
    rpcMock,
    fromMock,
  };
}

describe("lib/db/invites.ts", () => {
  describe("getInvitePreview", () => {
    it("calls invite_preview RPC with the token and returns the first row", async () => {
      const { client, rpcMock } = makeBuilder([
        {
          trip_name: "Vegas",
          starts_at: "2026-06-01T00:00:00Z",
          ends_at: "2026-06-04T00:00:00Z",
          host_display_name: "Dave",
          attendee_count_bucket: "small-crew",
        },
      ]);

      const preview = await getInvitePreview(
        client as unknown as SupabaseClient,
        "abc-token"
      );

      expect(rpcMock).toHaveBeenCalledWith("invite_preview", {
        p_token: "abc-token",
      });
      expect(preview).toEqual({
        trip_name: "Vegas",
        // #364: the RPC's timestamptz strings are normalized back to the
        // date-only values they encode — see the normalization tests below.
        starts_at: "2026-06-01",
        ends_at: "2026-06-04",
        host_display_name: "Dave",
        attendee_count_bucket: "small-crew",
      });
    });

    // #364 regression: invite_preview casts the `date` columns to
    // timestamptz at midnight UTC. Passing that through to parseDateOnly/
    // parseISO renders one calendar day early anywhere west of UTC. The
    // boundary must hand consumers date-only strings.
    it("normalizes timestamptz starts_at/ends_at to date-only strings", async () => {
      const { client } = makeBuilder([
        {
          trip_name: "Tahoe",
          starts_at: "2026-07-28T00:00:00+00:00",
          ends_at: "2026-07-31T00:00:00+00:00",
          host_display_name: "Dave",
          attendee_count_bucket: "small-crew",
        },
      ]);

      const preview = await getInvitePreview(
        client as unknown as SupabaseClient,
        "abc-token"
      );

      expect(preview?.starts_at).toBe("2026-07-28");
      expect(preview?.ends_at).toBe("2026-07-31");
    });

    it("passes through date-only values and nulls untouched", async () => {
      const { client } = makeBuilder([
        {
          trip_name: "Tahoe",
          starts_at: "2026-07-28",
          ends_at: null,
          host_display_name: "Dave",
          attendee_count_bucket: "small-crew",
        },
      ]);

      const preview = await getInvitePreview(
        client as unknown as SupabaseClient,
        "abc-token"
      );

      expect(preview?.starts_at).toBe("2026-07-28");
      expect(preview?.ends_at).toBeNull();
    });

    it("returns null when the RPC returns an empty array", async () => {
      const { client } = makeBuilder([]);
      const preview = await getInvitePreview(
        client as unknown as SupabaseClient,
        "nope"
      );
      expect(preview).toBeNull();
    });

    it("returns null when the RPC returns null", async () => {
      const { client } = makeBuilder(null);
      const preview = await getInvitePreview(
        client as unknown as SupabaseClient,
        "nope"
      );
      expect(preview).toBeNull();
    });

    it("throws when the RPC errors", async () => {
      const { client } = makeBuilder(null, { message: "boom" });
      await expect(
        getInvitePreview(client as unknown as SupabaseClient, "nope")
      ).rejects.toThrow(/invite_preview/);
    });
  });

  describe("getTripInvites", () => {
    it("selects from invites, filters by trip_id, orders by created_at desc", async () => {
      const { calls, client } = makeBuilder([
        {
          token: "t1",
          trip_id: "trip-1",
          created_by: "user-1",
          expires_at: null,
          uses_left: null,
          created_at: "2026-06-01T00:00:00Z",
        },
      ]);

      const out = await getTripInvites(
        client as unknown as SupabaseClient,
        "trip-1"
      );

      expect(out).toHaveLength(1);
      const eqCall = calls.find((c) => c.method === "eq");
      expect(eqCall).toBeDefined();
      expect(eqCall?.args).toEqual(["trip_id", "trip-1"]);

      const orderCall = calls.find((c) => c.method === "order");
      expect(orderCall?.args[0]).toBe("created_at");
    });

    it("returns an empty array when no rows", async () => {
      const { client } = makeBuilder(null);
      const out = await getTripInvites(
        client as unknown as SupabaseClient,
        "trip-1"
      );
      expect(out).toEqual([]);
    });
  });

  describe("createInviteRecord", () => {
    it("inserts a row with the trip_id, uses_left, expires_at and returns the inserted row", async () => {
      const inserted = {
        token: "t-new",
        trip_id: "trip-1",
        created_by: "user-1",
        expires_at: "2026-06-30T00:00:00Z",
        uses_left: 3,
        created_at: "2026-06-01T00:00:00Z",
      };
      const { calls, client } = makeBuilder(inserted);

      const out = await createInviteRecord(
        client as unknown as SupabaseClient,
        "trip-1",
        3,
        "2026-06-30T00:00:00Z"
      );

      expect(out).toEqual(inserted);
      const insertCall = calls.find((c) => c.method === "insert");
      expect(insertCall).toBeDefined();
      const payload = insertCall?.args[0] as Record<string, unknown>;
      expect(payload.trip_id).toBe("trip-1");
      expect(payload.uses_left).toBe(3);
      expect(payload.expires_at).toBe("2026-06-30T00:00:00Z");
    });

    it("throws when insert errors (e.g. RLS denies)", async () => {
      const { client } = makeBuilder(null, { message: "RLS" });
      await expect(
        createInviteRecord(
          client as unknown as SupabaseClient,
          "trip-1",
          null,
          null
        )
      ).rejects.toThrow(/createInviteRecord/);
    });
  });
});
