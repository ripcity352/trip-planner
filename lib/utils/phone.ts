/**
 * Lenient E.164 phone normalizer (#368).
 *
 * The roster stores phones as E.164 (`trip_members.phone_e164`, unique
 * per trip) and the vCard export trusts that format — so this is the
 * single choke point where a human-typed number becomes canonical.
 *
 * Lenient on INPUT: people paste "(415) 555-1212", "415.555.1212",
 * "+44 20 7946 0958", "0044 20..." — all fine. Strict on OUTPUT: either
 * a valid-shaped `+<digits>` string or `null`, never a half-cleaned
 * value.
 *
 * Bare 10-digit numbers are assumed US (+1) — the MVP crew is US-based
 * and a US number is the only prefix we can guess without lying.
 * International attendees type their `+` and it passes straight through.
 */

/** Characters people legitimately type around digits: spaces, dashes,
 * dots, parens. Anything else (letters, emoji) fails normalization. */
const DECORATION_RE = /[\s\-.()]/g;

/** E.164 body: 8–15 digits, no leading zero (ITU-T E.164 §6.1). The
 * 8-digit floor is pragmatic — short-codes aren't textable contacts. */
const E164_BODY_RE = /^[1-9]\d{7,14}$/;

const US_TEN_DIGIT_RE = /^[2-9]\d{9}$/;

/**
 * Normalize a human-typed phone number to E.164, or return `null` when
 * the input can't honestly be shaped into one. Empty/whitespace input
 * also returns `null` — callers treat that as "no phone", not an error.
 */
export function normalizePhoneE164(raw: string): string | null {
  const stripped = raw.trim().replace(DECORATION_RE, "");
  if (stripped.length === 0) {
    return null;
  }

  // "00" is the international-call prefix in most of the world — treat
  // it as a spelled-out "+".
  const withPlus = stripped.startsWith("00")
    ? `+${stripped.slice(2)}`
    : stripped;

  if (withPlus.startsWith("+")) {
    const body = withPlus.slice(1);
    return E164_BODY_RE.test(body) ? `+${body}` : null;
  }

  // No country code typed. 10 digits with a valid US area code → +1;
  // 11 digits already led by the US "1" → prefix the plus.
  if (US_TEN_DIGIT_RE.test(withPlus)) {
    return `+1${withPlus}`;
  }
  if (withPlus.length === 11 && withPlus.startsWith("1")) {
    return US_TEN_DIGIT_RE.test(withPlus.slice(1)) ? `+${withPlus}` : null;
  }

  return null;
}
