/**
 * Tests for `lib/supabase/realtime-auth.ts` (#349).
 *
 * supabase-js 2.108 only propagates SIGNED_IN / TOKEN_REFRESHED to
 * `realtime.setAuth()` — never INITIAL_SESSION — so every fresh-page-load
 * subscription joins its channel with anon JWT claims, and the
 * `TO authenticated` RLS on the subscribed tables silently filters every
 * `postgres_changes` frame (channel still reports SUBSCRIBED).
 *
 * `ensureRealtimeAuth` closes the gap. Contract:
 *
 *   1. Awaits a no-arg `realtime.setAuth()` so the next channel join
 *      carries the session token (the no-arg form pulls through the
 *      client's accessToken callback — a manual token would pin and
 *      disable refresh propagation).
 *   2. Registers a one-time INITIAL_SESSION listener per client so a
 *      late-arriving session upgrades already-joined channels.
 *   3. Never throws — a failed token upgrade must not block the
 *      subscription itself (fail-open to the pre-fix behavior).
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";

type AuthChangeCallback = (event: string) => void;

interface FakeClient {
  auth: { onAuthStateChange: ReturnType<typeof vi.fn> };
  realtime: { setAuth: ReturnType<typeof vi.fn> };
  /** The callback captured from onAuthStateChange, if registered. */
  capturedCallback: AuthChangeCallback | null;
}

function buildFakeClient(): FakeClient {
  const fake: FakeClient = {
    capturedCallback: null,
    auth: {
      onAuthStateChange: vi.fn((cb: AuthChangeCallback) => {
        fake.capturedCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    realtime: { setAuth: vi.fn(async () => {}) },
  };
  return fake;
}

/** Cast helper — the fake covers exactly the surface the helper touches. */
function asClient(fake: FakeClient): SupabaseClient {
  return fake as unknown as SupabaseClient;
}

describe("ensureRealtimeAuth (#349)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("awaits realtime.setAuth() with no arguments", async () => {
    const fake = buildFakeClient();
    await ensureRealtimeAuth(asClient(fake));
    expect(fake.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(fake.realtime.setAuth).toHaveBeenCalledWith();
  });

  it("registers the INITIAL_SESSION listener exactly once per client", async () => {
    const fake = buildFakeClient();
    const client = asClient(fake);
    await ensureRealtimeAuth(client);
    await ensureRealtimeAuth(client);
    await ensureRealtimeAuth(client);
    // setAuth re-runs per call (each subscribe site wants a fresh token)…
    expect(fake.realtime.setAuth).toHaveBeenCalledTimes(3);
    // …but the auth listener is wired once — no leaked subscriptions.
    expect(fake.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("wires each distinct client independently", async () => {
    const fakeA = buildFakeClient();
    const fakeB = buildFakeClient();
    await ensureRealtimeAuth(asClient(fakeA));
    await ensureRealtimeAuth(asClient(fakeB));
    expect(fakeA.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(fakeB.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("re-runs setAuth when INITIAL_SESSION fires", async () => {
    const fake = buildFakeClient();
    await ensureRealtimeAuth(asClient(fake));
    expect(fake.realtime.setAuth).toHaveBeenCalledTimes(1);

    fake.capturedCallback?.("INITIAL_SESSION");
    expect(fake.realtime.setAuth).toHaveBeenCalledTimes(2);
  });

  it("does NOT re-run setAuth for events supabase-js already handles", async () => {
    // SIGNED_IN / TOKEN_REFRESHED already reach realtime.setAuth through
    // supabase-js's own _handleTokenChanged — doubling up here would be
    // redundant churn. Only the INITIAL_SESSION hole needs plugging.
    const fake = buildFakeClient();
    await ensureRealtimeAuth(asClient(fake));
    expect(fake.realtime.setAuth).toHaveBeenCalledTimes(1);

    fake.capturedCallback?.("SIGNED_IN");
    fake.capturedCallback?.("TOKEN_REFRESHED");
    fake.capturedCallback?.("SIGNED_OUT");
    expect(fake.realtime.setAuth).toHaveBeenCalledTimes(1);
  });

  it("resolves without throwing when setAuth rejects", async () => {
    const fake = buildFakeClient();
    fake.realtime.setAuth.mockRejectedValueOnce(new Error("ws down"));
    await expect(
      ensureRealtimeAuth(asClient(fake))
    ).resolves.toBeUndefined();
  });
});
