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

/**
 * `app/not-found.tsx` copy — the `notFound()` surface (#F7).
 *
 * Distinct from ERROR_PAGE_COPY: `notFound()` isn't a thrown/caught error,
 * it's Next's dedicated 404 render path, and it's also what all 8
 * `/trips/[tripId]/*` pages fall through to on a cross-trip access denial
 * (RLS already filtered the row, so a non-member gets the same "can't find
 * that" outcome as a stale/mistyped URL — no distinguishing "doesn't
 * exist" from "not yours to see").
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?" Same
 * anti-SaaS bar as ERROR_PAGE_COPY — no "404", no "Page not found".
 */
export const NOT_FOUND_PAGE_COPY = {
  /** Heading. */
  title: "Nothing here.",
  /** Body — same collapsed-outcome framing as the invite-preview 404. */
  body: "Whatever you were looking for isn't at this link.",
  /** CTA back to the signed-in home. */
  backCta: "Back to your trips",
} as const;
