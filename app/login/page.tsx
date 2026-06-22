/**
 * `/login` — progressive-disclosure auth entry point (M5/PR2).
 *
 * Server Component. Renders a centered, mobile-first card containing
 * `<LoginForm />`. If the auth callback bounces back with `?error=auth`,
 * we render an inline note above the form using `ERRORS.auth_failed`.
 *
 * The `?next=` param is safeNext-validated and threaded into `<LoginForm />`
 * so the form knows where to redirect after a successful sign-in.
 *
 * The form itself is the only `"use client"` boundary — extracted so
 * this page can stay a Server Component and avoid hydrating the whole
 * route group for the static parts (title, container, error note).
 */

import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTH_COPY } from "@/lib/copy/auth";
import { ERRORS } from "@/lib/copy/errors";
import { safeNext } from "@/lib/auth/safe-next";
import { LoginForm } from "@/app/login/_form";
import {
  ERROR_SURFACE_CLASS,
  ERROR_SURFACE_BORDER_STYLE,
} from "@/lib/ui/error-surface";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign in — Bachelor Party Planner",
};

// Next.js 16 typed `searchParams` is a Promise.
type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const errorParam = params.error;
  const hasAuthError =
    (Array.isArray(errorParam) ? errorParam[0] : errorParam) === "auth";

  const rawNext = params.next;
  const nextPath = safeNext(
    Array.isArray(rawNext) ? rawNext[0] ?? null : rawNext ?? null,
  );

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-lg font-medium">{AUTH_COPY.loginPageTitle}</h1>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {hasAuthError ? (
              <p
                role="alert"
                className={cn(ERROR_SURFACE_CLASS, "px-3 py-2 text-xs")}
                style={ERROR_SURFACE_BORDER_STYLE}
              >
                {ERRORS.auth_failed}
              </p>
            ) : null}
            <LoginForm next={nextPath} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
