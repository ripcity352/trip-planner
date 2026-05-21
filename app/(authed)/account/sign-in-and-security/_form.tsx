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
 *   "A"           — password only → standard A form
 *   "A+"          — password + OAuth → same form, extra helper copy
 *   "no-password" → stub (PR5 builds State B)
 *
 * Strings: ALL from AUTH_COPY (lib/copy/auth.ts) or ERRORS (lib/copy/errors.ts).
 *
 * Email-pinning: the userEmail prop comes from auth.getUser() in the server
 *   component. The form never submits an email field — the server action pins
 *   email from the session, not from form payload. The hidden username field
 *   (iOS Keychain pairing) uses the server-provided email.
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
import { changePasswordAction, setPasswordViaRecoveryAction, setPasswordAction } from "./actions";
import { requestEmailCode } from "@/app/login/actions";
import {
  type IdentityState,
  type FormMode,
  type ChangePasswordValues,
  type OtpCodeValues,
  type NewPasswordValues,
  type SetPasswordValues,
  changePasswordClientSchema,
  otpCodeClientSchema,
  newPasswordClientSchema,
  setPasswordClientSchema,
} from "./_form-state";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SecurityFormProps = {
  identityState: IdentityState;
  /** Sourced from auth.getUser() in the server component — never from client state. */
  userEmail: string;
  /**
   * Distinguishes OAuth-only from OTP-only within the 'no-password' state.
   * Passed from the server component; drives helper copy in State B.
   * Undefined for States A and A+.
   */
  identitySubtype?: "oauth" | "otp";
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityForm({ identityState, userEmail, identitySubtype }: SecurityFormProps) {
  // State B users start in B-set; State A/A+ start in change-password.
  const [mode, setMode] = useState<FormMode>(
    identityState === "no-password" ? "B-set" : "change-password"
  );
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [isPending, startTransition] = useTransition();
  // Holds the 6-digit OTP between C-verify (client-side step) and C-set
  // (atomic server submit). Never persisted — unmount clears it.
  const [recoveryToken, setRecoveryToken] = useState<string>("");

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

  // State B: first-ever password set form.
  const setPasswordForm = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordClientSchema),
    defaultValues: { newPassword: "" },
    mode: "onSubmit",
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleChangePassword = changePasswordForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      // NOTE: no email field — server action pins it from the session.
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
      const result = await requestEmailCode(userEmail);
      if (result.ok) {
        setMode("C-verify");
        return;
      }
      setServerError(result.errorKey);
      setMode("change-password");
    });
  };

  // C-verify is now a purely client-side step — the code is stored in
  // recoveryToken state and submitted atomically with the new password in
  // setPasswordViaRecoveryAction. This eliminates the bypass surface where
  // an authed attacker could call a "post-OTP" action without ever proving
  // OTP possession (M5/PR4 HIGH-1 fix).
  const handleVerifyCode = otpForm.handleSubmit((values) => {
    setServerError(null);
    setRecoveryToken(values.token);
    setMode("C-set");
  });

  const handleSetNewPassword = newPasswordForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await setPasswordViaRecoveryAction({
        token: recoveryToken,
        newPassword: values.newPassword,
      });
      if (result.ok) {
        setRecoveryToken("");
        setMode("success");
        return;
      }
      // On an invalid code, bounce back to C-verify so the user can re-enter
      // the OTP (recovery flow stays usable; no full restart needed).
      if (result.errorKey === "auth_code_invalid") {
        setServerError(result.errorKey);
        setMode("C-verify");
        return;
      }
      setServerError(result.errorKey);
    });
  });

  const handleCancel = () => {
    setServerError(null);
    setMode("change-password");
    setRecoveryToken("");
    otpForm.reset();
    newPasswordForm.reset();
  };

  // State B handler: set password for the first time (no current-pass, no OTP).
  const handleSetPassword = setPasswordForm.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await setPasswordAction({ newPassword: values.newPassword });
      if (result.ok) {
        setMode("success");
        return;
      }
      setServerError(result.errorKey);
    });
  });

  // -------------------------------------------------------------------------
  // Inline error
  // -------------------------------------------------------------------------

  const serverMsg = serverError ? ERRORS[serverError] : null;
  let inlineError: string | null = serverMsg;
  if (mode === "change-password") {
    inlineError =
      changePasswordForm.formState.errors.currentPassword?.message ??
      changePasswordForm.formState.errors.newPassword?.message ??
      serverMsg;
  } else if (mode === "C-verify" || mode === "C-verifying") {
    inlineError = otpForm.formState.errors.token?.message ?? serverMsg;
  } else if (mode === "C-set") {
    inlineError = newPasswordForm.formState.errors.newPassword?.message ?? serverMsg;
  } else if (mode === "B-set") {
    inlineError = setPasswordForm.formState.errors.newPassword?.message ?? serverMsg;
  }

  // iOS Keychain hint — pairs the password with the session-sourced email.
  const hiddenUsernameField = (
    <input type="email" name="username" autoComplete="username" hidden value={userEmail} readOnly />
  );

  // -------------------------------------------------------------------------
  // State B: first-ever password for OAuth-only or OTP-only users (PR5)
  // -------------------------------------------------------------------------

  if (identityState === "no-password" && mode === "B-set") {
    const helperCopy =
      identitySubtype === "oauth"
        ? AUTH_COPY.accountSecurity_stateB_helperOauthOnly
        : AUTH_COPY.accountSecurity_stateB_helperOtpOnly;

    return (
      <PageShell title={AUTH_COPY.accountSecurity_stateB_title}>
        {hiddenUsernameField}
        <form onSubmit={handleSetPassword} noValidate className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{helperCopy}</p>
          <PasswordFieldGroup
            id="security-new-password"
            testId="new-password-input"
            label={AUTH_COPY.accountSecurity_newPasswordLabel}
            autoComplete="new-password"
            invalid={!!setPasswordForm.formState.errors.newPassword}
            disabled={isPending}
            helper={AUTH_COPY.accountSecurity_helperA}
            {...setPasswordForm.register("newPassword")}
          />
          <ErrorNote id="security-error" message={inlineError} />
          <Button
            type="submit"
            data-testid="set-password-button"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? <Spinner /> : <span>{AUTH_COPY.accountSecurity_stateB_setButton}</span>}
          </Button>
        </form>
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // Success
  // -------------------------------------------------------------------------

  if (mode === "success") {
    return (
      <PageShell>
        <p
          role="status"
          data-testid="success-toast"
          className="rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-sm"
        >
          {AUTH_COPY.accountSecurity_successToast}
        </p>
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // State C — step 1 requesting (loading indicator)
  // -------------------------------------------------------------------------

  if (mode === "C-requesting") {
    return (
      <PageShell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span>{AUTH_COPY.codeSentSuccess}</span>
        </div>
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // State C — step 2: OTP entry
  // -------------------------------------------------------------------------

  if (mode === "C-verify" || mode === "C-verifying") {
    return (
      <PageShell>
        {hiddenUsernameField}
        <form onSubmit={handleVerifyCode} noValidate className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {AUTH_COPY.accountSecurity_codeRequestHelper(userEmail)}
          </p>
          <FieldGroup
            id="security-otp-code"
            testId="otp-code-input"
            label={AUTH_COPY.accountSecurity_codeFieldLabel}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            invalid={!!otpForm.formState.errors.token}
            disabled={isPending}
            {...otpForm.register("token")}
          />
          <ErrorNote id="security-error" message={inlineError} />
          <Button type="submit" data-testid="verify-code-button" disabled={isPending} aria-busy={isPending}>
            <span>{AUTH_COPY.verifyCodeButton}</span>
          </Button>
          <CancelLink onClick={handleCancel} disabled={isPending} />
        </form>
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // State C — step 3: set new password (no current-pass field)
  // -------------------------------------------------------------------------

  if (mode === "C-set") {
    return (
      <PageShell>
        {hiddenUsernameField}
        <form onSubmit={handleSetNewPassword} noValidate className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{AUTH_COPY.accountSecurity_setNewPasswordTitle}</p>
          <PasswordFieldGroup
            id="security-new-password"
            testId="new-password-input"
            label={AUTH_COPY.accountSecurity_newPasswordLabel}
            autoComplete="new-password"
            invalid={!!newPasswordForm.formState.errors.newPassword}
            disabled={isPending}
            helper={AUTH_COPY.accountSecurity_helperA}
            {...newPasswordForm.register("newPassword")}
          />
          <ErrorNote id="security-error" message={inlineError} />
          <Button type="submit" data-testid="change-password-button" disabled={isPending} aria-busy={isPending}>
            {isPending ? <Spinner /> : <span>{AUTH_COPY.accountSecurity_changeButton}</span>}
          </Button>
          <CancelLink onClick={handleCancel} disabled={isPending} />
        </form>
      </PageShell>
    );
  }

  // -------------------------------------------------------------------------
  // State A / A+: standard change-password form
  // -------------------------------------------------------------------------

  return (
    <PageShell>
      {hiddenUsernameField}
      {identityState === "A+" ? (
        <p className="mb-4 text-sm text-muted-foreground">{AUTH_COPY.accountSecurity_helperAPlus}</p>
      ) : null}
      <form onSubmit={handleChangePassword} noValidate className="flex flex-col gap-3">
        <PasswordFieldGroup
          id="security-current-password"
          testId="current-password-input"
          label={AUTH_COPY.accountSecurity_currentPasswordLabel}
          autoComplete="current-password"
          invalid={!!changePasswordForm.formState.errors.currentPassword}
          disabled={isPending}
          {...changePasswordForm.register("currentPassword")}
        />
        <PasswordFieldGroup
          id="security-new-password"
          testId="new-password-input"
          label={AUTH_COPY.accountSecurity_newPasswordLabel}
          autoComplete="new-password"
          invalid={!!changePasswordForm.formState.errors.newPassword}
          disabled={isPending}
          helper={AUTH_COPY.accountSecurity_helperA}
          {...changePasswordForm.register("newPassword")}
        />
        <ErrorNote id="security-error" message={inlineError} />
        <Button type="submit" data-testid="change-password-button" disabled={isPending} aria-busy={isPending}>
          {isPending ? <Spinner /> : <span>{AUTH_COPY.accountSecurity_changeButton}</span>}
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
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components (private to this module)
// ---------------------------------------------------------------------------

function PageShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <section className="mx-auto w-full max-w-lg px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {title ?? AUTH_COPY.accountSecurity_title}
      </h1>
      {children}
    </section>
  );
}

type FieldGroupProps = {
  id: string;
  testId: string;
  label: string;
  type?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  invalid: boolean;
  disabled: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>;

/** Plain (non-password) input group with label. */
function FieldGroup({ id, testId, label, invalid, ...inputProps }: FieldGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={testId}
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={invalid ? "security-error" : undefined}
        {...inputProps}
      />
    </div>
  );
}

type PasswordFieldGroupProps = Omit<FieldGroupProps, "type"> & {
  helper?: string;
};

/** Password input group with show/hide toggle and optional helper text. */
function PasswordFieldGroup({ id, testId, label, invalid, disabled, helper, ...inputProps }: PasswordFieldGroupProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          data-testid={testId}
          type={show ? "text" : "password"}
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={invalid ? "security-error" : undefined}
          disabled={disabled}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          disabled={disabled}
          className="absolute inset-y-0 right-2 flex items-center px-1 text-xs text-muted-foreground disabled:opacity-50"
          aria-label={show ? AUTH_COPY.togglePasswordHide : AUTH_COPY.togglePasswordShow}
        >
          {show ? AUTH_COPY.togglePasswordHide : AUTH_COPY.togglePasswordShow}
        </button>
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ErrorNote({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {message}
    </p>
  );
}

function CancelLink({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      data-testid="cancel-otp-recovery-link"
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {AUTH_COPY.accountSecurity_cancelLink}
    </button>
  );
}

function Spinner() {
  return (
    <>
      <Loader2 data-slot="spinner" className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      <span>...</span>
    </>
  );
}
