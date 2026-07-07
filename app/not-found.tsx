/**
 * Root `notFound()` fallback (#F7).
 *
 * Next renders this for any unmatched URL AND for every `notFound()` call
 * inside a page — including the cross-trip access denial on all 8
 * `/trips/[tripId]/*` pages (RLS already filtered the row; a non-member
 * gets the same outcome as a mistyped link). Without this file, both
 * cases fell through to Next's stock "404 | This page could not be
 * found" — the one off-voice SaaS screen in the app.
 *
 * Server Component (no client interactivity needed — a single link).
 * Styled like the InviteMissing surface in `app/invite/[token]/page.tsx`
 * for a consistent "can't find that" treatment across the app.
 */

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { NOT_FOUND_PAGE_COPY } from "@/lib/copy/error-pages";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <article className="w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <header className="px-6 py-6">
          <h1 className="text-xl font-medium">{NOT_FOUND_PAGE_COPY.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {NOT_FOUND_PAGE_COPY.body}
          </p>
        </header>
        <div className="px-6 pb-6">
          <Link href="/trips" className={buttonVariants({ variant: "outline" })}>
            {NOT_FOUND_PAGE_COPY.backCta}
          </Link>
        </div>
      </article>
    </main>
  );
}
