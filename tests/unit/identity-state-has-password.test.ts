/**
 * D6 — State-B identity regression lock (prevents #233 replay).
 *
 * #233 root cause: the previous `deriveIdentityState()` in _form-state.ts
 * checked `identities.some(id => id.provider === "email")`, which returns
 * true for OTP-signup users (Supabase assigns provider="email" to them).
 * This caused OTP-only users (no password) to render State A — the
 * current-password form — which they can't complete.
 *
 * Fix (W0b): `deriveStateFromHasPassword(hasPassword, hasOAuth)` is now
 * the canonical exported helper in _form-state.ts. Both the page and this
 * test file import it directly — no local mirrors. If production regresses
 * (e.g. someone re-introduces the provider heuristic), these tests will
 * fail immediately.
 *
 * Override C: tests live under tests/unit/ only.
 */

import { describe, expect, it } from "vitest";
import { deriveStateFromHasPassword } from "@/app/(authed)/account/sign-in-and-security/_form-state";

// ---------------------------------------------------------------------------
// Core regression: OTP-only user (email identity, no password) → State B
// ---------------------------------------------------------------------------

describe("has_password derivation — OTP-only user (the #233 regression case)", () => {
  it("user with email identity AND has_password=false derives 'no-password' (State B)", () => {
    // This is the exact #233 bug scenario:
    // Supabase assigns provider="email" to OTP-signup users.
    // The OLD check (identities.some(id => id.provider === "email")) returned
    // TRUE here → State A (wrong).
    // The CORRECT check (has_password) returns FALSE here → "no-password" (State B).
    const hasPassword = false; // OTP-only — no password was ever set
    const hasOAuth = false;    // no Google or other OAuth identity
    expect(deriveStateFromHasPassword(hasPassword, hasOAuth)).toBe("no-password");
  });

  it("'no-password' (State B) is distinct from 'A' (State A) — must NOT be equal", () => {
    // Regression guard: if someone accidentally uses "A" as the fallback
    // instead of "no-password", this test catches it.
    const stateB = deriveStateFromHasPassword(false, false);
    const stateA = deriveStateFromHasPassword(true, false);
    expect(stateB).not.toBe(stateA);
    expect(stateB).toBe("no-password");
  });
});

// ---------------------------------------------------------------------------
// Normal cases
// ---------------------------------------------------------------------------

describe("has_password derivation — normal State A/A+ cases", () => {
  it("has_password=true + no OAuth → 'A'", () => {
    expect(deriveStateFromHasPassword(true, false)).toBe("A");
  });

  it("has_password=true + OAuth → 'A+'", () => {
    expect(deriveStateFromHasPassword(true, true)).toBe("A+");
  });

  it("has_password=false + OAuth → 'no-password' (OAuth-only user, State B variant)", () => {
    // OAuth-only users also see State B — they need to ADD a password,
    // not change an existing one.
    expect(deriveStateFromHasPassword(false, true)).toBe("no-password");
  });
});

// ---------------------------------------------------------------------------
// Bug-documentation test: why the OLD provider check was wrong
// ---------------------------------------------------------------------------

describe("provider-based check — documents why it was wrong for #233", () => {
  it("DOCUMENTS THE BUG: identities.some(provider==='email') returns true for OTP users", () => {
    // OTP-signup users get provider="email" from Supabase. The old check
    // treated this as "has a password identity" — which is WRONG.
    // This test documents the bug without fixing deriveIdentityState (which
    // is dead code on the fixed page.tsx path). Do NOT change this to a
    // passing assertion about the correct behavior — the point is to
    // document what the old check did wrong.
    const otpUserIdentities = [{ provider: "email" as const, id: "id-1" }];
    const buggyResult = otpUserIdentities.some((id) => id.provider === "email");
    // The old check returns TRUE (incorrectly signals "has password")
    expect(buggyResult).toBe(true);
    // But the correct answer (has_password shadow column) is FALSE
    const correctHasPassword = false; // the shadow column for an OTP-only user
    expect(correctHasPassword).toBe(false);
    // These disagree — that's the bug.
    expect(buggyResult).not.toBe(correctHasPassword);
  });
});
