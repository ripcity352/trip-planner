/**
 * Unit tests for the magic-link `<LoginForm />` client component.
 *
 * Why this file lives in `tests/unit/` instead of `app/login/__tests__/`:
 * `vitest.config.ts` (read-only for this wave) only picks up
 * `tests/unit/**` and `lib/**`. Wave 1a's spec asked for the test under
 * `app/login/__tests__/`, but the include pattern would skip it. Filed
 * for follow-up — see PR body.
 *
 * What we assert here (per Wave 1a TDD list):
 *   - email input + submit button render
 *   - empty submit shows the validation error (zod inline)
 *   - valid email submit calls the action exactly once with the email
 *   - pending state disables the button and shows a spinner
 *   - on `{ ok: true }`, the success copy from `ERRORS.auth_link_sent`
 *     replaces the form region
 *
 * The server action is mocked. We do NOT exercise Supabase here.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ERRORS } from "@/lib/copy/errors";

const requestMagicLinkMock = vi.fn();

// Mock the server-action module. `LoginForm` imports `requestMagicLink`
// from `./actions`; we intercept at the module boundary so the form runs
// the rest of its logic untouched.
vi.mock("@/app/login/actions", () => ({
  requestMagicLink: (...args: unknown[]) => requestMagicLinkMock(...args),
}));

import { LoginForm } from "@/app/login/_form";

describe("<LoginForm />", () => {
  beforeEach(() => {
    requestMagicLinkMock.mockReset();
  });

  it("renders an email input and a submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send the link/i })
    ).toBeInTheDocument();
  });

  it("shows a validation message when the email is empty", async () => {
    render(<LoginForm />);
    fireEvent.submit(screen.getByRole("button", { name: /send the link/i }));

    await waitFor(() => {
      // The zod resolver renders an inline note. We don't pin the exact
      // wording — only that *some* error appears in an aria-live region.
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent ?? "").not.toBe("");
    });
    expect(requestMagicLinkMock).not.toHaveBeenCalled();
  });

  it("calls the server action with the email on valid submit", async () => {
    requestMagicLinkMock.mockResolvedValue({ ok: true });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dave@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send the link/i }));

    await waitFor(() => {
      expect(requestMagicLinkMock).toHaveBeenCalledTimes(1);
    });
    expect(requestMagicLinkMock).toHaveBeenCalledWith("dave@example.com");
  });

  it("disables the submit button and shows a spinner while pending", async () => {
    // Hold the promise open so we can observe the pending UI before resolve.
    let resolveAction: (value: { ok: true }) => void = () => {};
    requestMagicLinkMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        })
    );

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dave@example.com" },
    });
    const submit = screen.getByRole("button", { name: /send the link/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
      // Lucide renders an inline <svg> — we tag it with data-slot="spinner".
      expect(submit.querySelector('[data-slot="spinner"]')).not.toBeNull();
    });

    // Resolve so the test doesn't leak a pending promise.
    resolveAction({ ok: true });
  });

  it("renders the auth_link_sent copy on a successful response", async () => {
    requestMagicLinkMock.mockResolvedValue({ ok: true });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dave@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send the link/i }));

    await waitFor(() => {
      expect(screen.getByText(ERRORS.auth_link_sent)).toBeInTheDocument();
    });
    // The form region should be gone after success.
    expect(
      screen.queryByRole("button", { name: /send the link/i })
    ).not.toBeInTheDocument();
  });

  it("renders an error note when the action returns an error key", async () => {
    requestMagicLinkMock.mockResolvedValue({ ok: false, errorKey: "network" });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dave@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send the link/i }));

    await waitFor(() => {
      expect(screen.getByText(ERRORS.network)).toBeInTheDocument();
    });
    // Submit button is back — user can retry.
    expect(
      screen.getByRole("button", { name: /send the link/i })
    ).toBeInTheDocument();
  });

  it("renders the rate_limit copy when the server action throttles", async () => {
    // Covers the PR #102 hardening: magic-link issuance is now wrapped
    // in `rateLimitedAction("authOtpVerify", ...)`. When the bucket is
    // empty, `requestMagicLink` returns `{ ok: false, errorKey:
    // "rate_limit" }` and the form should surface the matching copy.
    requestMagicLinkMock.mockResolvedValue({
      ok: false,
      errorKey: "rate_limit",
    });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dave@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send the link/i }));

    await waitFor(() => {
      expect(screen.getByText(ERRORS.rate_limit)).toBeInTheDocument();
    });
    // Submit button is back — user can retry once the budget resets.
    expect(
      screen.getByRole("button", { name: /send the link/i })
    ).toBeInTheDocument();
  });
});
