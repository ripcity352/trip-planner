"use client";

/**
 * <SecurityForm /> — /account/sign-in-and-security client component (M5/PR4).
 *
 * State machine driven by `FormMode` (types in _form-state.ts):
 *   change-password  → State A / A+: current + new password fields
 *   C-requesting     → clicking "forgot" triggers requestEmailCode
 *   C-verify         → 6-digit OTP code entry
 *   C-set            → new-password entry after OTP verified (no current-pass)
 *   success          → password updated toast
 *
 * IdentityState is passed as a prop from the server component:
 *   "A"          — password only → standard A form
 *   "A+"         — password + OAuth → same form, extra helper copy
 *   "no-password" → stub (PR5 builds State B)
 *
 * Strings: ALL from AUTH_COPY (lib/copy/auth.ts) or ERRORS (lib/copy/errors.ts).
 *   No inline JSX text literals.
 *
 * Email-pinning: the userEmail prop is sourced from auth.getUser() in the
 *   server component. The form never submits an email field — the server
 *   action pins email from the session, not from form payload. The hidden
 *   username field (iOS Keychain pairing) uses the server-provided email.
 *
 * Tests: tests/unit/account-sign-in-and-security.test.tsx (Override C).
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_COPY } from "@/lib/copy/auth";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { changePasswordAction, setPasswordAfterRecoveryAction } from "./actions";
import { requestEmailCode, verifyEmailCodeAction } from "@/app/login/actions";
import {
  type IdentityState,
  type FormMode,
  type ChangePasswordValues,
  type OtpCodeValues,
  type NewPasswordValues,
  changePasswordClientSchema,
  otpCodeClientSchema,
  newPasswordClientSchema,
} from "./_form-state";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SecurityFormProps = {
  identityState: IdentityState;
  /** Sourced from auth.getUser() in the server component — never from client state. */
  userEmail: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityForm({ identityState, userEmail }: SecurityFormProps) {
  const [mode, setMode] = useState<FormMode>("change-password");
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const changePasswordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordClientSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
    mode: "onSubmit",
  });

  const otpForm = useForm<OtpCodeValues>({
    resolver: zodResolver(otpCodeClientSchema),
    defaultValues: { token: "" },
    mode: "onSubmit",
  });

  const newPasswordForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordClientSchema),
    defaultValues: { newPassword: "" },
    mode: "onSubmit",
  });

  // -------------------------------------------------------------------------
  // Stub: no-password users (PR5 builds State B)
  // -------------------------------------------------------------------------

  if (identityState === "no-password") {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-6">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">
          {AUTH_COPY.accountSecurity_title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {AUTH_COPY.accountSecurity_noPasswordStub}
        </p>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleChangePassword = changePasswordForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      // NOTE: we do NOT pass email — the server action pins it from the session.
      const result = await changePasswordAction({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (result.ok) {
        setMode("success");
        return;
      }
      setServerError(result.errorKey);
    });
  });

  const handleForgotCurrentPassword = () => {
    setServerError(null);
    setMode("C-requesting");
    startTransition(async () => {
      // userEmail is server-sourced, safe to use here.
      const result = await requestEmailCode(userEmail);
      if (result.ok) {
        setMode("C-verify");
        return;
      }
      setServerError(result.errorKey);
      setMode("change-password");
    });
  };

  const handleVerifyCode = otpForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await verifyEmailCodeAction({
        email: userEmail,
        token: values.token,
      });
      if (result.ok) {
        setMode("C-set");
        return;
      }
      setServerError(result.errorKey);
    });
  });

  const handleSetNewPassword = newPasswordForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await setPasswordAfterRecoveryAction({
        newPassword: values.newPassword,
      });
      if (result.ok) {
        setMode("success");
        return;
      }
      setServerError(result.errorKey);
    });
  });

  const handleCancel = () => {
    setServerError(null);
    setMode("change-password");
    otpForm.reset();
    newPasswordForm.reset();
  };

  // -------------------------------------------------------------------------
  // Inline error derivation
  // -------------------------------------------------------------------------

  function resolveInlineError(): string | null {
    const serverMsg = serverError ? ERRORS[serverError] : null;
    if (mode === "change-password") {
      return (
        changePasswordForm.formState.errors.currentPassword?.message ??
        changePasswordForm.formState.errors.newPassword?.message ??
        serverMsg
      );
    }
    if (mode === "C-verify" || mode === "C-verifying") {
      return otpForm.formState.errors.token?.message ?? serverMsg;
    }
    if (mode === "C-set") {
      return newPasswordForm.formState.errors.newPassword?.message ?? serverMsg;
    }
    return serverMsg;
  }

  const inlineError = resolveInlineError();

  // iOS Keychain hint — pairs the password with the email from the session.
  const hiddenUsernameField = (
    <input
      type="email"
      name="username"
      autoComplete="username"
      hidden
      value={userEmail}
      readOnly
    />
  );

  // -------------------------------------------------------------------------
  // Page shell (shared)
  // -------------------------------------------------------------------------

  const pageTitle = (
    <h1 className="mb-6 text-2xl font-semibold tracking-tight">
      {AUTH_COPY.accountSecurity_title}
    </h1>
  );

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------

  if (mode === "success") {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-6">
        {pageTitle}
        <p
          role="status"
          data-testid="success-toast"
          className="rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-sm"
        >
          {AUTH_COPY.accountSecurity_successToast}
        </p>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // State C — step 1 requesting (loading)
  // -------------------------------------------------------------------------

  if (mode === "C-requesting") {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-6">
        {pageTitle}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>{AUTH_COPY.codeSentSuccess}</span>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // State C — step 2: OTP code entry
  // -------------------------------------------------------------------------

  if (mode === "C-verify" || mode === "C-verifying") {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-6">
        {pageTitle}
        {hiddenUsernameField}
        <form onSubmit={handleVerifyCode} noValidate className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {AUTH_COPY.accountSecurity_codeRequestHelper(userEmail)}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="security-otp-code">
              {AUTH_COPY.accountSecurity_codeFieldLabel}
            </Label>
            <Input
              id="security-otp-code"
              data-testid="otp-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-invalid={otpForm.formState.errors.token ? "true" : undefined}
              aria-describedby={inlineError ? "security-error" : undefined}
              disabled={isPending}
              {...otpForm.register("token")}
            />
          </div>
          <ErrorNote id="security-error" message={inlineError} />
          <Button
            type="submit"
            data-testid="verify-code-button"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? <PendingSpinner /> : <span>{AUTH_COPY.verifyCodeButton}</span>}
          </Button>
          <button
            type="button"
            data-testid="cancel-otp-recovery-link"
            onClick={handleCancel}
            disabled={isPending}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {AUTH_COPY.accountSecurity_cancelLink}
          </button>
        </form>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // State C — step 3: set new password after OTP verified
  // -------------------------------------------------------------------------

  if (mode === "C-set") {
    return (
      <section className="mx-auto w-full max-w-lg px-4 py-6">
        {pageTitle}
        {hiddenUsernameField}
        <form onSubmit={handleSetNewPassword} noValidate className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {AUTH_COPY.accountSecurity_setNewPasswordTitle}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="security-new-password">
              {AUTH_COPY.accountSecurity_newPasswordLabel}
            </Label>
            <div className="relative">
              <Input
                id="security-new-password"
                data-testid="new-password-input"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={
                  newPasswordForm.formState.errors.newPassword ? "true" : undefined
                }
                aria-describedby={inlineError ? "security-error" : undefined}
                disabled={isPending}
                {...newPasswordForm.register("newPassword")}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center px-1 text-xs text-muted-foreground"
                aria-label={
                  showNewPassword
                    ? AUTH_COPY.togglePasswordHide
                    : AUTH_COPY.togglePasswordShow
                }
              >
                {showNewPassword
                  ? AUTH_COPY.togglePasswordHide
                  : AUTH_COPY.togglePasswordShow}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{AUTH_COPY.accountSecurity_helperA}</p>
          </div>
          <ErrorNote id="security-error" message={inlineError} />
          <Button
            type="submit"
            data-testid="change-password-button"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? <PendingSpinner /> : <span>{AUTH_COPY.accountSecurity_changeButton}</span>}
          </Button>
          <button
            type="button"
            data-testid="cancel-otp-recovery-link"
            onClick={handleCancel}
            disabled={isPending}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {AUTH_COPY.accountSecurity_cancelLink}
          </button>
        </form>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // State A / A+: standard change-password form
  // -------------------------------------------------------------------------

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-6">
      {pageTitle}
      {hiddenUsernameField}

      {identityState === "A+" ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {AUTH_COPY.accountSecurity_helperAPlus}
        </p>
      ) : null}

      <form onSubmit={handleChangePassword} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="security-current-password">
            {AUTH_COPY.accountSecurity_currentPasswordLabel}
          </Label>
          <div className="relative">
            <Input
              id="security-current-password"
              data-testid="current-password-input"
              type={showCurrentPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-invalid={
                changePasswordForm.formState.errors.currentPassword ? "true" : undefined
              }
              aria-describedby={inlineError ? "security-error" : undefined}
              disabled={isPending}
              {...changePasswordForm.register("currentPassword")}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword((v) => !v)}
              className="absolute inset-y-0 right-2 flex items-center px-1 text-xs text-muted-foreground"
              aria-label={
                showCurrentPassword
                  ? AUTH_COPY.togglePasswordHide
                  : AUTH_COPY.togglePasswordShow
              }
            >
              {showCurrentPassword
                ? AUTH_COPY.togglePasswordHide
                : AUTH_COPY.togglePasswordShow}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="security-new-password">
            {AUTH_COPY.accountSecurity_newPasswordLabel}
          </Label>
          <div className="relative">
            <Input
              id="security-new-password"
              data-testid="new-password-input"
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              aria-invalid={
                changePasswordForm.formState.errors.newPassword ? "true" : undefined
              }
              aria-describedby={inlineError ? "security-error" : undefined}
              disabled={isPending}
              {...changePasswordForm.register("newPassword")}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute inset-y-0 right-2 flex items-center px-1 text-xs text-muted-foreground"
              aria-label={
                showNewPassword
                  ? AUTH_COPY.togglePasswordHide
                  : AUTH_COPY.togglePasswordShow
              }
            >
              {showNewPassword
                ? AUTH_COPY.togglePasswordHide
                : AUTH_COPY.togglePasswordShow}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{AUTH_COPY.accountSecurity_helperA}</p>
        </div>

        <ErrorNote id="security-error" message={inlineError} />

        <Button
          type="submit"
          data-testid="change-password-button"
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? (
            <PendingSpinner />
          ) : (
            <span>{AUTH_COPY.accountSecurity_changeButton}</span>
          )}
        </Button>

        <button
          type="button"
          data-testid="forgot-current-password-link"
          onClick={handleForgotCurrentPassword}
          disabled={isPending}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {AUTH_COPY.accountSecurity_forgotCurrentLink}
        </button>
      </form>
    </section>
  );
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
      className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
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
