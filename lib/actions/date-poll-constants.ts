/**
 * Shared constants for the date-poll surface.
 *
 * Lives in its own module because `lib/actions/date-poll.ts` carries
 * the `"use server"` directive — and Next.js `"use server"` modules
 * can only export async functions. Importing constants from a sibling
 * file gives both the action layer and the UI (e.g.
 * `app/(authed)/trips/[tripId]/dates/_live-region.tsx`) one source
 * of truth.
 */

/**
 * Hard cap on active candidates per trip. Enforced at the action
 * layer rather than via a CHECK because the cap is a UX rule (the
 * 4-card grid at 375px gets unmanageable past this) and may evolve —
 * keeping it in code lets us tweak without a migration.
 */
export const MAX_CANDIDATES_PER_TRIP = 4;
