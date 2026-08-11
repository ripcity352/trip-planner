/**
 * `/signup` — cold self-serve account creation (Journey 0).
 *
 * Operator's explicit front-door goal: a stranger who lands on the site
 * with no invite and no account can self-serve an account + a trip. The
 * landing page's "Start a trip" CTA routes here; the sign-in-first `/login`
 * stays unchanged for returning users.
 *
 * Server Component. Same card shell as `/login`, but renders `<LoginForm />`
 * with `defaultIntent="create"` so the password step leads with the
 * create-account branch (new-password autocomplete, "Have an account? Sign
 * in" toggle). No new state machine, no new action — `signUpAction` already
 * carries `next`. If the auth callback bounces back with `?error=auth`, the
 * same inline note as `/login` renders above the form.
 *
 * The `?next=` param is safeNext-validated and threaded into `<LoginForm />`.
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
  title: "Start a trip — Bachelor Party Planner",
};

// Next.js 16 typed `searchParams` is a Promise.
type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
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
              <h1 className="text-lg font-medium">{AUTH_COPY.signupPageTitle}</h1>
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
            <LoginForm next={nextPath} defaultIntent="create" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
