"use client";

/**
 * Root error boundary — catches throws in the root layout itself, which the
 * segment-level `error.tsx` can't (it renders *inside* the layout). This one
 * replaces the whole document, so it must render its own <html>/<body>.
 *
 * Last line of defense against a blank page. Kept dependency-free and
 * self-styled (no Button/theme imports) so it renders even if the failure is
 * in shared UI or the layout. globals.css is imported for base tokens.
 *
 * Must be a Client Component (Next.js error boundary contract).
 */

import { useEffect } from "react";

import "./globals.css";
import { ERROR_PAGE_COPY } from "@/lib/copy/error-pages";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary] root layout threw", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en" data-theme="bachelor">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <h1 className="text-xl font-medium">{ERROR_PAGE_COPY.title}</h1>
        <p className="text-muted-foreground text-sm">{ERROR_PAGE_COPY.body}</p>
        <button
          type="button"
          onClick={reset}
          className="bg-primary text-primary-foreground rounded-xs px-4 py-2 text-sm font-medium"
        >
          {ERROR_PAGE_COPY.retry}
        </button>
      </body>
    </html>
  );
}
