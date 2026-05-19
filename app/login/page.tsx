/**
 * `/login` — magic-link entry point.
 *
 * Server Component. Renders a centered, mobile-first card containing
 * `<LoginForm />`. If the auth callback bounces back with `?error=auth`,
 * we render an inline note above the form using `ERRORS.auth_failed`.
 *
 * The form itself is the only `"use client"` boundary — extracted so
 * this page can stay a Server Component and avoid hydrating the whole
 * route group for the static parts (title, container, error note).
 */

import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ERRORS } from "@/lib/copy/errors";
import { LoginForm } from "@/app/login/_form";

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

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-lg font-medium">Sign in</h1>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {hasAuthError ? (
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs"
              >
                {ERRORS.auth_failed}
              </p>
            ) : null}
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
