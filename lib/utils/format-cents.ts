/**
 * formatCents — integer cents + ISO-4217 code → localized currency
 * string (#372). One home for the conversion so no call site ever does
 * `cents / 100` inline (float-drift + duplicated rounding rules).
 */
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    // Postgres char(3) pads with spaces; trim before handing to Intl.
    currency: currency.trim() || "USD",
  }).format(cents / 100);
}
