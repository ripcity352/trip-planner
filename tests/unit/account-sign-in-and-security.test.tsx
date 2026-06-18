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
 *
 * Submit-clicks use `clickAndSettle` (tests/fixtures/dom.ts) where the
 * button remains in DOM after the action, or `userEvent.click` + waitFor
 * where a mode-change unmounts the button — fixes the async-submit flake
 * class (#230, #207).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- action mocks (must be before dynamic imports) --------------------------

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

// Login actions used in State C step 1 (request OTP).
// Note: verifyEmailCodeAction is NOT used by the form anymore — State C step 2
// stores the code client-side and submits it atomically with the new password
// to setPasswordViaRecoveryAction (M5/PR4 HIGH-1 fix).
const mockRequestEmailCode = vi.fn();

vi.mock("@/app/login/actions", () => ({
  requestEmailCode: (...args: unknown[]) => mockRequestEmailCode(...args),
}));

// Import AFTER mocks
import {
  deriveStateFromHasPassword,
  type IdentityState,
} from "@/app/(authed)/account/sign-in-and-security/_form-state";
import { SecurityForm } from "@/app/(authed)/account/sign-in-and-security/_form";
import { clickAndSettle } from "@/tests/fixtures/dom";

// Delay injected into action mocks to widen the race window deterministically.
// Per-test local constant — not a shared seam.
const MOCK_DELAY_MS = 30;

/**
 * Wait for a button to become enabled (not disabled).
 *
 * Used after async transitions that leave isPending=true while the new view
 * renders (e.g. "forgot" → C-verify appears, but isPending still true until
 * the requestEmailCode callback fully returns). Without this wait, fireEvent
 * on a disabled button is a no-op.
 */
async function waitForEnabled(el: HTMLElement): Promise<void> {
  await waitFor(() => {
    expect((el as HTMLButtonElement).disabled).toBe(false);
  });
}

// ---------------------------------------------------------------------------
// deriveStateFromHasPassword
// ---------------------------------------------------------------------------

describe("deriveStateFromHasPassword", () => {
  it("returns 'A' when has_password=true and no OAuth", () => {
    expect(deriveStateFromHasPassword(true, false)).toBe("A");
  });

  it("returns 'A+' when has_password=true and hasOAuth=true", () => {
    expect(deriveStateFromHasPassword(true, true)).toBe("A+");
  });

  it("returns 'no-password' when has_password=false and no OAuth (OTP-only, #233 case)", () => {
    // This is the exact regression scenario: OTP-only user has no password.
    // The old provider-based check returned "A" here — this locks State B.
    expect(deriveStateFromHasPassword(false, false)).toBe("no-password");
  });

  it("returns 'no-password' when has_password=false and hasOAuth=true (OAuth-only)", () => {
    // OAuth-only user also has no password — must render State B, not State A.
    expect(deriveStateFromHasPassword(false, true)).toBe("no-password");
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

  it("renders the State B form (not the stub) when identityState is 'no-password'", () => {
    render(<SecurityForm {...baseProps} identityState="no-password" />);
    // State B shows the set-password form, not "coming soon"
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    // Should show the new-password field
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // State A: happy-path submission
  // -------------------------------------------------------------------------

  it("calls changePasswordAction with currentPassword and newPassword on submit", async () => {
    // On success, mode transitions to "success" — button unmounts.
    // Use userEvent.click + waitFor on the resulting DOM state.
    mockChangePasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);

    const currentInput = screen.getByLabelText(/current password/i);
    const newInput = screen.getByLabelText(/new password/i);

    fireEvent.change(currentInput, { target: { value: "myoldpass" } });
    fireEvent.change(newInput, { target: { value: "mynewpass123" } });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /update password/i }));

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
    mockChangePasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);

    const currentInput = screen.getByLabelText(/current password/i);
    const newInput = screen.getByLabelText(/new password/i);

    fireEvent.change(currentInput, { target: { value: "myoldpass" } });
    fireEvent.change(newInput, { target: { value: "mynewpass123" } });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      const callArg = mockChangePasswordAction.mock.calls[0]?.[0];
      // The action call must NOT have an 'email' property.
      expect(callArg).not.toHaveProperty("email");
    });
  });

  it("shows success toast text after successful password change", async () => {
    // On success, mode transitions to "success" — button unmounts.
    mockChangePasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "myoldpass" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      // AUTH_COPY.accountSecurity_successToast
      expect(screen.getByText(/other devices were signed out/i)).toBeDefined();
    });
  });

  it("shows error message on auth_current_password_incorrect", async () => {
    // On error, button stays in DOM and re-enables — clickAndSettle works.
    mockChangePasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "auth_current_password_incorrect" };
    });

    render(<SecurityForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    const submitBtn = screen.getByRole("button", { name: /update password/i });
    await clickAndSettle(submitBtn);

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
    // 'forgot' click triggers handleForgotCurrentPassword — async, causes mode
    // change (C-requesting → C-verify) so button unmounts. Use userEvent + waitFor.
    mockRequestEmailCode.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);

    const user = userEvent.setup();
    await user.click(screen.getByText(/forgot.*password/i));

    // requestEmailCode should be called with the user's email
    await waitFor(() => {
      expect(mockRequestEmailCode).toHaveBeenCalledWith("dave@example.com");
    });
  });

  it("shows the code-entry step after requestEmailCode succeeds", async () => {
    mockRequestEmailCode.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => {
      // Should show the code field label from AUTH_COPY.accountSecurity_codeFieldLabel
      expect(screen.getByLabelText(/6-digit code/i)).toBeDefined();
    });
  });

  it("transitions to State C-set (new password step) after the user submits the OTP — client-side only, no server call", async () => {
    mockRequestEmailCode.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));
    // Verify button is disabled={isPending} while forgot transition is in flight.
    // Wait for it to re-enable before clicking.
    const verifyBtn = screen.getByRole("button", { name: /verify/i });
    await waitForEnabled(verifyBtn);

    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    // handleVerifyCode is synchronous (no startTransition) — fireEvent is fine.
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      // Should show the new-password field (without a current-password field)
      expect(screen.getByLabelText(/new password/i)).toBeDefined();
    });
    // The verify step is purely client-side now — no recovery action fires
    // until the user submits both the token AND the new password atomically.
    expect(mockSetPasswordViaRecoveryAction).not.toHaveBeenCalled();
  });

  it("calls setPasswordViaRecoveryAction with BOTH the stored token AND newPassword (atomic submit)", async () => {
    mockRequestEmailCode.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    // On success, mode transitions to "success" — button unmounts.
    mockSetPasswordViaRecoveryAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));
    // Verify button is disabled={isPending} while forgot transition is in flight.
    const verifyBtn = screen.getByRole("button", { name: /verify/i });
    await waitForEnabled(verifyBtn);

    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "654321" },
    });
    // handleVerifyCode is synchronous — fireEvent is fine.
    fireEvent.click(verifyBtn);

    await waitFor(() => screen.getByLabelText(/new password/i));

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "brandnewpass" },
    });
    // On success, button unmounts — use userEvent + waitFor on result.
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mockSetPasswordViaRecoveryAction).toHaveBeenCalledWith({
        token: "654321",
        newPassword: "brandnewpass",
      });
      expect(mockChangePasswordAction).not.toHaveBeenCalled();
    });
  });

  it("clicking 'cancel' in State C returns to State A without triggering any action", async () => {
    mockRequestEmailCode.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...baseProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));

    // The cancel button is disabled={isPending} while the forgot transition is in
    // flight. Wait for it to re-enable before clicking — handles the race between
    // waitFor(codeField) returning and the transition callback fully completing.
    await waitFor(() => {
      expect((screen.getByText(/never mind/i) as HTMLButtonElement).disabled).toBe(false);
    });
    // 'cancel' (handleCancel) is synchronous once the button is enabled.
    fireEvent.click(screen.getByText(/never mind/i));

    // Should return to State A — current-password field visible again
    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeDefined();
    });
    expect(mockChangePasswordAction).not.toHaveBeenCalled();
    expect(mockSetPasswordViaRecoveryAction).not.toHaveBeenCalled();
  });

  it("bounces back to C-verify and shows auth_code_invalid when the server rejects the OTP", async () => {
    mockRequestEmailCode.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    // On auth_code_invalid, mode bounces back to C-verify — button unmounts.
    mockSetPasswordViaRecoveryAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "auth_code_invalid" };
    });

    render(<SecurityForm {...baseProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByText(/forgot.*password/i));

    await waitFor(() => screen.getByLabelText(/6-digit code/i));
    // Verify button is disabled={isPending} while forgot transition is in flight.
    const verifyBtn = screen.getByRole("button", { name: /verify/i });
    await waitForEnabled(verifyBtn);

    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "000000" },
    });
    // handleVerifyCode is synchronous — fireEvent is fine.
    fireEvent.click(verifyBtn);

    await waitFor(() => screen.getByLabelText(/new password/i));

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "freshpass" },
    });
    // On C-verify bounce, button unmounts — use userEvent + waitFor on result.
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      // Form should return to C-verify so the user can re-enter the code,
      // and the error message from ERRORS.auth_code_invalid is visible.
      expect(screen.getByLabelText(/6-digit code/i)).toBeDefined();
      expect(screen.getByText(/that code didn't take/i)).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// State B — set-password form for OAuth-only / OTP-only users
// ---------------------------------------------------------------------------

describe("SecurityForm — State B (no-password identity)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stateBProps = {
    identityState: "no-password" as IdentityState,
    userEmail: "dave@example.com",
  };

  it("renders the new-password field (no current-password field)", () => {
    render(<SecurityForm {...stateBProps} />);
    expect(screen.getByLabelText(/new password/i)).toBeDefined();
    // Must NOT have a current-password field — State B has no existing password
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
  });

  it("renders the Set password button (not Update password)", () => {
    render(<SecurityForm {...stateBProps} />);
    expect(
      screen.getByRole("button", { name: /set password/i })
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /update password/i })
    ).toBeNull();
  });

  it("shows helper copy for OAuth-only user (mentions Google)", () => {
    // When the user has only Google identities — identityState is no-password
    // but the form needs to know if it's OAuth-only or OTP-only.
    // The component derives this from identityState only in PR5;
    // for test purposes we check that Google-related copy appears.
    render(<SecurityForm {...stateBProps} identitySubtype="oauth" />);
    expect(screen.getByText(/google/i)).toBeDefined();
  });

  it("shows helper copy for OTP-only user (mentions code)", () => {
    render(<SecurityForm {...stateBProps} identitySubtype="otp" />);
    expect(screen.getByText(/code/i)).toBeDefined();
  });

  it("calls setPasswordAction with newPassword on submit", async () => {
    // On success, mode transitions to "success" — button unmounts.
    mockSetPasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...stateBProps} />);

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      expect(mockSetPasswordAction).toHaveBeenCalledWith({
        newPassword: "mynewpass123",
      });
    });
  });

  it("does NOT pass an email field to setPasswordAction", async () => {
    mockSetPasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...stateBProps} />);

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      const callArg = mockSetPasswordAction.mock.calls[0]?.[0];
      expect(callArg).not.toHaveProperty("email");
    });
  });

  it("shows success toast after setPasswordAction returns { ok: true }", async () => {
    mockSetPasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });

    render(<SecurityForm {...stateBProps} />);

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeDefined();
    });
  });

  it("shows an error on network failure", async () => {
    // On error, button stays in DOM and re-enables — clickAndSettle works.
    mockSetPasswordAction.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "network" };
    });

    render(<SecurityForm {...stateBProps} />);

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "mynewpass123" },
    });

    const submitBtn = screen.getByRole("button", { name: /set password/i });
    await clickAndSettle(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
  });
});
