/**
 * Expense visibility ↔ viewer predicates (#384).
 *
 * One predicate, two layers of the same fix:
 *   - the composer (Add/Edit expense sheets) filters its visibility
 *     options to what the viewer could still read — the celebrant never
 *     sees "Hide from the celebrant" aimed at them (rule 11);
 *   - the server actions reject actor-unreadable combos as the backstop,
 *     because an author-invisible expense either aborts 42501 (create)
 *     or strands the author unable to read/correct their own row.
 *
 * Mirrors `can_see_content()` (m1_foundation) evaluated for the actor's
 * own seat. `custom` is deliberately absent — the composer never offers
 * it until content_visibility_grants ships.
 */

import type { TripRole } from "@/lib/db/types";

export const EXPENSE_VISIBILITY_OPTIONS = [
  "everyone",
  "organizers_only",
  "hide_from_celebrant",
] as const;

export type ExpenseVisibilityOption =
  (typeof EXPENSE_VISIBILITY_OPTIONS)[number];

export interface ViewerVisibilityContext {
  isOrganizer: boolean;
  isCelebrant: boolean;
}

/** `organizer` and `co_organizer` both count (matches is_trip_organizer). */
export function isOrganizerRole(role: TripRole): boolean {
  return role === "organizer" || role === "co_organizer";
}

/** Would a row carrying this visibility still be readable by the viewer? */
export function canViewerReadVisibility(
  visibility: ExpenseVisibilityOption,
  viewer: ViewerVisibilityContext
): boolean {
  switch (visibility) {
    case "everyone":
      return true;
    case "organizers_only":
      return viewer.isOrganizer;
    case "hide_from_celebrant":
      return !viewer.isCelebrant;
  }
}

/**
 * Composer options for this viewer, canonical order preserved:
 * celebrant → everyone only; plain member → everyone + hide from the
 * celebrant; organizer → all three (minus self-hiding combos for an
 * organizer-celebrant).
 */
export function readableVisibilityOptions(
  viewer: ViewerVisibilityContext
): ExpenseVisibilityOption[] {
  return EXPENSE_VISIBILITY_OPTIONS.filter((v) =>
    canViewerReadVisibility(v, viewer)
  );
}
