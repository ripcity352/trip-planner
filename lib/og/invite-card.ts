/**
 * D3 — OG card helpers for `/invite/[token]/opengraph-image.tsx`.
 *
 * All logic here is pure and synchronous so it can be unit-tested
 * without any Next.js runtime context.
 *
 * Security contract (from auth-execution-plan.md §D3 + #219 OG contract):
 *   - `sanitizeForOg` strips control characters INCLUDING CR/LF/line-
 *     separator/paragraph-separator — these are the OG-text injection sink.
 *   - Clamp `trip_name` to ~40 chars, `host` to ~30 chars (+ "..." suffix).
 *   - `buildOgCardText` returns the safe interpolated string using
 *     `AUTH_COPY.ogCard` as the template.
 *   - Generic-card fallback fires when the RPC errors OR a required field
 *     (trip / dates / host) is null/empty after sanitization.
 *   - Inputs are ONLY sourced from the bucketed anon `invite_preview` RPC —
 *     never request headers. This module makes no network calls; callers
 *     are responsible for passing RPC-sourced data.
 */

import { AUTH_COPY } from "@/lib/copy/auth";
import { format, parseISO } from "date-fns";

/** Generic fallback card text — shown on error or missing required fields. */
export const OG_CARD_FALLBACK = "You're invited.";

/** Character limits for OG text fields (roughly matches font sizing at 1200x630). */
const TRIP_NAME_LIMIT = 40;
const HOST_LIMIT = 30;

/**
 * Matches characters that must be stripped from OG text:
 *   \x00-\x1F  C0 controls (TAB \x09, LF \x0A, CR \x0D, and all others)
 *   \x7F       DEL
 *   \x80-\x9F  C1 controls
 *         Unicode Line Separator — primary OG-text injection sink
 *         Unicode Paragraph Separator
 *
 * Built via RegExp constructor so the  /  codepoints are
 * included literally without relying on source-file encoding.
 */
const CONTROL_CHARS_RE = new RegExp(
  "[\x00-\x1F\x7F-\x9F  ]",
  "g",
);

/**
 * Strips control characters and OG-injection-sink separators from a string,
 * then collapses runs of whitespace to a single space and trims.
 */
export function sanitizeForOg(s: string): string {
  return s.replace(CONTROL_CHARS_RE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Clamps `s` to `limit` characters. Appends "..." if truncation occurred.
 * Assumes `s` has already been passed through `sanitizeForOg`.
 */
export function clampText(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + "...";
}

/** Clamps a trip name to TRIP_NAME_LIMIT chars after sanitizing. */
export function sanitizeTripName(raw: string): string {
  return clampText(sanitizeForOg(raw), TRIP_NAME_LIMIT);
}

/** Clamps a host display name to HOST_LIMIT chars after sanitizing. */
export function sanitizeHost(raw: string): string {
  return clampText(sanitizeForOg(raw), HOST_LIMIT);
}

/**
 * Formats the date range from InvitePreview date fields for use in the
 * OG card. Returns null when both dates are absent (no dangling separator).
 */
export function formatOgDates(
  starts_at: string | null,
  ends_at: string | null,
): string | null {
  if (starts_at && ends_at) {
    return `${format(parseISO(starts_at), "MMM d")} - ${format(parseISO(ends_at), "MMM d")}`;
  }
  if (starts_at) {
    return format(parseISO(starts_at), "MMM d");
  }
  return null;
}

export interface OgCardFields {
  tripName: string | null;
  dates: string | null;
}

/**
 * Builds the final OG card text string from sanitized, clamped field values.
 *
 * Returns `OG_CARD_FALLBACK` ("You're invited.") when:
 *   - `tripName` is null/empty after sanitization, OR
 *   - `dates` is null/empty.
 *
 * This ensures the card never crashes or leaks partial data. The fallback is
 * intentionally generic — see the D3 contract in auth-execution-plan.md.
 *
 * Uses `AUTH_COPY.ogCard` = "You're invited — {Trip} · {dates}." as the
 * template. No new copy is minted here (Override F).
 */
export function buildOgCardText({ tripName, dates }: OgCardFields): string {
  if (!tripName || !dates) {
    return OG_CARD_FALLBACK;
  }
  return AUTH_COPY.ogCard
    .replace("{Trip}", tripName)
    .replace("{dates}", dates);
}

/**
 * Interpolates `AUTH_COPY.inviteH1` = "{Host} wants you on this one." with
 * the given host string. Applies sanitization and clamping first.
 *
 * Falls back to `AUTH_COPY.inviteH1Fallback` = "You're on the list." when
 * host is null/empty after sanitization.
 *
 * On-page clamp mirrors the D3 OG clamp (both at HOST_LIMIT) so the H1
 * and the OG card stay in sync.
 */
export function buildInviteH1(hostRaw: string | null | undefined): string {
  if (!hostRaw) return AUTH_COPY.inviteH1Fallback;
  const sanitized = sanitizeHost(hostRaw);
  if (!sanitized) return AUTH_COPY.inviteH1Fallback;
  return AUTH_COPY.inviteH1.replace("{Host}", sanitized);
}

export interface InviteMetadataFields {
  tripName: string | null;
  host: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface InviteMetadata {
  title: string;
  description: string;
}

/**
 * #402 — og:title / og:description for the invite preview page's
 * `generateMetadata`, built from the SAME anon `invite_preview` fields
 * the OG image uses, under the same #219 injection guard (sanitize +
 * clamp; date strings are date-fns output, not user input).
 *
 * Returns `null` when the trip name is empty after sanitization — the
 * caller then emits nothing and the page inherits the root-layout
 * defaults, exactly like the OG image's generic fallback card. The
 * description composes the date range with the inviteH1 hook so the
 * unfurl text matches the page's own voice; when dates are unset the
 * hook stands alone (no dangling separator, no "Dates TBD" in a chat
 * unfurl).
 */
export function buildInviteMetadata(
  fields: InviteMetadataFields,
): InviteMetadata | null {
  if (!fields.tripName) return null;
  const trip = sanitizeTripName(fields.tripName);
  if (!trip) return null;

  const dates = formatOgDates(fields.starts_at, fields.ends_at);
  const hook = buildInviteH1(fields.host);

  return {
    title: AUTH_COPY.ogInviteTitle.replace("{Trip}", trip),
    description: dates ? `${dates} — ${hook}` : hook,
  };
}
