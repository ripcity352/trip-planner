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
 *
 * Submit-clicks use `clickAndSettle` (tests/fixtures/dom.ts) to drain
 * React's transition queue before making assertions — fixes the
 * async-submit flake class (#230, #207).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ERRORS } from "@/lib/copy/errors";
import { AUTH_COPY } from "@/lib/copy/auth";
import { clickAndSettle } from "@/tests/fixtures/dom";

// Delay injected into action mocks to widen the race window deterministically.
// Per-test local constant — not a shared seam.
const MOCK_DELAY_MS = 30;

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
  // continueButton is synchronous local state — no startTransition, fireEvent is fine.
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
    // Toggle is synchronous local state — fireEvent is fine.
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
    // Both toggles are synchronous local state — fireEvent is fine.
    fireEvent.click(toggleBtn);
    const hideBtn = screen.getByRole("button", {
      name: AUTH_COPY.togglePasswordHide,
    });
    fireEvent.click(hideBtn);
    const passwordInput = screen.getByLabelText(AUTH_COPY.passwordFieldLabel);
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("calls signInWithPasswordAction on sign-in submit", async () => {
    signInWithPasswordActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    render(<LoginForm />);
    await advanceToPasswordMode("dave@example.com");
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "hunter2!" },
    });
    const signInBtn = screen.getByRole("button", { name: AUTH_COPY.signInButton });
    await clickAndSettle(signInBtn);
    expect(signInWithPasswordActionMock).toHaveBeenCalledTimes(1);
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
    // Use fireEvent here intentionally — we want to inspect the disabled state
    // while the action is in-flight (before resolve).
    fireEvent.click(signInBtn);
    await waitFor(() => {
      expect(signInBtn).toBeDisabled();
    });
    resolve({ ok: true });
  });

  it("renders auth_wrong_password error on failed sign-in", async () => {
    signInWithPasswordActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "auth_wrong_password" };
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "wrongpass" },
    });
    const signInBtn = screen.getByRole("button", { name: AUTH_COPY.signInButton });
    await clickAndSettle(signInBtn);
    await waitFor(() => {
      expect(screen.getByText(ERRORS.auth_wrong_password)).toBeInTheDocument();
    });
  });

  it("shows 'Create account instead' link after wrong-password error", async () => {
    signInWithPasswordActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "auth_wrong_password" };
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "wrongpass" },
    });
    const signInBtn = screen.getByRole("button", { name: AUTH_COPY.signInButton });
    await clickAndSettle(signInBtn);
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
    signInWithPasswordActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "auth_wrong_password" };
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.passwordFieldLabel), {
      target: { value: "wrongpass" },
    });
    const signInBtn = screen.getByRole("button", { name: AUTH_COPY.signInButton });
    await clickAndSettle(signInBtn);
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
    signUpActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    await triggerWrongPassword();
    const createBtn = screen.getByRole("button", { name: AUTH_COPY.createAccountLink });
    await clickAndSettle(createBtn);
    expect(signUpActionMock).toHaveBeenCalledTimes(1);
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
    requestEmailCodeMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    // emailMeCodeLink uses startTransition but causes a mode change that
    // unmounts the button — cannot use clickAndSettle (settle = re-enable).
    // userEvent.click drains the microtask queue; findByRole below retries
    // until the Verify button's accessible name is "Verify" (not the spinner),
    // which only happens after isPending=false — i.e. the full transition has
    // completed. waitFor(codeFieldLabel) alone is not sufficient because the
    // mode-change setMode("code-verify") fires INSIDE startTransition while
    // isPending is still true, so the Verify button appears with aria-busy and
    // a spinner accessible name before the transition fully resolves.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: AUTH_COPY.emailMeCodeLink }));
    // findByRole retries (RTL default 1 s timeout) until name === verifyCodeButton.
    await screen.findByRole("button", { name: AUTH_COPY.verifyCodeButton });
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
    verifyEmailCodeActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    await advanceToCodeVerifyMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.codeFieldLabel), {
      target: { value: "123456" },
    });
    const verifyBtn = screen.getByRole("button", { name: AUTH_COPY.verifyCodeButton });
    await clickAndSettle(verifyBtn);
    expect(verifyEmailCodeActionMock).toHaveBeenCalledTimes(1);
    expect(verifyEmailCodeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dave@example.com", token: "123456" })
    );
  });

  it("shows auth_code_invalid error when verifyEmailCodeAction fails", async () => {
    verifyEmailCodeActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "auth_code_invalid" };
    });
    await advanceToCodeVerifyMode();
    fireEvent.change(screen.getByLabelText(AUTH_COPY.codeFieldLabel), {
      target: { value: "000000" },
    });
    const verifyBtn = screen.getByRole("button", { name: AUTH_COPY.verifyCodeButton });
    await clickAndSettle(verifyBtn);
    await waitFor(() => {
      expect(screen.getByText(ERRORS.auth_code_invalid)).toBeInTheDocument();
    });
  });

  it("shows rate_limit error when requestEmailCode is rate-limited", async () => {
    requestEmailCodeMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "rate_limit" };
    });
    render(<LoginForm />);
    await advanceToPasswordMode();
    // On error the button stays in DOM and re-enables — clickAndSettle works here.
    const emailCodeBtn = screen.getByRole("button", { name: AUTH_COPY.emailMeCodeLink });
    await clickAndSettle(emailCodeBtn);
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
    // The invite page hands the GET-navigable preview path as `next`
    // (never the POST-only accept route — #316).
    expect(() =>
      render(<LoginForm next="/invite/abc123" />)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Google OAuth button (PR5)
// ---------------------------------------------------------------------------

describe("<LoginForm /> — Google OAuth button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // #370: the button is gated behind the provider-enabled flag; these
    // tests exercise the enabled state.
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

    signInWithOAuthActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true, url: "https://accounts.google.com/o/oauth2/v2/auth" };
    });

    render(<LoginForm />);
    const googleBtn = screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton });
    await clickAndSettle(googleBtn);
    expect(signInWithOAuthActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" })
    );
  });

  it("navigates to the OAuth URL on success (window.location.assign)", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { assign: assignMock },
    });

    signInWithOAuthActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true, url: "https://accounts.google.com/o/oauth2/v2/auth" };
    });

    render(<LoginForm />);
    const googleBtn = screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton });
    await clickAndSettle(googleBtn);
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth"
      );
    });
  });

  it("shows an error when signInWithOAuthAction fails", async () => {
    signInWithOAuthActionMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: false, errorKey: "oauth_redirect_failed" };
    });

    render(<LoginForm />);
    const googleBtn = screen.getByRole("button", { name: AUTH_COPY.continueWithGoogleButton });
    await clickAndSettle(googleBtn);
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

// ---------------------------------------------------------------------------
// #370: Google button gated off while the Supabase provider is disabled
// ---------------------------------------------------------------------------

describe("<LoginForm /> — Google OAuth button gated off (default)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs(); // NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED unset
  });

  it("does not render the Google button in email-only mode", () => {
    render(<LoginForm />);
    expect(
      screen.queryByRole("button", { name: AUTH_COPY.continueWithGoogleButton })
    ).not.toBeInTheDocument();
  });

  it("does not render the Google button when the flag is any non-'true' value", () => {
    vi.stubEnv("NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED", "1");
    render(<LoginForm />);
    expect(
      screen.queryByRole("button", { name: AUTH_COPY.continueWithGoogleButton })
    ).not.toBeInTheDocument();
  });
});
