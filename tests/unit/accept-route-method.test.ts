/**
 * Regression lock for #106 + #316 contract:
 *
 * Issue #316: A GET-navigable `next=` param must never point to this
 * route because it only handles POST. A GET to `/invite/[token]/accept`
 * returns a blank 405, which is what killed the original new-invitee
 * OTP flow.
 *
 * Issue #106 (W0c, M4): The GET handler was intentionally removed.
 * This test ensures it stays gone — if someone re-adds `export async
 * function GET(...)`, assertion (2) below will turn RED immediately.
 *
 * Non-vacuous POST check (Phase-4 fix): a GET→405 assertion alone
 * passes vacuously when the whole route file is deleted, because
 * Next.js 405s any method on a missing route. Asserting `POST` is a
 * real exported function makes the test fail if the route is deleted,
 * preventing the test from silently passing on a missing file.
 */

import { describe, it, expect, vi } from "vitest";

// Minimal mocks so the server-only route module loads under vitest.
// The same pattern used in tests/unit/invite-accept-route.test.ts.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn() },
  })),
}));

vi.mock("@/lib/actions/invites", () => ({
  acceptInviteAction: vi.fn(),
}));

import * as acceptRoute from "@/app/invite/[token]/accept/route";

describe("accept route — exported HTTP method contract (#106 / #316)", () => {
  // (1) POST must be an exported function.
  //     Fails if the route file is deleted (non-vacuous guard).
  it("exports POST as a callable function", () => {
    expect(typeof acceptRoute.POST).toBe("function");
  });

  // (2) GET must NOT be exported.
  //     Fails if someone re-adds `export async function GET(...)` (#106 regression).
  it("does NOT export GET — #316 contract: GET-navigable `next` must be the preview page, not this POST-only route", () => {
    expect((acceptRoute as Record<string, unknown>).GET).toBeUndefined();
  });

  // (3) Other mutating/unsafe verbs must also be absent — belt-and-suspenders.
  it("does NOT export PUT", () => {
    expect((acceptRoute as Record<string, unknown>).PUT).toBeUndefined();
  });

  it("does NOT export PATCH", () => {
    expect((acceptRoute as Record<string, unknown>).PATCH).toBeUndefined();
  });

  it("does NOT export DELETE", () => {
    expect((acceptRoute as Record<string, unknown>).DELETE).toBeUndefined();
  });
});
