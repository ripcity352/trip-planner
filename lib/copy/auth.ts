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

  // ---------------------------------------------------------------------------
  // Account: Sign-in & security (M5/PR4)
  // ---------------------------------------------------------------------------
  /** Page heading */
  accountSecurity_title: "Sign-in & security",
  /** Current-password field label */
  accountSecurity_currentPasswordLabel: "Current password",
  /** New-password field label */
  accountSecurity_newPasswordLabel: "New password",
  /** Helper copy for State A (password identity only — no OAuth) */
  accountSecurity_helperA: "6+ characters. Make it something you'll actually remember.",
  /**
   * Helper copy for State A+ (password + OAuth identities).
   * Mentions that OAuth sign-in is also wired — full OAuth management lands in PR5.
   */
  // TODO(M5/PR5): provider-aware copy when OAuth choices expand beyond Google.
  accountSecurity_helperAPlus:
    "You're signed in with a password and Google. You can change your password here — Google sign-in stays active either way.",
  /** Inline link that triggers the OTP recovery sub-flow (State C) */
  accountSecurity_forgotCurrentLink: "Forgot your current password? Email me a code instead",
  /** Primary CTA button: save new password */
  accountSecurity_changeButton: "Update password",
  /** Success toast after password change (other sessions revoked) */
  accountSecurity_successToast: "Password updated. Other devices were signed out.",
  /** Code field label used in the State C OTP step */
  accountSecurity_codeFieldLabel: "6-digit code",
  /** Cancel link in State C (returns to A) */
  accountSecurity_cancelLink: "Never mind — go back",
  /** Nav link on the /me tab pointing to this page */
  accountSecurity_meNavLink: "Sign-in & security",
  /**
   * Stub copy when user has no password identity (PR5 builds State B).
   * @deprecated Remove once State B is fully wired — no longer rendered.
   */
  accountSecurity_noPasswordStub:
    "Set a password for your Google sign-in — coming soon.",
  /** Step 1 helper for State C: confirm code is on its way */
  accountSecurity_codeRequestHelper: (email: string) =>
    `Code's heading to ${email}. Enter it to reset your password.`,
  /** Step 3 heading for State C: set new password after OTP verified */
  accountSecurity_setNewPasswordTitle: "Set a new password",

  // ---------------------------------------------------------------------------
  // Google OAuth sign-in (M5/PR5)
  // ---------------------------------------------------------------------------

  /** Button label for Google OAuth sign-in on /login */
  continueWithGoogleButton: "Continue with Google",

  /**
   * Alert text shown on /login when wrong-password fires against an
   * account that only has a Google (OAuth) identity.
   * Voice test: warm, specific, blame-free. Not corporate.
   */
  oauth_account_prompt_text:
    "You signed up with Google. Sign in with Google, or get a code emailed instead?",
  /** First action button in the OAuth-existing-user alert */
  oauth_account_prompt_google_button: "Sign in with Google",
  /** Second action button in the OAuth-existing-user alert */
  oauth_account_prompt_code_button: "Get a code emailed instead",

  // ---------------------------------------------------------------------------
  // State B — set password for OAuth-only or OTP-only users (M5/PR5)
  // ---------------------------------------------------------------------------

  /** Page heading for State B (no current password to rotate — first set) */
  accountSecurity_stateB_title: "Add a password",

  /**
   * Helper copy for OAuth-only users setting a password for the first time.
   * Voice: reassuring, explains what signing-in with Google continues to work.
   */
  accountSecurity_stateB_helperOauthOnly:
    "You currently sign in with Google. Add a password and you can use either — Google sign-in stays active.",

  /**
   * Helper copy for OTP-only users (no OAuth, no password) setting a password.
   * Voice: explains they can use code OR password going forward.
   */
  accountSecurity_stateB_helperOtpOnly:
    "You currently sign in with a code. Add a password and you can use either one.",

  /** Primary CTA button for State B: save the first-ever password */
  accountSecurity_stateB_setButton: "Set password",
} as const;

export type AuthCopyKey = keyof typeof AUTH_COPY;
