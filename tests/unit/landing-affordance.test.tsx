/**
 * Unit tests for the landing invite affordance (#263).
 *
 * Strategy: app/page.tsx is an async Server Component that calls
 * supabase.auth.getUser() — rendering it in jsdom requires mocking
 * the Supabase SSR client, which would force either a heavy mock setup
 * or a refactor to extract a sub-component. Per the task spec, we do
 * neither. Instead we test:
 *
 *   1. The copy key is present in AUTH_COPY and contains no banned
 *      account language ("sign up", "create account", "get started",
 *      "register") — D5 voice-lock.
 *   2. app/page.tsx sources AUTH_COPY (import present) and does not
 *      inline the string as a literal — Override F.
 *
 * The 375px smoke (orchestrator) verifies the render end-to-end.
 *
 * Override C: tests live under tests/ only — never under app/.
 * Override F: no inline string literals — copy sourced from AUTH_COPY.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import { AUTH_COPY } from "@/lib/copy/auth";

describe("AUTH_COPY.landingInviteAffordance — copy key (#263)", () => {
  it("key exists and is a non-empty string", () => {
    expect(typeof AUTH_COPY.landingInviteAffordance).toBe("string");
    expect(AUTH_COPY.landingInviteAffordance.trim().length).toBeGreaterThan(0);
  });

  it("voice-locked to the W0-seeded value", () => {
    expect(AUTH_COPY.landingInviteAffordance).toBe(
      "Got a link from a friend? Tap it — that's your way in."
    );
  });

  it("contains no banned account language", () => {
    const value = AUTH_COPY.landingInviteAffordance.toLowerCase();
    expect(value, "must not say 'sign up'").not.toMatch(/\bsign up\b/);
    expect(value, "must not say 'create account'").not.toContain(
      "create account"
    );
    expect(value, "must not say 'get started'").not.toContain("get started");
    expect(value, "must not say 'register'").not.toMatch(/\bregister\b/);
  });
});

describe("app/page.tsx — invite affordance wiring (#263)", () => {
  const pageSrc = readFileSync(
    resolve(process.cwd(), "app/page.tsx"),
    "utf-8"
  );

  it("imports AUTH_COPY from @/lib/copy/auth", () => {
    expect(pageSrc).toContain("AUTH_COPY");
    expect(pageSrc).toMatch(/from ['"]@\/lib\/copy\/auth['"]/);
  });

  it("references landingInviteAffordance (not an inline literal)", () => {
    expect(pageSrc).toContain("AUTH_COPY.landingInviteAffordance");
  });

  it("does not inline the affordance string as a literal", () => {
    // The actual string must not appear bare in JSX — it must come from the key.
    expect(pageSrc).not.toContain(
      "Got a link from a friend? Tap it"
    );
  });

  it("contains no banned account language", () => {
    const lower = pageSrc.toLowerCase();
    expect(lower, "must not say 'sign up'").not.toMatch(/\bsign up\b/);
    expect(lower, "must not say 'create account'").not.toContain(
      "create account"
    );
    expect(lower, "must not say 'get started'").not.toContain("get started");
    expect(lower, "must not say 'register'").not.toMatch(/\bregister\b/);
  });
});
