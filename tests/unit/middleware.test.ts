/**
 * Unit tests for middleware.ts (M5/PR4).
 *
 * Covers:
 *   C3 (Phase 4 audit): regression guard that /trips/* routes still redirect
 *   anon users to /login?next=... after adding /account to AUTHED_PREFIXES.
 *
 *   Also verifies:
 *   - /account/* routes redirect anon users to /login?next=...
 *   - /login and /auth routes are never redirected (not authed prefixes)
 *   - authenticated users pass through both /trips/* and /account/*
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// --- Supabase mock -----------------------------------------------------------

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn((req: NextRequest) => NextResponse.next({ request: req })),
}));

// Rate-limit mock: always pass through for middleware tests
vi.mock("@/lib/rate-limit", () => ({
  rateLimitRequest: vi.fn(() => Promise.resolve(null)),
  getClientId: vi.fn(() => "127.0.0.1"),
  RATE_LIMIT_SCOPES: {
    AUTH_OTP_VERIFY: "authOtpVerify",
    AUTH_PASSWORD: "authPassword",
    AUTH_CHANGE_PASSWORD: "authChangePassword",
  },
  FAIL_CLOSED_ON_SHIM: new Set(),
  SCOPE_BUDGETS: {},
  RateLimitError: class RateLimitError extends Error {
    constructor(scope: string) {
      super(`Rate limit exceeded for scope "${scope}"`);
    }
  },
  rateLimitedAction: vi.fn(
    async <T>(_scope: unknown, _key: unknown, fn: () => Promise<T>) => fn()
  ),
}));

// Import AFTER mocks
import { middleware } from "@/middleware";

// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

describe("middleware — authed route guard (C3 regression guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // /trips/* regression guard (C3 audit requirement)
  // -------------------------------------------------------------------------

  it("redirects anon users from /trips/some-id to /login?next=... (C3)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/trips/some-id");
    const response = await middleware(req);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("next=");
    expect(decodeURIComponent(location ?? "")).toContain("/trips/some-id");
  });

  it("redirects anon users from /trips (no trailing slash) to /login (C3)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/trips");
    const response = await middleware(req);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
  });

  it("preserves query string in ?next= for /trips routes (C3)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/trips/slug-123?tab=crew");
    const response = await middleware(req);

    const location = response.headers.get("location") ?? "";
    expect(decodeURIComponent(location)).toContain("/trips/slug-123?tab=crew");
  });

  it("allows authenticated users through /trips/* (C3 no false-positive)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dave@example.com" } },
    });

    const req = makeRequest("/trips/some-id");
    const response = await middleware(req);

    // Should NOT be a redirect
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(301);
  });

  // -------------------------------------------------------------------------
  // #433: x-pathname stamp for the (authed) layout's defensive guard
  // -------------------------------------------------------------------------

  it("stamps x-pathname (path + query) on authed-route requests (#433)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dave@example.com" } },
    });

    const req = makeRequest("/trips/slug-123?tab=crew");
    await middleware(req);

    expect(req.headers.get("x-pathname")).toBe("/trips/slug-123?tab=crew");
  });

  it("overwrites a client-supplied x-pathname header (#433 anti-spoof)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dave@example.com" } },
    });

    const req = new NextRequest("http://localhost/trips/slug-123", {
      headers: { "x-pathname": "/spoofed" },
    });
    await middleware(req);

    expect(req.headers.get("x-pathname")).toBe("/trips/slug-123");
  });

  // -------------------------------------------------------------------------
  // /account/* (new in PR4)
  // -------------------------------------------------------------------------

  it("redirects anon users from /account/sign-in-and-security to /login?next=...", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/account/sign-in-and-security");
    const response = await middleware(req);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("next=");
    expect(decodeURIComponent(location ?? "")).toContain(
      "/account/sign-in-and-security"
    );
  });

  it("allows authenticated users through /account/*", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dave@example.com" } },
    });

    const req = makeRequest("/account/sign-in-and-security");
    const response = await middleware(req);

    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(301);
  });

  // -------------------------------------------------------------------------
  // Public routes: no redirect, no auth check
  // -------------------------------------------------------------------------

  it("does NOT redirect /login (public route — would cause redirect loop)", async () => {
    // getUser should not be called for public routes
    const req = makeRequest("/login");
    const response = await middleware(req);

    expect(response.status).not.toBe(307);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("does NOT redirect /auth/callback", async () => {
    const req = makeRequest("/auth/callback");
    const response = await middleware(req);

    expect(response.status).not.toBe(307);
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AUTHED_PREFIXES shape guard
// ---------------------------------------------------------------------------

describe("middleware — AUTHED_PREFIXES includes both /trips and /account", () => {
  it("middleware file source contains both /trips and /account in AUTHED_PREFIXES", async () => {
    // Read the middleware source directly to assert on AUTHED_PREFIXES.
    // This avoids white-boxing the implementation while still catching a
    // regression where /trips or /account gets removed from the list.
    // Use process.cwd() which Vitest sets to the project root.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const middlewarePath = join(process.cwd(), "middleware.ts");
    const source = readFileSync(middlewarePath, "utf8");
    expect(source).toContain('"/trips"');
    expect(source).toContain('"/account"');
  });
});
