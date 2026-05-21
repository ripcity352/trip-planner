/**
 * Tests for the /account/sign-in-and-security form state machine and
 * action wiring (M5/PR4).
 *
 * Covers:
 *   - `deriveIdentityState`: identity-state detection from User.identities
 *   - `deriveFormInlineError`: inline error derivation per form state
 *   - Form rendering (State A, A+, stub for !hasPassword)
 *   - State C state transitions (C-request → C-verify → C-set → success)
 *   - Cancel from State C returns to State A
 *
 * External dependencies (Supabase, server actions) are mocked.
 *
 * Placement: tests/unit/ per Override C (never under app/).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- action mocks (must be before dynamic imports) --------------------------

const mockChangePasswordAction = vi.fn();
const mockSetPasswordAfterRecoveryAction = vi.fn();

vi.mock(
  "@/app/(authed)/account/sign-in-and-security/actions",
  () => ({
    changePasswordAction: (...args: unknown[]) => mockChangePasswordAction(...args),
    setPasswordAfterRecoveryAction: (...args: unknown[]) =>
      mockSetPasswordAfterRecoveryAction(...args),
  })
);

// Login actions (requestEmailCode, verifyEmailCodeAction) used in State C
const mockRequestEmailCode = vi.fn();
const mockVerifyEmailCodeAction = vi.fn();

vi.mock("@/app/login/actions", () => ({
  requestEmailCode: (...args: unknown[]) => mockRequestEmailCode(...args),
  verifyEmailCodeAction: (...args: unknown[]) => mockVerifyEmailCodeAction(...args),
}));

// Import AFTER mocks
import {
  deriveIdentityState,
  type IdentityState,
} from "@/app/(authed)/account/sign-in-and-security/_form-state";
import { SecurityForm } from "@/app/(authed)/account/sign-in-and-security/_form";

// ---------------------------------------------------------------------------
// deriveIdentityState
// ---------------------------------------------------------------------------

describe("deriveIdentityState", () => {
  it("returns 'A' when user has email identity only", () => {
    const user = {
      identities: [{ provider: "email", id: "1" }],
    };
    expect(deriveIdentityState(user as Parameters<typeof deriveIdentityState>[0])).toBe("A");
  });

  it("returns 'A+' when user has both email and OAuth identity", () => {
    const user = {
      identities: [
        { provider: "email", id: "1" },
        { provider: "google", id: "2" },
      ],
    };
    expect(deriveIdentityState(user as Parameters<typeof deriveIdentityState>[0])).toBe("A+");
  });

  it("returns 'no-password' when user has OAuth identity only (no email)", () => {
    const user = {
      identities: [{ provider: "google", id: "1" }],
    };
    expect(deriveIdentityState(user as Parameters<typeof deriveIdentityState>[0])).toBe(
      "no-password"
    );
  });

  it("returns 'no-password' when identities is empty", () => {
    const user = { identities: [] };
    expect(deriveIdentityState(user as Parameters<typeof deriveIdentityState>[0])).toBe(
      "no-password"
    );
  });

  it("returns 'no-password' when identities is undefined", () => {
    const user = { identities: undefined };
    expect(deriveIdentityState(user as Parameters<typeof deriveIdentityState>[0])).toBe(
      "no-password"
    );
  });
});

// ---------------------------------------------------------------------------
// SecurityForm rendering
// ---------------------------------------------------------------------------

describe("SecurityForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseProps = {
    identityState: "A" as IdentityState,
    userEmail: "dave@example.com",
  };

  // -------------------------------------------------------------------------
  // State A: password-only user
  // -------------------------------------------------------------------------

  it("renders the page title from copy palette", () => {
    render(<SecurityForm {...baseProps} />);
    // The title from AUTH_COPY.accountSecurity_title
    expect(screen.getByText("Sign-in & security")).toBeDefined();
  });

  it("renders current-password and new-password fields for State A", () => {
    render(<SecurityForm {...baseProps} />);
    expect(screen.getByLabelText(/current password/i)).toBeDefined();
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
  });

  it("renders the 'forgot current password' link for State A", () => {
    render(<SecurityForm {...baseProps} />);
    expect(screen.getByText(/forgot.*password/i)).toBeDefined();
  });

  it("shows A+ helper copy when identityState is 'A+'", () => {
    render(<SecurityForm {...baseProps} identityState="A+" />);
    // A+ helper mentions Google sign-in
    const helperEl = screen.getByText(/google/i);
    expect(helperEl).toBeDefined();
  });

  it("does NOT show A+ helper copy when identityState is 'A'", () => {
    render(<SecurityForm {...baseProps} identityState="A" />);
    // Should not render the A+ Google helper
    expect(screen.queryByText(/google/i)).toBeNull();
  });

  it("renders the no-password stub when identityState is 'no-password'", () => {
    render(<SecurityForm {...baseProps} identityState="no-password" />);
    // Stub copy from AUTH_COPY.accountSecurity_noPasswordStub
    expect(screen.getByText(/coming soon/i)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // State A: happy-path submission
  // -------------------------------------------------------------------------

  it("calls changePasswordAction with currentPassword and newPassword on submit", async () => {
    mockChangePasswordAction.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);

    const currentInput = screen.getByLabelText(/current password/i);
    const newInput = screen.getByLabelText(/new password/i);

    fireEvent.change(currentInput, { target: { value: "myoldpass" } });
    fireEvent.change(newInput, { target: { value: "mynewpass123" } });

    const submitBtn = screen.getByRole("button", { name: /update password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockChangePasswordAction).toHaveBeenCalledWith({
        currentPassword: "myoldpass",
        newPassword: "mynewpass123",
      });
    });
  });

  it("does NOT include an email field in the form payload to changePasswordAction", async () => {
    // Email-pinning enforcement: the form must NOT submit an email field.
    // The action pins the email from the server-side session.
    mockChangePasswordAction.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);

    const currentInput = screen.getByLabelText(/current password/i);
    const newInput = screen.getByLabelText(/new password/i);

    fireEvent.change(currentInput, { target: { value: "myoldpass" } });
    fireEvent.change(newInput, { target: { value: "mynewpass123" } });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      const callArg = mockChangePasswordAction.mock.calls[0]?.[0];
      // The action call must NOT have an 'email' property.
      expect(callArg).not.toHaveProperty("email");
    });
  });

  it("shows success toast text after successful password change", async () => {
    mockChangePasswordAction.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "myoldpass" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      // AUTH_COPY.accountSecurity_successToast
      expect(screen.getByText(/other devices were signed out/i)).toBeDefined();
    });
  });

  it("shows error message on auth_current_password_incorrect", async () => {
    mockChangePasswordAction.mockResolvedValue({
      ok: false,
      errorKey: "auth_current_password_incorrect",
    });

    render(<SecurityForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      // ERRORS.auth_current_password_incorrect (H7-locked)
      expect(
        screen.getByText(/that's not the current password/i)
      ).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // State C: OTP recovery sub-flow
  // -------------------------------------------------------------------------

  it("transitions to State C-request when 'forgot' link is clicked", async () => {
    // Mock returns a pending-then-ok so the component transitions away from C-requesting
    mockRequestEmailCode.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);

    fireEvent.click(screen.getByText(/forgot.*password/i));

    // requestEmailCode should be called with the user's email
    await waitFor(() => {
      expect(mockRequestEmailCode).toHaveBeenCalledWith("dave@example.com");
    });
  });

  it("shows the code-entry step after requestEmailCode succeeds", async () => {
    mockRequestEmailCode.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);
    fireEvent.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => {
      // Should show the code field label from AUTH_COPY.accountSecurity_codeFieldLabel
      expect(screen.getByLabelText(/6-digit code/i)).toBeDefined();
    });
  });

  it("transitions to State C-set (new password step) after OTP verification", async () => {
    mockRequestEmailCode.mockResolvedValue({ ok: true });
    mockVerifyEmailCodeAction.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);
    fireEvent.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));

    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      // Should show the new-password field (without a current-password field)
      expect(screen.getByLabelText(/new password/i)).toBeDefined();
    });
  });

  it("calls setPasswordAfterRecoveryAction (not changePasswordAction) in State C-set", async () => {
    mockRequestEmailCode.mockResolvedValue({ ok: true });
    mockVerifyEmailCodeAction.mockResolvedValue({ ok: true });
    mockSetPasswordAfterRecoveryAction.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);
    fireEvent.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));

    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => screen.getByLabelText(/new password/i));

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "brandnewpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mockSetPasswordAfterRecoveryAction).toHaveBeenCalledWith({
        newPassword: "brandnewpass",
      });
      expect(mockChangePasswordAction).not.toHaveBeenCalled();
    });
  });

  it("clicking 'cancel' in State C returns to State A without triggering any action", async () => {
    mockRequestEmailCode.mockResolvedValue({ ok: true });

    render(<SecurityForm {...baseProps} />);
    fireEvent.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));

    fireEvent.click(screen.getByText(/never mind/i));

    // Should return to State A — current-password field visible again
    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeDefined();
    });
    expect(mockChangePasswordAction).not.toHaveBeenCalled();
    expect(mockSetPasswordAfterRecoveryAction).not.toHaveBeenCalled();
  });

  it("shows error when OTP verification fails", async () => {
    mockRequestEmailCode.mockResolvedValue({ ok: true });
    mockVerifyEmailCodeAction.mockResolvedValue({
      ok: false,
      errorKey: "auth_code_invalid",
    });

    render(<SecurityForm {...baseProps} />);
    fireEvent.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));

    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      // ERRORS.auth_code_invalid
      expect(screen.getByText(/that code didn't take/i)).toBeDefined();
    });
  });
});
