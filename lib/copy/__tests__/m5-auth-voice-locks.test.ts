/**
 * Voice-lock tests for M5 auth error copy (PR2).
 *
 * Phase 4 audit H7 found that auth error strings drifted toward corporate
 * SaaS language. These pins are the source of truth — changing a string
 * here requires updating this test intentionally (Override H).
 *
 * All strings pass "would you say this at a pre-trip dinner?" test.
 * Anti-patterns guarded: "An error occurred", bare "error", "Invalid",
 * "Authentication failed", "Incorrect password".
 */

import { describe, expect, it } from "vitest";
import { ERRORS } from "@/lib/copy/errors";
import { AUTH_COPY } from "@/lib/copy/auth";

describe("ERRORS — M5 auth voice locks (Phase 4 audit H7)", () => {
  it("auth_wrong_password is voice-locked (H7 rewrite)", () => {
    // Exact string mandated by Phase 4 audit H7. The original plan had
    // "That email and password didn't match. Try again, or email me a code."
    // — too long and clinical. This version is shorter, warmer, more casual.
    expect(ERRORS.auth_wrong_password).toBe(
      "That combo didn't match. Try again — or get a code emailed instead."
    );
  });

  it("auth_code_invalid is voice-locked", () => {
    expect(ERRORS.auth_code_invalid).toBe(
      "That code didn't take. Double-check or get a fresh one."
    );
  });

  it("auth_code_expired is voice-locked", () => {
    expect(ERRORS.auth_code_expired).toBe("Code's stale. Get a fresh one.");
  });

  it("auth_email_taken_oauth is voice-locked", () => {
    expect(ERRORS.auth_email_taken_oauth).toBe(
      "You signed up with Google before. Tap Continue with Google instead."
    );
  });

  it("auth_no_account is voice-locked", () => {
    // Returned on 422 otp_disabled — no account for that email yet. Points
    // the user at the password sign-up path. Blame-free, casual, actionable.
    expect(ERRORS.auth_no_account).toBe(
      "No account on that email yet. Add a password to create one."
    );
  });

  it("auth_no_account does not contain corporate SaaS language", () => {
    const v = ERRORS.auth_no_account.toLowerCase();
    expect(v).not.toContain("an error occurred");
    expect(v).not.toContain("authentication failed");
    expect(v).not.toContain("invalid");
    expect(v.length).toBeLessThanOrEqual(120);
  });

  it("auth_wrong_password does not contain corporate SaaS language", () => {
    const v = ERRORS.auth_wrong_password.toLowerCase();
    expect(v).not.toContain("an error occurred");
    expect(v).not.toContain("incorrect password");
    expect(v).not.toContain("authentication failed");
    expect(v).not.toContain("invalid");
  });

  it("auth_code_invalid does not contain 'an error occurred' or 'invalid code'", () => {
    const v = ERRORS.auth_code_invalid.toLowerCase();
    expect(v).not.toContain("an error occurred");
    expect(v).not.toContain("invalid code");
  });

  // --- 2026-07-11 invite-incident voice locks --------------------------------

  it("auth_confirm_pending is voice-locked", () => {
    // Signup succeeded in a confirmation-gated env (no session). Honest:
    // the account EXISTS — never report the false "network" failure that
    // stranded the 2026-07-11 invitees.
    expect(ERRORS.auth_confirm_pending).toBe(
      "Account's created — check your email to confirm, then sign in here."
    );
  });

  it("auth_email_not_confirmed is voice-locked", () => {
    // Correct password, unconfirmed email. Split out of auth_wrong_password
    // — users with the right password must never be told the combo didn't
    // match.
    expect(ERRORS.auth_email_not_confirmed).toBe(
      "You're in the books — check your email to confirm first."
    );
  });

  it("confirm-split strings do not contain corporate SaaS language", () => {
    for (const key of ["auth_confirm_pending", "auth_email_not_confirmed"] as const) {
      const v = ERRORS[key].toLowerCase();
      expect(v).not.toContain("an error occurred");
      expect(v).not.toContain("authentication failed");
      expect(v).not.toContain("invalid");
      expect(v).not.toContain("verify your email address");
      expect(ERRORS[key].length).toBeLessThanOrEqual(120);
    }
  });

  it("all M5 auth error strings are under 120 chars", () => {
    const keys = [
      "auth_wrong_password",
      "auth_code_invalid",
      "auth_code_expired",
      "auth_email_taken_oauth",
      "auth_confirm_pending",
      "auth_email_not_confirmed",
    ] as const;
    for (const key of keys) {
      expect(
        ERRORS[key].length,
        `${key} must be under 120 chars`
      ).toBeLessThanOrEqual(120);
    }
  });

  // --- PR4 voice locks -------------------------------------------------------

  it("auth_current_password_incorrect is voice-locked (H7)", () => {
    // Exact string mandated by Phase 4 audit H7. DO NOT change without
    // updating this test. The original plan had "Current password is
    // incorrect." — SaaS/clinical. This version is warm, actionable,
    // and offers the OTP recovery path explicitly.
    expect(ERRORS.auth_current_password_incorrect).toBe(
      "That's not the current password. Try once more — or use a code to reset."
    );
  });

  it("auth_current_password_incorrect does not contain corporate SaaS language", () => {
    const v = ERRORS.auth_current_password_incorrect.toLowerCase();
    expect(v).not.toContain("incorrect password");
    expect(v).not.toContain("current password is incorrect");
    expect(v).not.toContain("an error occurred");
    expect(v).not.toContain("authentication failed");
    expect(v).not.toContain("invalid");
  });

  it("auth_unauthenticated is non-empty and under 120 chars", () => {
    expect(ERRORS.auth_unauthenticated.trim().length).toBeGreaterThan(0);
    expect(ERRORS.auth_unauthenticated.length).toBeLessThanOrEqual(120);
  });

  it("all PR4 auth error strings are under 120 chars", () => {
    const keys = [
      "auth_current_password_incorrect",
      "auth_unauthenticated",
    ] as const;
    for (const key of keys) {
      expect(
        ERRORS[key].length,
        `${key} must be under 120 chars`
      ).toBeLessThanOrEqual(120);
    }
  });
});

