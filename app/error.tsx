"use client";

/**
 * Route-level error boundary.
 *
 * Defense in depth for the white-page class: if any segment under the root
 * layout throws during render, the user gets this fallback (with a retry)
 * instead of a blank page. The primary guard for the reported bug is the
 * `/auth/callback` try/catch (see `lib/auth/callback-handler.ts`); this
 * catches everything else.
 *
 * Must be a Client Component (Next.js error boundary contract). Renders
 * inside the root layout, so theme + fonts apply.
 */

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ERROR_PAGE_COPY } from "@/lib/copy/error-pages";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in logs / Sentry so a real outage isn't silently swallowed.
    console.error("[error-boundary] route render threw", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-medium">{ERROR_PAGE_COPY.title}</h1>
      <p className="text-muted-foreground text-sm">{ERROR_PAGE_COPY.body}</p>
      <Button onClick={reset}>{ERROR_PAGE_COPY.retry}</Button>
    </main>
  );
}
