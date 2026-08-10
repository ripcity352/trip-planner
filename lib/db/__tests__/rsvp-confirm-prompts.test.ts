/**
 * Tests for `lib/db/rsvp-confirm-prompts.ts` (#549).
 *
 *   - getActivePromptForMember — the caller's own pending ask (feeds the
 *     dashboard confirm banner), with the sender's name embedded.
 *   - getPromptsByTrip — pending asks for a trip keyed by asked member
 *     (feeds the organizer roster "asked" cue).
 * RLS enforces the membership boundary in SQL; we assert shape + filters.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getActivePromptForMember,
  getPromptsByTrip,
} from "../rsvp-confirm-prompts";

function makeBuilder(rows: unknown, error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
    then(onfulfilled) {
      return Promise.resolve({ data: rows, error }).then(onfulfilled);
    },
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "then") return thenable.then.bind(thenable);
      if (prop === "maybeSingle") {
        return () => Promise.resolve({ data: rows, error });
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

describe("getActivePromptForMember", () => {
  it("filters by trip_member_id and embeds the sender name", async () => {
    const { calls, client } = makeBuilder({
      id: "p1",
      proposed_status: "going",
      note: "Rob texted",
      sent_by_trip_member_id: "org-1",
      sender: { display_name: "Dave" },
    });
    const result = await getActivePromptForMember(
      client as unknown as SupabaseClient,
      "tm-1"
    );
    expect(client.from).toHaveBeenCalledWith("rsvp_confirm_prompts");
    const eqCall = calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["trip_member_id", "tm-1"]);
    const selectCall = calls.find((c) => c.method === "select");
    expect(String(selectCall?.args[0])).toContain(
      "sent_by_trip_member_id"
    );
    expect(result).toEqual({
      id: "p1",
      proposedStatus: "going",
      note: "Rob texted",
      sentByTripMemberId: "org-1",
      senderName: "Dave",
    });
  });

  it("normalizes an array-shaped embed (PostgREST typing quirk) to a scalar name", async () => {
    const { client } = makeBuilder({
      id: "p1",
      proposed_status: "maybe",
      note: null,
      sent_by_trip_member_id: "org-1",
      sender: [{ display_name: "Dana" }],
    });
    const result = await getActivePromptForMember(
      client as unknown as SupabaseClient,
      "tm-1"
    );
    expect(result?.senderName).toBe("Dana");
  });

  it("returns null when there is no pending ask", async () => {
    const { client } = makeBuilder(null);
    const result = await getActivePromptForMember(
      client as unknown as SupabaseClient,
      "tm-1"
    );
    expect(result).toBeNull();
  });

  it("throws when Supabase reports an error", async () => {
    const { client } = makeBuilder(null, { message: "boom" });
    await expect(
      getActivePromptForMember(client as unknown as SupabaseClient, "tm-1")
    ).rejects.toThrow(/getActivePromptForMember/);
  });
});

describe("getPromptsByTrip", () => {
  it("returns a Map of asked member id → proposed status", async () => {
    const { calls, client } = makeBuilder([
      { trip_member_id: "tm-1", proposed_status: "going" },
      { trip_member_id: "tm-2", proposed_status: "declined" },
    ]);
    const result = await getPromptsByTrip(
      client as unknown as SupabaseClient,
      "trip-1"
    );
    const eqCall = calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["trip_id", "trip-1"]);
    expect(result.get("tm-1")).toBe("going");
    expect(result.get("tm-2")).toBe("declined");
    expect(result.size).toBe(2);
  });

  it("returns an empty Map when no asks exist", async () => {
    const { client } = makeBuilder(null);
    const result = await getPromptsByTrip(
      client as unknown as SupabaseClient,
      "trip-1"
    );
    expect(result.size).toBe(0);
  });
});
