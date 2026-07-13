/**
 * Unit tests for the `/auth/callback` route handler (#433 item: the
 * failure bounce used to discard the safeNext-validated `next`).
 *
 * `resolveCallbackResult` (the verify logic) is mocked — its own
 * coverage lives in lib/auth/__tests__/callback.test.ts. These tests pin
 * the ROUTE's redirect construction:
 *   - success → origin + next
 *   - failure → /login?error=auth, carrying next when it's a real
 *     context (skipped when it's the default /trips, keeping URLs clean)
 *   - safeNext integration: a POST-only /invite/<t>/accept next is
 *     rewritten to its GET-safe parent before it reaches the bounce
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveCallbackResult = vi.fn();

vi.mock("@/lib/auth/callback-handler", () => ({
  resolveCallbackResult: (...args: unknown[]) =>
    mockResolveCallbackResult(...args),
}));

// Import AFTER mocks.
import { GET } from "@/app/auth/callback/route";

const ORIGIN = "https://travelston.com";

function makeRequest(query: string): Request {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to origin + next on success", async () => {
    mockResolveCallbackResult.mockResolvedValue({
      ok: true,
      next: "/invite/tok123",
    });

    const res = await GET(
      makeRequest(
        "?token=123456&email=d%40e.com&type=email&next=%2Finvite%2Ftok123"
      )
    );

    expect(res.headers.get("location")).toBe(`${ORIGIN}/invite/tok123`);
  });

  // #433 — the re-stranding fix: a failed verify keeps the invite context.
  it("carries the validated next through the failure bounce", async () => {
    mockResolveCallbackResult.mockResolvedValue({ ok: false });

    const res = await GET(
      makeRequest(
        "?token=000000&email=d%40e.com&type=email&next=%2Finvite%2Ftok123"
      )
    );

    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/login?error=auth&next=${encodeURIComponent("/invite/tok123")}`
    );
  });

  it("keeps the failure URL clean when next is the default /trips", async () => {
    mockResolveCallbackResult.mockResolvedValue({ ok: false });

    const res = await GET(
      makeRequest("?token=000000&email=d%40e.com&type=email&next=%2Ftrips")
    );

    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=auth`);
  });

  it("keeps the failure URL clean when next is absent", async () => {
    mockResolveCallbackResult.mockResolvedValue({ ok: false });

    const res = await GET(
      makeRequest("?token=000000&email=d%40e.com&type=email")
    );

    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=auth`);
  });

  it("never forwards an off-origin next, even on failure", async () => {
    mockResolveCallbackResult.mockResolvedValue({ ok: false });

    const res = await GET(
      makeRequest(
        "?token=000000&email=d%40e.com&type=email&next=%2F%2Fevil.com%2Fx"
      )
    );

    // safeNext collapses //evil.com/x to the default → clean bounce.
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=auth`);
  });

  // safeNext #433 rewrite integration: the POST-only accept path becomes
  // its GET-safe parent BEFORE it can be threaded anywhere.
  it("rewrites a POST-only invite-accept next to the GET-safe preview", async () => {
    mockResolveCallbackResult.mockResolvedValue({ ok: false });

    const res = await GET(
      makeRequest(
        "?token=000000&email=d%40e.com&type=email&next=%2Finvite%2Ftok123%2Faccept"
      )
    );

    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/login?error=auth&next=${encodeURIComponent("/invite/tok123")}`
    );
  });
});
