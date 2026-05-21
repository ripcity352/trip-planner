/**
 * Pure URL builders for Maps deep links.
 *
 * No external dependencies. Both Google Maps and Apple Maps accept
 * a query string for a text address search — no coordinates needed.
 *
 * Unit-tested in lib/utils/__tests__/maps-deep-link.test.ts
 */

export interface MapsDeepLinks {
  google: string;
  apple: string;
}

function assertNonEmpty(address: string): void {
  if (!address.trim()) {
    throw new Error("maps-deep-link: address must not be empty");
  }
}

/**
 * Build a Google Maps search URL for a text address.
 * Opens the Maps web app / native app depending on the OS.
 */
export function buildGoogleMapsUrl(address: string): string {
  assertNonEmpty(address);
  const params = new URLSearchParams({ api: "1", query: address });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Build an Apple Maps URL for a text address.
 * On iOS/macOS opens the Maps native app; elsewhere falls back to the web.
 */
export function buildAppleMapsUrl(address: string): string {
  assertNonEmpty(address);
  const params = new URLSearchParams({ q: address });
  return `https://maps.apple.com/?${params.toString()}`;
}

/**
 * Build both deep links for a single address.
 */
export function buildMapsDeepLinks(address: string): MapsDeepLinks {
  return {
    google: buildGoogleMapsUrl(address),
    apple: buildAppleMapsUrl(address),
  };
}
