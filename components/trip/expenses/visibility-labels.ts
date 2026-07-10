/**
 * Shared visibility option labels for the expense composer sheets
 * (#384). Labels reuse the M3 itinerary strings — same audience
 * vocabulary everywhere.
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ExpenseVisibilityOption } from "@/lib/utils/expense-visibility";

export const EXPENSE_VISIBILITY_LABELS: Record<
  ExpenseVisibilityOption,
  string
> = {
  everyone: M3_UI_STRINGS.itineraryForm_visibility_everyone,
  organizers_only: M3_UI_STRINGS.itineraryForm_visibility_organizers,
  hide_from_celebrant: M3_UI_STRINGS.itineraryForm_visibility_hide_celebrant,
};
