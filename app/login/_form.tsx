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

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_COPY } from "@/lib/copy/auth";
import { isGoogleOAuthEnabled } from "@/lib/auth/oauth-config";
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
import { cn } from "@/lib/utils";
import {
  type Mode,
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
   * #395: on the invite surface the most common persona is a never-seen
   * invitee, so reveal "Create account instead" from the start (in password
   * mode) rather than only after a guaranteed wrong-password dead-end. Safe
   * to disclose here — the invite already discloses account existence via
   * the code path, so this adds no new enumeration surface. Off (login page
   * default) keeps the sign-in-first, post-wrong-password reveal.
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
  const [isPending, startTransition] = useTransition();

  // #395: on the invite surface, the create-account affordance is present
  // from the start of password mode (not gated on a prior wrong-password
  // error) so a first-touch invitee isn't handed a guaranteed dead-end.
  const revealCreateAccount = showCreateAccount || inviteSurface;

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

  // Starts a Google OAuth round-trip. The server returns a URL; we navigate there.
  const handleGoogleSignIn = () => {
    setServerError(null);
    startTransition(async () => {
      const result = await signInWithOAuthAction({ provider: "google", next });
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
      const result = await signInWithPasswordAction({
        email: values.email,
        password: values.password,
      });
      if (result.ok) {
        window.location.href = next ?? "/trips";
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
      const result = await requestEmailCode(email);
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
      const result = await verifyEmailCodeAction({
        email: values.email,
        token: values.token,
      });
      if (result.ok) {
        window.location.href = next ?? "/trips";
        return;
      }
      setServerError(result.errorKey);
    });
  });

  const handleCreateAccount = () => {
    const password = passwordForm.getValues("password");
    setServerError(null);
    setShowCreateAccount(false);
    startTransition(async () => {
      const result = await signUpAction({ email, password });
      if (result.ok) {
        window.location.href = next ?? "/trips";
        return;
      }
      setServerError(result.errorKey);
    });
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

  if (mode === "email-only") {
    return (
      <div className="flex flex-col gap-3">
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
        <form onSubmit={handleSignIn} noValidate className="flex flex-col gap-3">
          {hiddenUsernameField}
          <p className="text-muted-foreground text-sm">{email}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">{AUTH_COPY.passwordFieldLabel}</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
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
            {revealCreateAccount ? (
              <p className="text-muted-foreground text-xs">{AUTH_COPY.passwordHelper}</p>
            ) : null}
          </div>
          <ErrorNote id="login-error" message={inlineError} />
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? <PendingSpinner /> : <span>{AUTH_COPY.signInButton}</span>}
          </Button>
          {revealCreateAccount ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={handleCreateAccount}
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
