/**
 * Unit tests for the progressive-disclosure `<LoginForm />` (M5/PR2).
 *
 * Why this file lives in `tests/unit/` instead of `app/login/`:
 * Override C (Phase 4 audit) requires all tests under `tests/unit/` or
 * `lib/`. Never under `app/`.
 *
 * Coverage:
 *   - email-only mode: renders email field + Continue button
 *   - password mode: renders password field + show/hide toggle + "Email me
 *     a code instead" link after clicking Continue
 *   - wrong-password: renders auth_wrong_password error + prominent
 *     "Email me a code instead" link
 *   - code-verify mode: transitions after clicking "Email me a code instead"
 *   - verifyEmailCodeAction: submitting a 6-digit code in code-verify mode
 *   - signUpAction: clicking "Create account instead" after wrong password
 *   - next prop: form passes `next` through to actions
 *   - show/hide password toggle
 *
 * All server actions are mocked. We do NOT hit Supabase.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ERRORS } from "@/lib/copy/errors";
import { AUTH_COPY } from "@/lib/copy/auth";

// --- mock setup ---

const signInWithPasswordActionMock = vi.fn();
const signUpActionMock = vi.fn();
const verifyEmailCodeActionMock = vi.fn();
const requestEmailCodeMock = vi.fn();
const signInWithOAuthActionMock = vi.fn();

vi.mock("@/app/login/actions", () => ({
  signInWithPasswordAction: (...args: unknown[]) =>
    signInWithPasswordActionMock(...args),
  signUpAction: (...args: unknown[]) => signUpActionMock(...args),
  verifyEmailCodeAction: (...args: unknown[]) =>
    verifyEmailCodeActionMock(...args),
  requestEmailCode: (...args: unknown[]) => requestEmailCodeMock(...args),
  signInWithOAuthAction: (...args: unknown[]) =>
    signInWithOAuthActionMock(...args),
}));

import { LoginForm } from "@/app/login/_form";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enterEmail(email = "dave@example.com") {
  fireEvent.change(screen.getByLabelText(AUTH_COPY.emailFieldLabel), {
    target: { value: email },
  });
}

async function advanceToPasswordMode(email = "dave@example.com") {
  enterEmail(email);
  fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.continueButton }));
  // Wait for password field to appear
  await waitFor(() => {
    expect(
      screen.getByLabelText(AUTH_COPY.passwordFieldLabel)
    ).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------

describe("<LoginForm /> — email-only mode (initial)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email field and Continue button in initial mode", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(AUTH_COPY.emailFieldLabel)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: AUTH_COPY.continueButton })
    ).toBeInTheDocument();
  });

  it("does not render a password field in initial mode", () => {
    render(<LoginForm />);
    expect(
      screen.queryByLabelText(AUTH_COPY.passwordFieldLabel)
    ).not.toBeInTheDocument();
  });

  it("does not render the code field in initial mode", () => {
    render(<LoginForm />);
    expect(
      screen.queryByLabelText(AUTH_COPY.codeFieldLabel)
    ).not.toBeInTheDocument();
  });

  it("shows a validation error when Continue is clicked with empty email", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.continueButton }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // Action should not have been called
    expect(signInWithPasswordActionMock).not.toHaveBeenCalled();
  });

  it("shows a validation error for an invalid email", async () => {
    render(<LoginForm />);
    enterEmail("not-an-email");
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.continueButton }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("<LoginForm /> — password mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions to password mode after valid email + Continue", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    expect(
      screen.getByLabelText(AUTH_COPY.passwordFieldLabel)
    ).toBeInTheDocument();
  });

  it("shows the Sign in button in password mode", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    expect(
      screen.getByRole("button", { name: AUTH_COPY.signInButton })
    ).toBeInTheDocument();
  });

  it("shows the 'Email me a code instead' link in password mode", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    expect(
      screen.getByRole("button", { name: AUTH_COPY.emailMeCodeLink })
    ).toBeInTheDocument();
  });

  it("does not show the password helper text on initial sign-in view", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    expect(screen.queryByText(AUTH_COPY.passwordHelper)).not.toBeInTheDocument();
  });

  it("password field type is 'password' by default", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    const passwordInput = screen.getByLabelText(AUTH_COPY.passwordFieldLabel);
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("show/hide toggle changes password field type to text", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    const toggleBtn = screen.getByRole("button", {
      name: AUTH_COPY.togglePasswordShow,
    });
    fireEvent.click(toggleBtn);
    const passwordInput = screen.getByLabelText(AUTH_COPY.passwordFieldLabel);
    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("show/hide toggle cycles back to 'password' type on second click", async () => {
    render(<LoginForm />);
    await advanceToPasswordMode();
    const toggleBtn = screen.getByRole("button", {
      name: AUTH_COPY.togglePasswordShow,
    });
    fireEvent.click(toggleBtn);
    // Button label should now be "Hide"
    const hideBtn = screen.getByRole("button", {
      name: AUTH_COPY.togglePasswordHide,
    });
    fireEvent.click(hideBtn);
    const passwordInput = screen.getByLabelText(AUTH_COPY.passwordFieldLabel);
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("calls signInWithPasswordAction on sign-in submit", async () => {
    signInWithPasswordActionMock.mockResolvedValue({ ok: true });
    render(<LoginForm />);
    await advanceToPasswordMode("dave@example.com");
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "hunter2!" },
    });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signInButton }));
    await waitFor(() => {
      expect(signInWithPasswordActionMock).toHaveBeenCalledTimes(1);
    });
    expect(signInWithPasswordActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com", password: "hunter2!" })
    );
  });

  it("disables submit button while sign-in is pending", async () => {
    let resolve: (v: { ok: true }) => void = () => {};
    signInWithPasswordActionMock.mockImplementation(
      () => new Promise((r) => { resolve = r; })
    );
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "hunter2!" },
    });
    const signInBtn = screen.getByRole("button", { name: AUTH_COPY.signInButton });
    fireEvent.click(signInBtn);
    await waitFor(() => {
      expect(signInBtn).toBeDisabled();
    });
    resolve({ ok: true });
  });

  it("renders auth_wrong_password error on failed sign-in", async () => {
    signInWithPasswordActionMock.mockResolvedValue({
      ok: false,
      errorKey: "auth_wrong_password",
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signInButton }));
    await waitFor(() => {
      expect(screen.getByText(ERRORS.auth_wrong_password)).toBeInTheDocument();
    });
  });

  it("shows 'Create account instead' link after wrong-password error", async () => {
    signInWithPasswordActionMock.mockResolvedValue({
      ok: false,
      errorKey: "auth_wrong_password",
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signInButton }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: AUTH_COPY.createAccountLink })
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------

describe("<LoginForm /> — sign-up path (after wrong password)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function triggerWrongPassword() {
    signInWithPasswordActionMock.mockResolvedValue({
      ok: false,
      errorKey: "auth_wrong_password",
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signInButton }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: AUTH_COPY.createAccountLink })
      ).toBeInTheDocument();
    });
  }

  it("shows password helper text once create-account path is revealed", async () => {
    await triggerWrongPassword();
    expect(screen.getByText(AUTH_COPY.passwordHelper)).toBeInTheDocument();
  });

  it("calls signUpAction when 'Create account instead' is clicked", async () => {
    signUpActionMock.mockResolvedValue({ ok: true });
    await triggerWrongPassword();
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.createAccountLink })
    );
    await waitFor(() => {
      expect(signUpActionMock).toHaveBeenCalledTimes(1);
    });
    expect(signUpActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com" })
    );
  });
});

// ---------------------------------------------------------------------------

describe("<LoginForm /> — code-verify mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function advanceToCodeVerifyMode() {
    requestEmailCodeMock.mockResolvedValue({ ok: true });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.emailMeCodeLink })
    );
    await waitFor(() => {
      expect(screen.getByLabelText(AUTH_COPY.codeFieldLabel)).toBeInTheDocument();
    });
  }

  it("transitions to code-verify mode after clicking 'Email me a code instead'", async () => {
    await advanceToCodeVerifyMode();
    expect(screen.getByLabelText(AUTH_COPY.codeFieldLabel)).toBeInTheDocument();
  });

  it("calls requestEmailCode when transitioning to code-verify mode", async () => {
    await advanceToCodeVerifyMode();
    expect(requestEmailCodeMock).toHaveBeenCalledWith("dave@example.com");
  });

  it("shows 'Code's heading to...' helper text in code-verify mode", async () => {
    await advanceToCodeVerifyMode();
    expect(
      screen.getByText(AUTH_COPY.codeSentHelper("dave@example.com"))
    ).toBeInTheDocument();
  });

  it("shows the Verify button in code-verify mode", async () => {
    await advanceToCodeVerifyMode();
    expect(
      screen.getByRole("button", { name: AUTH_COPY.verifyCodeButton })
    ).toBeInTheDocument();
  });

  it("calls verifyEmailCodeAction with email + token on submit", async () => {
    verifyEmailCodeActionMock.mockResolvedValue({ ok: true });
    await advanceToCodeVerifyMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.codeFieldLabel), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.verifyCodeButton })
    );
    await waitFor(() => {
      expect(verifyEmailCodeActionMock).toHaveBeenCalledTimes(1);
    });
    expect(verifyEmailCodeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com", token: "123456" })
    );
  });

  it("shows auth_code_invalid error when verifyEmailCodeAction fails", async () => {
    verifyEmailCodeActionMock.mockResolvedValue({
      ok: false,
      errorKey: "auth_code_invalid",
    });
    await advanceToCodeVerifyMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.codeFieldLabel), {
      target: { value: "000000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.verifyCodeButton })
    );
    await waitFor(() => {
      expect(screen.getByText(ERRORS.auth_code_invalid)).toBeInTheDocument();
    });
  });

  it("shows rate_limit error when requestEmailCode is rate-limited", async () => {
    requestEmailCodeMock.mockResolvedValue({
      ok: false,
      errorKey: "rate_limit",
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.emailMeCodeLink })
    );
    await waitFor(() => {
      expect(screen.getByText(ERRORS.rate_limit)).toBeInTheDocument();
    });
    // Should stay in password mode (not advance to code-verify)
    expect(
      screen.queryByLabelText(AUTH_COPY.codeFieldLabel)
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("<LoginForm /> — next prop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a next prop without error", () => {
    expect(() =>
      render(<LoginForm next="/invite/abc123/accept" />)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Google OAuth button (PR5)
// ---------------------------------------------------------------------------

describe("<LoginForm /> — Google OAuth button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the 'Continue with Google' button in email-only mode", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton })
    ).toBeInTheDocument();
  });

  it("renders the OAuth button BELOW the email field (H3 ordering)", () => {
    render(<LoginForm />);
    const continueBtn = screen.getByRole("button", { name: AUTH_COPY.continueButton });
    const googleBtn = screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton });
    // continueBtn should appear before googleBtn in DOM order
    const allButtons = screen.getAllByRole("button");
    const continueIdx = allButtons.indexOf(continueBtn);
    const googleIdx = allButtons.indexOf(googleBtn);
    expect(continueIdx).toBeLessThan(googleIdx);
  });

  it("calls signInWithOAuthAction with provider=google when clicked", async () => {
    // Mock window.location.assign since jsdom doesn't implement it
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { assign: assignMock },
    });

    signInWithOAuthActionMock.mockResolvedValue({
      ok: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth",
    });

    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton })
    );

    await waitFor(() => {
      expect(signInWithOAuthActionMock).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" })
      );
    });
  });

  it("navigates to the OAuth URL on success (window.location.assign)", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { assign: assignMock },
    });

    signInWithOAuthActionMock.mockResolvedValue({
      ok: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth",
    });

    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton })
    );

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth"
      );
    });
  });

  it("shows an error when signInWithOAuthAction fails", async () => {
    signInWithOAuthActionMock.mockResolvedValue({
      ok: false,
      errorKey: "oauth_redirect_failed",
    });

    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// OAuth-existing-user alert (M5-followup) — UI scaffolding stripped from PR5
// because the server-side detection that produces auth_email_taken_oauth was
// never wired. Copy keys remain in lib/copy/auth.ts pinned by voice-lock
// tests, ready for a follow-up PR that adds the detection (likely a new
// public RPC; ADR-accepted enumeration leak per v3.2). When the wiring lands,
// re-introduce the alert tests here.
// ---------------------------------------------------------------------------
