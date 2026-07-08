/**
 * Tests for lib/db/profiles.ts — getProfile reader (W2c, #233).
 *
 * Asserts:
 *   - selects explicit columns `id, has_password` (no select('*'))
 *   - returns null on PGRST116 (no rows)
 *   - throws on other Supabase errors
 *   - returned shape contains `id` and `has_password`
 *
 * Placement: lib/db/__tests__/ per Override C.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getProfile, setProfileDisplayNameIfEmpty } from "../profiles";

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function makeBuilder(result: { data: unknown; error: unknown }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const thenable: PromiseLike<typeof result> = {
    then(onfulfilled) {
      return Promise.resolve(result).then(onfulfilled);
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

// ---------------------------------------------------------------------------
// getProfile — column selection
// ---------------------------------------------------------------------------

describe("getProfile — column selection", () => {
  it("selects explicit columns 'id, has_password' (not *)", async () => {
    const { calls, client } = makeBuilder({
      data: { id: "user-1", has_password: true },
      error: null,
    });

    await getProfile(client as unknown as SupabaseClient, "user-1");

    const selectCall = calls.find((c) => c.method === "select");
    expect(selectCall).toBeDefined();
    const selectArg = String(selectCall?.args[0]);
    expect(selectArg).toContain("id");
    expect(selectArg).toContain("has_password");
    // Must not use wildcard select
    expect(selectArg).not.toBe("*");
  });

  it("queries the 'profiles' table", async () => {
    const { client } = makeBuilder({
      data: { id: "user-1", has_password: false },
      error: null,
    });

    await getProfile(client as unknown as SupabaseClient, "user-1");

    expect(client.from).toHaveBeenCalledWith("profiles");
  });
});

// ---------------------------------------------------------------------------
// getProfile — return values
// ---------------------------------------------------------------------------

describe("getProfile — return values", () => {
  it("returns the profile row when found (has_password=true)", async () => {
    const { client } = makeBuilder({
      data: { id: "user-1", has_password: true },
      error: null,
    });

    const result = await getProfile(client as unknown as SupabaseClient, "user-1");

    expect(result).toEqual({ id: "user-1", has_password: true });
  });

  it("returns the profile row when found (has_password=false)", async () => {
    const { client } = makeBuilder({
      data: { id: "user-2", has_password: false },
      error: null,
    });

    const result = await getProfile(client as unknown as SupabaseClient, "user-2");

    expect(result).toEqual({ id: "user-2", has_password: false });
  });

  it("returns null when PGRST116 (no rows found)", async () => {
    const { client } = makeBuilder({
      data: null,
      error: { code: "PGRST116", message: "The result contains 0 rows" },
    });

    const result = await getProfile(client as unknown as SupabaseClient, "nonexistent");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getProfile — error handling
// ---------------------------------------------------------------------------

describe("getProfile — error handling", () => {
  it("throws on unexpected Supabase error (not PGRST116)", async () => {
    const { client } = makeBuilder({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(
      getProfile(client as unknown as SupabaseClient, "user-1")
    ).rejects.toThrow();
  });

  it("does not throw and returns null when error.code is exactly PGRST116", async () => {
    const { client } = makeBuilder({
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });

    await expect(
      getProfile(client as unknown as SupabaseClient, "user-1")
    ).resolves.toBeNull();
  });
});

// #348: durable-identity backfill — only fills a NULL profile name
describe("setProfileDisplayNameIfEmpty", () => {
  it("updates display_name filtered to id AND display_name IS NULL", async () => {
    const { calls, client } = makeBuilder({ data: null, error: null });
    await setProfileDisplayNameIfEmpty(client as never, "user-1", "Nate");
    const update = calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ display_name: "Nate" });
    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["id", "user-1"]);
    const isCall = calls.find((c) => c.method === "is");
    expect(isCall?.args).toEqual(["display_name", null]);
  });
});
