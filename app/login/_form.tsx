"use client";

/**
 * `<LoginForm />` — progressive-disclosure auth form (M5/PR2).
 *
 * 4-mode state machine (types + schemas extracted to `_form-state.ts`):
 *   email-only  → user enters email, clicks Continue
 *   password    → user enters password (+ show/hide toggle) or clicks
 *                 "Email me a code instead"
 *   code-verify → user enters 6-digit code received by email
 *
 * UX notes (Phase 4 audit O3 — no best-effort email-existence probe):
 *   - Never hits the backend on email blur to check if the account exists.
 *   - "Continue" always advances to password mode. The user picks their
 *     path: sign-in password, code fallback, or create-account-after-
 *     wrong-password.
 *   - "Create account instead" surfaces only after a wrong-password error —
 *     no separate sign-up tab, no extra flow.
 *   - Hidden `username` field for iOS keychain pairing.
 *
 * Strings: all from AUTH_COPY (lib/copy/auth.ts) and ERRORS
 * (lib/copy/errors.ts). No inline JSX text literals.
 *
 * Tests: tests/unit/login-form.test.tsx (Override C — never under app/).
 */

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_COPY } from "@/lib/copy/auth";
import { isGoogleOAuthEnabled } from "@/lib/auth/oauth-config";
import { safeNext } from "@/lib/auth/safe-next";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import {
  signInWithPasswordAction,
  signUpAction,
  verifyEmailCodeAction,
  requestEmailCode,
  signInWithOAuthAction,
} from "@/app/login/actions";
import {
  ERROR_SURFACE_CLASS,
  ERROR_SURFACE_BORDER_STYLE,
} from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { cn } from "@/lib/utils";
import {
  type Mode,
  type AuthIntent,
  type EmailOnlyValues,
  type PasswordValues,
  type CodeValues,
  emailOnlySchema,
  passwordSchema,
  codeSchema,
} from "@/app/login/_form-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginFormProps = {
  /** Redirect target after successful sign-in. Defaults to /trips. */
  next?: string;
  /**
   * #395 + 2026-07-11 incident #5: on the invite surface the most common
   * persona is a never-seen invitee, so the password step leads with
   * CREATE-ACCOUNT voice (header, primary button, new-password
   * autocomplete) — "Have an account? Sign in" toggles to the sign-in
   * branch, and "Email me a code instead" stays as a tertiary link. Safe
   * to disclose here — the invite already discloses account existence via
   * the code path, so this adds no new enumeration surface. Off (login
   * page default) keeps the sign-in-first, post-wrong-password reveal.
   */
  inviteSurface?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginForm({ next, inviteSurface = false }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>("email-only");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  // Invite surface leads with create-account (see LoginFormProps note);
  // /login always leads with sign-in.
  const [authIntent, setAuthIntent] = useState<AuthIntent>(
    inviteSurface ? "create" : "sign-in",
  );
  const [isPending, startTransition] = useTransition();

  // #395: on the invite surface, the create-account affordance is present
  // from the start of password mode (not gated on a prior wrong-password
  // error) so a first-touch invitee isn't handed a guaranteed dead-end.
  const revealCreateAccount = showCreateAccount || inviteSurface;

  // Password mode leads with the create-account affordance only on the
  // invite surface while the user hasn't toggled to sign-in.
  const createMode = inviteSurface && authIntent === "create";

  const emailForm = useForm<EmailOnlyValues>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { email: "", token: "" },
    mode: "onSubmit",
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  // Every awaited server action funnels through `callAction`
  // (lib/ui/call-action.ts — the shared #431 guard, extracted from the
  // local runAction wrapper PR #430 added here). A middleware-edge 429
  // (raw JSON, not an action result) or a network drop REJECTS the await
  // inside startTransition — without the guard the rejection is swallowed
  // and the button silently does nothing (2026-07-11 incident #4). On
  // rejection the helper resolves to the "network" envelope so the user
  // always gets a signal.

  // Starts a Google OAuth round-trip. The server returns a URL; we navigate there.
  const handleGoogleSignIn = () => {
    setServerError(null);
    startTransition(async () => {
      const result = await callAction(() =>
        signInWithOAuthAction({ provider: "google", next })
      );
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      setServerError(result.errorKey);
    });
  };

  const handleEmailContinue = emailForm.handleSubmit((values) => {
    setServerError(null);
    setShowCreateAccount(false);
    setEmail(values.email);
    passwordForm.setValue("email", values.email);
    codeForm.setValue("email", values.email);
    setMode("password");
  });

  const handleSignIn = passwordForm.handleSubmit((values) => {
    setServerError(null);
    setShowCreateAccount(false);
    startTransition(async () => {
      const result = await callAction(() =>
        signInWithPasswordAction({
          email: values.email,
          password: values.password,
        })
      );
      if (result.ok) {
        // Re-validated client-side (belt-and-braces, #438): `next` already
        // passed through safeNext server-side wherever it was minted, but
        // this is the actual navigation sink — same guard the server uses,
        // applied again at the point of use.
        window.location.href = safeNext(next ?? null);
        return;
      }
      setServerError(result.errorKey);
      if (result.errorKey === "auth_wrong_password") {
        setShowCreateAccount(true);
      }
      // TODO(M5-followup): when signInWithPassword can return
      // auth_email_taken_oauth (currently the detection isn't wired —
      // see follow-up issue), branch to show the OAuth-existing-user
      // prompt here. The UI scaffolding was stripped from PR5 to avoid
      // dead-code wiring; the copy keys remain in lib/copy/auth.ts.
    });
  });

  const handleEmailMeCode = () => {
    setServerError(null);
    setShowCreateAccount(false);
    startTransition(async () => {
      const result = await callAction(() => requestEmailCode(email, next));
      if (result.ok) {
        codeForm.setValue("email", email);
        setMode("code-verify");
        return;
      }
      setServerError(result.errorKey);
      // No account for that email — codes don't create users. Reveal the
      // "Create account instead" affordance so the error message is
      // actionable (sign-up is password-first per the M5 invite decision).
      if (result.errorKey === "auth_no_account") {
        setShowCreateAccount(true);
      }
    });
  };

  const handleVerifyCode = codeForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await callAction(() =>
        verifyEmailCodeAction({
          email: values.email,
          token: values.token,
        })
      );
      if (result.ok) {
        // Re-validated client-side (belt-and-braces, #438): `next` already
        // passed through safeNext server-side wherever it was minted, but
        // this is the actual navigation sink — same guard the server uses,
        // applied again at the point of use.
        window.location.href = safeNext(next ?? null);
        return;
      }
      setServerError(result.errorKey);
    });
  });

  // Create-account submit — the primary in invite create mode, the
  // post-wrong-password secondary on /login. handleSubmit gives the
  // password field client-side zod validation (6+ chars) on both paths.
  // `next` rides along so the confirmation email (if the env gates on
  // confirm) round-trips back to the invite, not the empty dashboard.
  const handleCreateAccount = passwordForm.handleSubmit((values) => {
    setServerError(null);
    setShowCreateAccount(false);
    startTransition(async () => {
      const result = await callAction(() =>
        signUpAction({
          email: values.email,
          password: values.password,
          next,
        })
      );
      if (result.ok) {
        // Re-validated client-side (belt-and-braces, #438): `next` already
        // passed through safeNext server-side wherever it was minted, but
        // this is the actual navigation sink — same guard the server uses,
        // applied again at the point of use.
        window.location.href = safeNext(next ?? null);
        return;
      }
      setServerError(result.errorKey);
      // Already registered (PR #430 review MEDIUM — the incident's retry
      // cohort now HAS accounts and re-taps the invite into create mode).
      // Don't just tell them to sign in — put them there: flip the invite
      // surface to the sign-in branch (email kept, labels/autocomplete flip
      // with the intent). Focus lands via the effect below once the
      // transition settles — the field is still disabled (isPending) here.
      if (result.errorKey === "auth_account_exists" && inviteSurface) {
        setAuthIntent("sign-in");
      }
    });
  });

  // After the account-exists flip, put the cursor in the password field for
  // the sign-in retype. Can't focus inside the transition callback: the
  // input is disabled while isPending, so setFocus there is a no-op and
  // focus stays on the clicked submit button.
  useEffect(() => {
    if (
      !isPending &&
      inviteSurface &&
      serverError === "auth_account_exists" &&
      authIntent === "sign-in"
    ) {
      passwordForm.setFocus("password");
    }
  }, [isPending, inviteSurface, serverError, authIntent, passwordForm]);

  // Invite-surface intent toggles ("Have an account? Sign in" ⇄ "Create
  // account instead"). Pure local state — no server call.
  const handleSwitchToSignIn = () => {
    setServerError(null);
    setAuthIntent("sign-in");
  };
  const handleSwitchToCreate = () => {
    setServerError(null);
    setAuthIntent("create");
  };

  // -------------------------------------------------------------------------
  // Inline error — one at a time, validation wins over server error
  // -------------------------------------------------------------------------

  const inlineError = deriveInlineError(mode, {
    emailError: emailForm.formState.errors.email?.message,
    passwordError: passwordForm.formState.errors.password?.message,
    tokenError: codeForm.formState.errors.token?.message,
    serverError,
  });

  // iOS Keychain hint — pairs the password with the email in Keychain
  const hiddenUsernameField = email ? (
    <input
      type="email"
      name="username"
      autoComplete="username"
      hidden
      value={email}
      readOnly
    />
  ) : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Invite-only header — follows the create/sign-in intent so the label
  // above the form always matches the primary button below it (the
  // 2026-07-11 crossed-labels fix). Replaces the static "Sign in to join"
  // the invite page used to render above this form.
  const inviteHeader = inviteSurface ? (
    <p className="text-sm text-muted-foreground">
      {authIntent === "create"
        ? AUTH_COPY.inviteAuthHeaderCreate
        : AUTH_COPY.inviteAuthHeaderSignIn}
    </p>
  ) : null;

  if (mode === "email-only") {
    return (
      <div className="flex flex-col gap-3">
        {inviteHeader}
        <form onSubmit={handleEmailContinue} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-email">{AUTH_COPY.emailFieldLabel}</Label>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={emailForm.formState.errors.email ? "true" : undefined}
              aria-describedby={inlineError ? "login-error" : undefined}
              disabled={isPending}
              {...emailForm.register("email")}
            />
          </div>
          <ErrorNote id="login-error" message={inlineError} />
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? <PendingSpinner /> : <span>{AUTH_COPY.continueButton}</span>}
          </Button>
        </form>
        {/* H3 ordering: Google button is BELOW the primary CTA — OTP-as-floor first.
            #370: hidden until the Supabase provider is enabled (see lib/auth/oauth-config). */}
        {isGoogleOAuthEnabled() && (
          <GoogleButton onClick={handleGoogleSignIn} disabled={isPending} />
        )}
      </div>
    );
  }

  if (mode === "password") {
    return (
      <div className="flex flex-col gap-3">
        {inviteHeader}
        <form
          onSubmit={createMode ? handleCreateAccount : handleSignIn}
          noValidate
          className="flex flex-col gap-3"
        >
          {hiddenUsernameField}
          <p className="text-muted-foreground text-sm">{email}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">{AUTH_COPY.passwordFieldLabel}</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                // new-password while creating (keychain offers to save a
                // fresh credential), current-password while signing in —
                // crossed values misdirect password managers (incident #5).
                autoComplete={createMode ? "new-password" : "current-password"}
                aria-invalid={
                  passwordForm.formState.errors.password ? "true" : undefined
                }
                aria-describedby={inlineError ? "login-error" : undefined}
                disabled={isPending}
                {...passwordForm.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center px-1 text-xs text-muted-foreground"
                aria-label={
                  showPassword
                    ? AUTH_COPY.togglePasswordHide
                    : AUTH_COPY.togglePasswordShow
                }
              >
                {showPassword ? AUTH_COPY.togglePasswordHide : AUTH_COPY.togglePasswordShow}
              </button>
            </div>
            {/* Pick-a-password helper belongs to the CREATE affordance only —
                under a "Sign in" primary it reads as crossed labels
                (incident #5). On /login it appears with the post-wrong-
                password create reveal, as before. */}
            {createMode || (!inviteSurface && showCreateAccount) ? (
              <p className="text-muted-foreground text-xs">{AUTH_COPY.passwordHelper}</p>
            ) : null}
          </div>
          <ErrorNote id="login-error" message={inlineError} />
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? (
              <PendingSpinner />
            ) : (
              <span>
                {createMode ? AUTH_COPY.signUpButton : AUTH_COPY.signInButton}
              </span>
            )}
          </Button>
          {createMode ? (
            // Secondary: returning invitee escapes to the sign-in branch.
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={handleSwitchToSignIn}
            >
              {AUTH_COPY.inviteHaveAccountToggle}
            </Button>
          ) : revealCreateAccount ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              // On the invite surface this toggles the primary back to
              // create (labels flip with it); on /login it submits the
              // sign-up directly, as before.
              onClick={inviteSurface ? handleSwitchToCreate : handleCreateAccount}
            >
              {AUTH_COPY.createAccountLink}
            </Button>
          ) : null}
          {/* H3 ordering: OTP link is floor (universal); Google button is above OTP */}
          <button
            type="button"
            onClick={handleEmailMeCode}
            disabled={isPending}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {AUTH_COPY.emailMeCodeLink}
          </button>
        </form>
        {/* H3 ordering: Google button BELOW the "Email me a code" link.
            #370: hidden until the Supabase provider is enabled (see lib/auth/oauth-config). */}
        {isGoogleOAuthEnabled() && (
          <GoogleButton onClick={handleGoogleSignIn} disabled={isPending} />
        )}
      </div>
    );
  }

  // code-verify mode
  return (
    <form onSubmit={handleVerifyCode} noValidate className="flex flex-col gap-3">
      {hiddenUsernameField}
      <p className="text-muted-foreground text-sm">{AUTH_COPY.codeSentHelper(email)}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-code">{AUTH_COPY.codeFieldLabel}</Label>
        <Input
          id="login-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={codeForm.formState.errors.token ? "true" : undefined}
          aria-describedby={inlineError ? "login-error" : undefined}
          disabled={isPending}
          {...codeForm.register("token")}
        />
      </div>
      <ErrorNote id="login-error" message={inlineError} />
      <Button type="submit" disabled={isPending} aria-busy={isPending}>
        {isPending ? <PendingSpinner /> : <span>{AUTH_COPY.verifyCodeButton}</span>}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function deriveInlineError(
  mode: Mode,
  {
    emailError,
    passwordError,
    tokenError,
    serverError,
  }: {
    emailError: string | undefined;
    passwordError: string | undefined;
    tokenError: string | undefined;
    serverError: ErrorKey | null;
  },
): string | null {
  const serverMsg = serverError ? ERRORS[serverError] : null;
  if (mode === "email-only") return emailError ?? serverMsg;
  if (mode === "password") return passwordError ?? serverMsg;
  if (mode === "code-verify") return tokenError ?? serverMsg;
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ErrorNote({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn(ERROR_SURFACE_CLASS, "px-3 py-2 text-xs")}
      style={ERROR_SURFACE_BORDER_STYLE}
    >
      {message}
    </p>
  );
}

function PendingSpinner() {
  return (
    <>
      <Loader2
        data-slot="spinner"
        className="size-4 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      <span>...</span>
    </>
  );
}

/**
 * "Continue with Google" — muted outline button (H3: OTP-as-floor first,
 * Google-as-affordance second; visually distinct from the primary CTA).
 * Copy sourced from AUTH_COPY — no inline JSX literals (Phase 4 C5).
 */
function GoogleButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-muted-foreground"
    >
      {AUTH_COPY.continueWithGoogleButton}
    </Button>
  );
}

// (M5-followup) OAuth-existing-user alert removed from PR5 — the server-side
// detection it depends on was never wired. The copy keys remain in
// lib/copy/auth.ts so a follow-up PR can re-introduce the component once
// `signInWithPasswordAction` learns to return `auth_email_taken_oauth`.
