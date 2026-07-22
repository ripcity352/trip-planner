/**
 * formatCost — itinerary item cost display (#394).
 *
 * Whole-dollar amounts render without cents ("$450", not "$450.00") —
 * the itinerary card is a glance surface, not a receipt. Non-whole
 * amounts keep exactly the cents they were entered with.
 *
 * When `inCount` (the trip's "going" RSVP count) is 2 or more, a muted
 * per-head estimate is appended: "$450 · ~$90/head if 5 in". Below 2,
 * a per-head split is meaningless (it's just the total, or there's no
 * one to split with), so the suffix is omitted entirely.
 */
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

function formatWholeAware(dollars: number, currency: string): string {
  const trimmedCurrency = currency.trim() || "USD";
  const isWhole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: trimmedCurrency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(dollars);
}

/**
 * @param costCents Integer cents, or null when the item has no cost set.
 * @param currency ISO-4217 code (Postgres `char(3)`, may carry padding).
 * @param inCount Trip-level "going" RSVP count — the per-head denominator.
 * @returns The display string, or null when there's no cost to show.
 */
export function formatCost(
  costCents: number | null,
  currency: string,
  inCount: number
): string | null {
  if (costCents == null) return null;

  const amount = formatWholeAware(costCents / 100, currency);

  if (inCount < 2) return amount;

  // Per-head is always a rounded whole-currency-unit estimate ("~$90"),
  // never fractional cents — it's a heuristic, not an invoice line.
  const trimmedCurrency = currency.trim() || "USD";
  const perHead = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: trimmedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(costCents / inCount / 100));

  return M3_UI_STRINGS.itinerary_item_cost_per_head_template
    .replace("{amount}", amount)
    .replace("{perHead}", perHead)
    .replace("{count}", String(inCount));
}
