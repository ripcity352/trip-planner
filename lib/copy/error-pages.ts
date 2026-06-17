/**
 * Full-page error-boundary copy — the React `error.tsx` / `global-error.tsx`
 * fallbacks pull their strings from here, never inline literals.
 *
 * These exist so an uncaught render/throw never dead-ends on a blank page
 * (the "/auth/callback" white-page class from the prod walk). The route-level
 * try/catch is the primary guard; these boundaries are defense in depth for
 * every other route.
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?"
 * Warm, blame-free, specific. Anti-SaaS — no "Something went wrong", no
 * "An unexpected error occurred", no "Oops!".
 */

export const ERROR_PAGE_COPY = {
  /** Heading on the route-level error boundary. */
  title: "Well, that's annoying.",
  /** Body — owns the blame, points at the obvious next move. */
  body: "Something on our end hiccuped. Give it another go.",
  /** Retry button — calls Next's reset(). */
  retry: "Try again",
} as const;
