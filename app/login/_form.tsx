"use client";

/**
 * `<LoginForm />` — progressive-disclosure auth form (M5/PR2).
 *
 * 4-mode state machine:
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
 *   - Hidden `username` field for iOS keychain pairing (pairs password with
 *     the email in Keychain).
 *
 * Strings: all from AUTH_COPY (lib/copy/auth.ts) and ERRORS
 * (lib/copy/errors.ts). No inline JSX literals beyond pure scaffolding
 * (e.g. aria-label on the show/hide toggle — those are inline by convention).
 *
 * Tests: tests/unit/login-form.test.tsx (Override C — never under app/).
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_COPY } from "@/lib/copy/auth";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import {
  signInWithPasswordAction,
  signUpAction,
  verifyEmailCodeAction,
  requestEmailCode,
} from "@/app/login/actions";

// ---------------------------------------------------------------------------
// Local schemas (client-side validation, mirrors server-side)
// ---------------------------------------------------------------------------

const emailOnlySchema = z.object({
  email: z
    .string()
    .min(1, { message: ERRORS.validation_failed })
    .email({ message: ERRORS.validation_failed }),
});

const passwordSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(6, { message: ERRORS.validation_failed }),
});

const codeSchema = z.object({
  email: z.string().email(),
  token: z
    .string()
    .length(6, { message: ERRORS.validation_failed })
    .regex(/^\d{6}$/, { message: ERRORS.validation_failed }),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "email-only" | "password" | "code-verify";

type EmailOnlyValues = z.infer<typeof emailOnlySchema>;
type PasswordValues = z.infer<typeof passwordSchema>;
type CodeValues = z.infer<typeof codeSchema>;

type LoginFormProps = {
  /** Redirect target after successful sign-in. Defaults to /trips. */
  next?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginForm({ next }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>("email-only");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Each mode gets its own react-hook-form instance. They're independent so
  // switching modes doesn't carry over stale validation state.
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
        // Redirect to next or default
        window.location.href = next ?? "/trips";
        return;
      }
      setServerError(result.errorKey);
      if (result.errorKey === "auth_wrong_password") {
        setShowCreateAccount(true);
      }
    });
  });

  const handleEmailMeCode = () => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestEmailCode(email);
      if (result.ok) {
        codeForm.setValue("email", email);
        setMode("code-verify");
        return;
      }
      setServerError(result.errorKey);
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
  // Inline error message — one at a time, validation wins over server error
  // -------------------------------------------------------------------------

  const inlineError = (() => {
    if (mode === "email-only") {
      return (
        emailForm.formState.errors.email?.message ??
        (serverError ? ERRORS[serverError] : null)
      );
    }
    if (mode === "password") {
      return (
        passwordForm.formState.errors.password?.message ??
        (serverError ? ERRORS[serverError] : null)
      );
    }
    if (mode === "code-verify") {
      return (
        codeForm.formState.errors.token?.message ??
        (serverError ? ERRORS[serverError] : null)
      );
    }
    return null;
  })();

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Hidden username field for iOS Keychain — pairs the password with the
  // email address so Keychain offers to save/fill it correctly.
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

  if (mode === "email-only") {
    return (
      <form
        onSubmit={handleEmailContinue}
        noValidate
        className="flex flex-col gap-3"
      >
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
            aria-invalid={
              emailForm.formState.errors.email ? "true" : undefined
            }
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
    );
  }

  if (mode === "password") {
    return (
      <form
        onSubmit={handleSignIn}
        noValidate
        className="flex flex-col gap-3"
      >
        {hiddenUsernameField}

        {/* Email is locked — shown as read-only context */}
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
              aria-label={showPassword ? AUTH_COPY.togglePasswordHide : AUTH_COPY.togglePasswordShow}
            >
              {showPassword ? AUTH_COPY.togglePasswordHide : AUTH_COPY.togglePasswordShow}
            </button>
          </div>
          <p className="text-muted-foreground text-xs">
            {AUTH_COPY.passwordHelper}
          </p>
        </div>

        <ErrorNote id="login-error" message={inlineError} />

        <Button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending ? <PendingSpinner /> : <span>{AUTH_COPY.signInButton}</span>}
        </Button>

        {showCreateAccount ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={handleCreateAccount}
          >
            {AUTH_COPY.createAccountLink}
          </Button>
        ) : null}

        <button
          type="button"
          onClick={handleEmailMeCode}
          disabled={isPending}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {AUTH_COPY.emailMeCodeLink}
        </button>
      </form>
    );
  }

  // code-verify mode
  return (
    <form
      onSubmit={handleVerifyCode}
      noValidate
      className="flex flex-col gap-3"
    >
      {hiddenUsernameField}

      <p className="text-muted-foreground text-sm">
        {AUTH_COPY.codeSentHelper(email)}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-code">{AUTH_COPY.codeFieldLabel}</Label>
        <Input
          id="login-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={
            codeForm.formState.errors.token ? "true" : undefined
          }
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
// Sub-components
// ---------------------------------------------------------------------------

function ErrorNote({
  id,
  message,
}: {
  id: string;
  message: string | null;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs"
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
