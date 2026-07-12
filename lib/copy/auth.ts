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

  // ---------------------------------------------------------------------------
  // Login page — W1b D1 (#122 login keys)
  // ---------------------------------------------------------------------------

  /**
   * H1 heading on the /login page card.
   * "Sign in" — plain, action-oriented, passes the pre-trip dinner test.
   * Matches the existing signInButton string for visual unity.
   * NOT "Welcome back" (sycophantic), NOT "Log in" (less idiomatic), NOT
   * "Get started" (SaaS-coded).
   */
  loginPageTitle: "Sign in",

  // ---------------------------------------------------------------------------
  // Landing / invite keys — W0 D1 (#263 / #219 pre-seed; consumed by W1 / W2)
  // ---------------------------------------------------------------------------

  /**
   * Occasion-framed affordance on the landing page for a fresh invitee
   * arriving cold. NO account language ("sign up" / "create account").
   * Consumers: app/page.tsx (W1, #263).
   */
  landingInviteAffordance: "Got a link from a friend? Tap it — that's your way in.",

  /**
   * OG card description template for the invite preview image.
   * Consumers interpolate {Trip} and {dates} — literal placeholders here.
   * Falls back to a generic card when either field is null/empty.
   * Consumers: app/invite/[token]/opengraph-image.tsx (W2, #219).
   */
  ogCard: "You're invited — {Trip} · {dates}.",

  /**
   * og:title template for the invite preview page's generateMetadata
   * (#402). Interpolates {Trip} (sanitized + ~40-char clamp — same #219
   * injection-guard pipeline as ogCard). The og:description is composed
   * from the date range + inviteH1; no separate template needed.
   * Consumers: lib/og/invite-card.ts `buildInviteMetadata`.
   */
  ogInviteTitle: "You're invited — {Trip}",

  /**
   * Primary H1 for the invite preview page.
   * Consumer interpolates {Host} (~30-char clamp + ellipsis).
   * Used when host is non-null and host !== trip celebrant name.
   * Consumers: app/invite/[token]/page.tsx (W2, #219).
   */
  inviteH1: "{Host} wants you on this one.",

  /**
   * Fallback H1 when host is null/empty OR host === celebrant name
   * (avoids "Dave wants you on Dave's Bender" self-reference).
   * Consumers: app/invite/[token]/page.tsx (W2, #219).
   */
  inviteH1Fallback: "You're on the list.",

  // ---------------------------------------------------------------------------
  // Invite surface — create-account-first (2026-07-11 incident fix)
  // ---------------------------------------------------------------------------
  //
  // The invite surface's most common persona is a never-seen invitee, so the
  // password step leads with create-account voice. The old surface rendered
  // "Sign in to join" + a "Sign in" primary above create-account helper text —
  // crossed labels that walked brand-new invitees into the sign-in branch.
  // These headers live INSIDE <LoginForm> (inviteSurface only) so they can
  // follow the create/sign-in intent toggle; /login is unaffected.

  /** Header above the inline invite form while creating an account (default). */
  inviteAuthHeaderCreate: "Make an account to join",
  /** Header above the inline invite form after "Have an account? Sign in". */
  inviteAuthHeaderSignIn: "Sign in to join",
  /** Secondary toggle on the invite surface: create intent → sign-in intent. */
  inviteHaveAccountToggle: "Have an account? Sign in",
} as const;

export type AuthCopyKey = keyof typeof AUTH_COPY;
