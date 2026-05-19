"use client";

/**
 * `<LoginForm />` — the only interactive part of `/login`.
 *
 * Renders an email field + submit button. On submit:
 *   1. zod validates the email shape (via react-hook-form resolver)
 *   2. server action `requestMagicLink` is called
 *   3. While pending, button disables + spinner
 *   4. On `{ ok: true }`, the form is replaced with the success copy
 *      pulled from `ERRORS.auth_link_sent`
 *   5. On `{ ok: false, errorKey }`, the form stays mounted with an
 *      inline note rendered from the matching `ERRORS[errorKey]`
 *
 * Strings come exclusively from `lib/copy/errors.ts`. Inline literals
 * here are limited to UI scaffolding (the button label, the email
 * label) — those are voice-tested locally below.
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { requestMagicLink } from "@/app/login/actions";

const schema = z.object({
  email: z
    .string()
    .min(1, { message: ERRORS.validation_failed })
    .email({ message: ERRORS.validation_failed }),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const [serverError, setServerError] = useState<ErrorKey | null>(null);
  const [sent, setSent] = useState(false);
  // `useTransition` keeps the pending state in sync with the server
  // action without us managing a separate `isLoading` boolean.
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestMagicLink(values.email);
      if (result.ok) {
        setSent(true);
        return;
      }
      setServerError(result.errorKey);
    });
  });

  if (sent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-2 text-center text-sm"
      >
        <p className="text-foreground">{ERRORS.auth_link_sent}</p>
      </div>
    );
  }

  // Inline notes — emit only one at a time. Validation errors win over
  // server errors because the user just tried to submit.
  const inlineErrorMessage =
    errors.email?.message ?? (serverError ? ERRORS[serverError] : null);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errors.email ? "true" : undefined}
          aria-describedby={inlineErrorMessage ? "login-error" : undefined}
          disabled={isPending}
          {...register("email")}
        />
      </div>

      {inlineErrorMessage ? (
        <p
          id="login-error"
          role="alert"
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs"
        >
          {inlineErrorMessage}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} aria-busy={isPending}>
        {isPending ? (
          <>
            <Loader2
              data-slot="spinner"
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            <span>Sending…</span>
          </>
        ) : (
          <span>Send the link</span>
        )}
      </Button>
    </form>
  );
}
