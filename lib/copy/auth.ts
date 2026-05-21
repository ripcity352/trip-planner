/**
 * Auth-specific copy palette — every string in the login/signup/code flow
 * sources from here, never from inline JSX literals.
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?"
 * Warm, specific, blame-free. Anti-SaaS — no "Please enter your email
 * address", no "Password is required", no "Authentication failed".
 *
 * Shape mirrors `lib/copy/legal.ts` — exported const + type.
 *
 * When adding a key:
 *   1. Add it to `AUTH_COPY`.
 *   2. Read it aloud once. If it sounds like a SaaS onboarding email, rewrite.
 *   3. No HTML in values — plain text only (except `codeSentHelper` which is
 *      a function returning a plain string, not JSX).
 *
 * Voice-locked per Override H — strings pinned in
 * lib/copy/__tests__/auth.test.ts. Change here = change everywhere.
 */

export const AUTH_COPY = {
  // ---------------------------------------------------------------------------
  // Field labels
  // ---------------------------------------------------------------------------
  emailFieldLabel: "Email",
  passwordFieldLabel: "Password",
  codeFieldLabel: "6-digit code",

  // ---------------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------------
  continueButton: "Continue",
  signInButton: "Sign in",
  /** Shown after a wrong-password attempt reveals the user may not have an account */
  signUpButton: "Create account",
  sendCodeButton: "Email me a code",
  verifyCodeButton: "Verify",
  togglePasswordShow: "Show",
  togglePasswordHide: "Hide",

  // ---------------------------------------------------------------------------
  // Helpers / inline hints
  // ---------------------------------------------------------------------------
  passwordHelper: "6+ characters. Make it something you'll remember.",
  /** Returns "Code's heading to <email>. Pop it in below." */
  codeSentHelper: (email: string) =>
    `Code's heading to ${email}. Pop it in below.`,
  emailMeCodeLink: "Email me a code instead",
  /** Small affordance after wrong-password — lets user pivot to sign-up */
  createAccountLink: "Create account instead",

  // ---------------------------------------------------------------------------
  // Alert / success states
  // ---------------------------------------------------------------------------
  codeSentSuccess: "Code on its way.",
  signupSuccess: "You're in.",
} as const;

export type AuthCopyKey = keyof typeof AUTH_COPY;