// ---------------------------------------------------------------------------
// PR5 voice locks — Google OAuth + State B strings
// ---------------------------------------------------------------------------

describe("AUTH_COPY — PR5 voice locks (Google OAuth + State B)", () => {
  // -------------------------------------------------------------------------
  // continueWithGoogleButton
  // -------------------------------------------------------------------------

  it("continueWithGoogleButton is voice-locked", () => {
    expect(AUTH_COPY.continueWithGoogleButton).toBe("Continue with Google");
  });

  // -------------------------------------------------------------------------
  // oauth_account_prompt_text — the load-bearing voice lock
  //
  // Spec-mandated string: "You signed up with Google. Sign in with Google,
  // or get a code emailed instead?" (Phase 4 audit C1 / Voice).
  // -------------------------------------------------------------------------

  it("oauth_account_prompt_text is voice-locked to the spec-mandated copy", () => {
    expect(AUTH_COPY.oauth_account_prompt_text).toBe(
      "You signed up with Google. Sign in with Google, or get a code emailed instead?"
    );
  });

  it("oauth_account_prompt_text does not contain corporate SaaS language", () => {
    const v = AUTH_COPY.oauth_account_prompt_text.toLowerCase();
    expect(v).not.toContain("authentication");
    expect(v).not.toContain("an error occurred");
    expect(v).not.toContain("account already exists");
    expect(v).not.toContain("email address is already");
  });

  it("oauth_account_prompt_text passes the 'pre-trip dinner' voice test (warm, specific)", () => {
    // The string must contain the provider name (Google — specific, not abstract)
    expect(AUTH_COPY.oauth_account_prompt_text).toContain("Google");
    // Under 150 chars — readable in a small mobile alert
    expect(AUTH_COPY.oauth_account_prompt_text.length).toBeLessThanOrEqual(150);
  });

  it("oauth_account_prompt_google_button is non-empty and specific", () => {
    expect(AUTH_COPY.oauth_account_prompt_google_button.length).toBeGreaterThan(0);
    expect(AUTH_COPY.oauth_account_prompt_google_button).toContain("Google");
  });

  it("oauth_account_prompt_code_button is non-empty", () => {
    expect(AUTH_COPY.oauth_account_prompt_code_button.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // State B copy keys
  // -------------------------------------------------------------------------

  it("accountSecurity_stateB_title is non-empty and under 80 chars", () => {
    expect(AUTH_COPY.accountSecurity_stateB_title.trim().length).toBeGreaterThan(0);
    expect(AUTH_COPY.accountSecurity_stateB_title.length).toBeLessThanOrEqual(80);
  });

  it("accountSecurity_stateB_helperOauthOnly mentions Google (specific, not generic)", () => {
    expect(AUTH_COPY.accountSecurity_stateB_helperOauthOnly).toContain("Google");
  });

  it("accountSecurity_stateB_helperOtpOnly does NOT contain corporate language", () => {
    const v = AUTH_COPY.accountSecurity_stateB_helperOtpOnly.toLowerCase();
    expect(v).not.toContain("one-time password");
    expect(v).not.toContain("authentication failed");
    expect(v).not.toContain("an error");
  });

  it("accountSecurity_stateB_setButton is non-empty", () => {
    expect(AUTH_COPY.accountSecurity_stateB_setButton.trim().length).toBeGreaterThan(0);
  });

  it("oauth_redirect_failed error string is warm and blame-free", () => {
    const v = ERRORS.oauth_redirect_failed.toLowerCase();
    expect(v).not.toContain("an error occurred");
    expect(v).not.toContain("authentication failed");
    expect(v).not.toContain("oauth failed");
    expect(ERRORS.oauth_redirect_failed.length).toBeLessThanOrEqual(120);
  });

  it("all PR5 AUTH_COPY strings are under 200 chars", () => {
    const keys = [
      "continueWithGoogleButton",
      "oauth_account_prompt_text",
      "oauth_account_prompt_google_button",
      "oauth_account_prompt_code_button",
      "accountSecurity_stateB_title",
      "accountSecurity_stateB_helperOauthOnly",
      "accountSecurity_stateB_helperOtpOnly",
      "accountSecurity_stateB_setButton",
    ] as const;
    for (const key of keys) {
      const val = AUTH_COPY[key] as string;
      expect(
        val.length,
        `${key} must be under 200 chars, got ${val.length}`
      ).toBeLessThanOrEqual(200);
    }
  });
});

// ---------------------------------------------------------------------------
// AUTH W1b — login page key voice locks (#122)
// ---------------------------------------------------------------------------
//
// Anti-tell denylist is scoped to loginPageTitle ONLY — NOT the full AUTH_COPY
// object — because signUpButton / createAccountLink are legitimate explicit
// sign-up affordances on the /login form and must not be failed.

describe("AUTH_COPY — W1b login page voice locks (#122)", () => {
  it("loginPageTitle is voice-locked to the spec-mandated string", () => {
    // Plain action heading. Matches signInButton for visual unity.
    // "Sign in" — not "Welcome back" (sycophantic), not "Get started" (SaaS).
    expect(AUTH_COPY.loginPageTitle).toBe("Sign in");
  });

  it("loginPageTitle does not contain banned anti-tell substrings", () => {
    const v = AUTH_COPY.loginPageTitle.toLowerCase();
    expect(v).not.toContain("welcome back");
    expect(v).not.toContain("get started");
    expect(v).not.toContain("sign up");
    expect(v).not.toContain("create account");
    expect(v).not.toContain("let's make memories");
    expect(v).not.toContain("get pumped");
  });

  it("loginPageTitle is under 40 chars (fits a mobile card header)", () => {
    expect(AUTH_COPY.loginPageTitle.length).toBeLessThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// Invite surface create-account-first voice locks (2026-07-11 incident fix)
// ---------------------------------------------------------------------------
//
// Pin the intent-aware invite headers + toggle exactly (Override H). These
// replaced the crossed-label surface ("Sign in to join" header + "Sign in"
// primary over create-account helper text) that misdirected new invitees.

describe("AUTH_COPY — invite create-first voice locks", () => {
  it("inviteAuthHeaderCreate is voice-locked", () => {
    expect(AUTH_COPY.inviteAuthHeaderCreate).toBe("Make an account to join");
  });

  it("inviteAuthHeaderSignIn is voice-locked", () => {
    expect(AUTH_COPY.inviteAuthHeaderSignIn).toBe("Sign in to join");
  });

  it("inviteHaveAccountToggle is voice-locked", () => {
    expect(AUTH_COPY.inviteHaveAccountToggle).toBe("Have an account? Sign in");
  });

  it("invite create-first keys contain no corporate SaaS language", () => {
    const keys = [
      "inviteAuthHeaderCreate",
      "inviteAuthHeaderSignIn",
      "inviteHaveAccountToggle",
    ] as const;
    for (const key of keys) {
      const v = (AUTH_COPY[key] as string).toLowerCase();
      expect(v).not.toContain("get started");
      expect(v).not.toContain("welcome back");
      expect(v).not.toContain("sign up");
      expect((AUTH_COPY[key] as string).length).toBeLessThanOrEqual(60);
    }
  });
});

// ---------------------------------------------------------------------------
// AUTH W0 D5 — landing/invite key voice locks (#263 / #219 / #141 / #139)
// ---------------------------------------------------------------------------
//
// Pin the four new D1 strings exactly. Changing a value requires updating
// this test intentionally (Override H).
//
// Anti-tell denylist runs ONLY on the landing/invite keys — NOT the full
// AUTH_COPY object — because signUpButton / createAccountLink are legitimate
// explicit sign-up affordances on the login surface and must not be failed.

describe("AUTH_COPY — W0 D1 landing/invite voice locks", () => {
  // -------------------------------------------------------------------------
  // Exact-match pins
  // -------------------------------------------------------------------------

  it("landingInviteAffordance is voice-locked to the spec-mandated string", () => {
    expect(AUTH_COPY.landingInviteAffordance).toBe(
      "Got a link from a friend? Tap it — that's your way in.",
    );
  });

  it("ogCard is voice-locked to the spec-mandated string (literal placeholders)", () => {
    // Consumers interpolate {Trip} and {dates} — the template itself is pinned.
    expect(AUTH_COPY.ogCard).toBe("You're invited — {Trip} · {dates}.");
  });

  it("inviteH1 is voice-locked to the spec-mandated string (literal {Host} placeholder)", () => {
    expect(AUTH_COPY.inviteH1).toBe("{Host} wants you on this one.");
  });

  it("inviteH1Fallback is voice-locked to the spec-mandated string", () => {
    expect(AUTH_COPY.inviteH1Fallback).toBe("You're on the list.");
  });

  // -------------------------------------------------------------------------
  // Anti-tell denylist — surface-specific tells ONLY on landing/invite keys
  // -------------------------------------------------------------------------
  //
  // Rationale for the key whitelist: signUpButton ("Create account") and
  // createAccountLink ("Create account instead") are deliberate explicit
  // sign-up affordances on the /login form — they must NOT be flagged.
  // We test only the keys this wave authors.

  const LANDING_INVITE_KEYS = [
    "landingInviteAffordance",
    "ogCard",
    "inviteH1",
    "inviteH1Fallback",
  ] as const;

  const BANNED_SUBSTRINGS = [
    "welcome back",
    "get started",
    "sign up",
    "create account",
    "don't miss out",
    "join now",
    "join the trip",
    "rsvp now",
    "claim your spot",
    "complete your profile",
    "you're almost there",
    "let's make memories",
    "get pumped",
    "spots left",
    "top responders",
    "first to rsvp",
    "crew",
    "% responded",
    "of 8",
    "x of y going",
  ] as const;

  it("landing/invite keys contain no banned anti-tell substrings", () => {
    for (const key of LANDING_INVITE_KEYS) {
      const val = (AUTH_COPY[key] as string).toLowerCase();
      for (const banned of BANNED_SUBSTRINGS) {
        expect(
          val,
          `AUTH_COPY.${key} must not contain "${banned}"`,
        ).not.toContain(banned);
      }
    }
  });

  it("landing/invite keys contain no progress/completion-score patterns", () => {
    // Regex guards: "% responded", "of <digit>" (e.g. "of 8"), "X of Y going"
    const progressPatterns = [
      /\d+\s*%\s*responded/i,
      /\bof\s+\d+\b/i,
      /\bx\s+of\s+y\b/i,
    ];
    for (const key of LANDING_INVITE_KEYS) {
      const val = AUTH_COPY[key] as string;
      for (const pattern of progressPatterns) {
        expect(
          pattern.test(val),
          `AUTH_COPY.${key} must not match progress pattern ${pattern}`,
        ).toBe(false);
      }
    }
  });

  it("landing/invite keys contain no required-field asterisk", () => {
    for (const key of LANDING_INVITE_KEYS) {
      const val = AUTH_COPY[key] as string;
      expect(val, `AUTH_COPY.${key} must not contain an asterisk`).not.toContain("*");
    }
  });

  it("all landing/invite keys are under 200 chars", () => {
    for (const key of LANDING_INVITE_KEYS) {
      const val = AUTH_COPY[key] as string;
      expect(
        val.length,
        `AUTH_COPY.${key} must be under 200 chars, got ${val.length}`,
      ).toBeLessThanOrEqual(200);
    }
  });
});
