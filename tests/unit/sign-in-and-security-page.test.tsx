/**
 * Tests for the /account/sign-in-and-security page — `has_password` state
 * derivation (W2c, closes #233).
 *
 * Root cause of #233: `deriveIdentityState()` in _form-state.ts checks
 * `identities.some(id => id.provider === "email")` but Supabase assigns
 * `provider: "email"` to OTP-signup users too, so OTP-only accounts were
 * mis-detected as having a password identity and rendered State A.
 *
 * Fix: the page reads `profiles.has_password` and passes the resolved
 * `identityState` to <SecurityForm> — bypassing the identities heuristic.
 *
 * These tests verify the correct `identityState` prop is passed to the form
 * under all relevant scenarios. Because the page is a Next.js Server Component
 * we test the observable output (which UI State renders) via SecurityForm
 * rendered with the identityState the page would derive.
 *
 * Override C: tests live under tests/unit/ only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// --- mocks (must be before dynamic imports) ---------------------------------

const mockGetProfile = vi.fn();

vi.mock("@/lib/db/profiles", () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
}));

const mockChangePasswordAction = vi.fn();
const mockSetPasswordViaRecoveryAction = vi.fn();
const mockSetPasswordAction = vi.fn();

vi.mock(
  "@/app/(authed)/account/sign-in-and-security/actions",
  () => ({
    changePasswordAction: (...args: unknown[]) => mockChangePasswordAction(...args),
    setPasswordViaRecoveryAction: (...args: unknown[]) =>
      mockSetPasswordViaRecoveryAction(...args),
    setPasswordAction: (...args: unknown[]) => mockSetPasswordAction(...args),
  })
);

const mockRequestEmailCode = vi.fn();
vi.mock("@/app/login/actions", () => ({
  requestEmailCode: (...args: unknown[]) => mockRequestEmailCode(...args),
}));

// Import AFTER mocks
import { SecurityForm } from "@/app/(authed)/account/sign-in-and-security/_form";
import { deriveStateFromHasPassword } from "@/app/(authed)/account/sign-in-and-security/_form-state";

// ---------------------------------------------------------------------------
// Helper alias: tests call deriveStateFromHasPassword (the real production
// helper from _form-state.ts) to derive the identityState the page passes
// to <SecurityForm>. No local mirror needed — we test the real helper.
// ---------------------------------------------------------------------------

// Re-export as a local alias to keep test call-sites readable.
const deriveStateFromProfile = deriveStateFromHasPassword;

// ---------------------------------------------------------------------------
// Scenario: has_password=true + email-only identity → State A
// ---------------------------------------------------------------------------

describe("Sign-in & security page — has_password=true → State A", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({ id: "user-1", has_password: true });
  });

  it("renders State A (current password field visible) when has_password=true", () => {
    const identityState = deriveStateFromProfile(true, false);
    render(<SecurityForm identityState={identityState} userEmail="dave@example.com" />);

    expect(screen.getByLabelText(/current password/i)).toBeDefined();
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
  });

  it("does NOT render State B set-password form when has_password=true", () => {
    const identityState = deriveStateFromProfile(true, false);
    render(<SecurityForm identityState={identityState} userEmail="dave@example.com" />);

    // State B has "Set password" button, not "Update password"
    expect(screen.queryByRole("button", { name: /set password/i })).toBeNull();
    expect(screen.getByRole("button", { name: /update password/i })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario: has_password=false + OTP-only identity → State B
// (This is the bug scenario: Supabase sets provider="email" for OTP users,
// so the old heuristic wrongly returned State A.)
// ---------------------------------------------------------------------------

describe("Sign-in & security page — has_password=false + OTP-only → State B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({ id: "user-2", has_password: false });
  });

  it("renders State B (set-password, no current-password field) for OTP-only user", () => {
    // has_password=false regardless of identities array containing provider="email"
    const identityState = deriveStateFromProfile(false, false);
    render(
      <SecurityForm
        identityState={identityState}
        userEmail="otp@example.com"
        identitySubtype="otp"
      />,
    );

    // State B: new-password field present, current-password field absent
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
  });

  it("renders 'Set password' button (not 'Update password') for OTP-only user", () => {
    const identityState = deriveStateFromProfile(false, false);
    render(
      <SecurityForm
        identityState={identityState}
        userEmail="otp@example.com"
        identitySubtype="otp"
      />,
    );

    expect(screen.getByRole("button", { name: /set password/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /update password/i })).toBeNull();
  });

  it("shows OTP-subtype helper copy (mentions 'code') for OTP-only user", () => {
    const identityState = deriveStateFromProfile(false, false);
    render(
      <SecurityForm
        identityState={identityState}
        userEmail="otp@example.com"
        identitySubtype="otp"
      />,
    );

    expect(screen.getByText(/code/i)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario: has_password=false + OAuth-only identity → State B (variant copy)
// ---------------------------------------------------------------------------

describe("Sign-in & security page — has_password=false + OAuth-only → State B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({ id: "user-3", has_password: false });
  });

  it("renders State B for OAuth-only user (no current-password field)", () => {
    // OAuth-only: has no password, hasOAuth=true → no-password state
    const identityState = deriveStateFromProfile(false, true);
    render(
      <SecurityForm
        identityState={identityState}
        userEmail="oauth@example.com"
        identitySubtype="oauth"
      />,
    );

    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
  });

  it("shows OAuth-subtype helper copy (mentions 'Google') for OAuth-only user", () => {
    const identityState = deriveStateFromProfile(false, true);
    render(
      <SecurityForm
        identityState={identityState}
        userEmail="oauth@example.com"
        identitySubtype="oauth"
      />,
    );

    expect(screen.getByText(/google/i)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario: State C (recovery) behavior unchanged
// State C is entered from State A via the "forgot" link — not affected by
// has_password. We verify State C is still reachable when has_password=true.
// ---------------------------------------------------------------------------

describe("Sign-in & security page — State C path unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({ id: "user-1", has_password: true });
    mockRequestEmailCode.mockResolvedValue({ ok: true });
  });

  it("forgot-password link is present in State A (has_password=true)", () => {
    const identityState = deriveStateFromProfile(true, false);
    render(<SecurityForm identityState={identityState} userEmail="dave@example.com" />);

    expect(screen.getByText(/forgot.*password/i)).toBeDefined();
  });

  it("State C is NOT reachable from State B (no forgot-password link)", () => {
    // OTP-only user: has_password=false → State B — no forgot link
    const identityState = deriveStateFromProfile(false, false);
    render(
      <SecurityForm
        identityState={identityState}
        userEmail="otp@example.com"
        identitySubtype="otp"
      />,
    );

    // State B has no "forgot current password" link since there is no current password
    expect(screen.queryByText(/forgot.*password/i)).toBeNull();
  });
});
