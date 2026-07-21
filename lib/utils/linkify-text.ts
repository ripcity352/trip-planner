/**
 * linkify-text — pure URL-detection tokenizer for user-generated text (#469).
 *
 * Splits a string into text/link tokens. Deliberately dumb and safe:
 *   - Only `http://`, `https://`, and `www.`-prefixed URLs produce link
 *     tokens. Nothing else — `javascript:`, `data:`, etc. stay plain text.
 *   - `www.` matches get an `https://` prefix on the href (the visible
 *     value stays as typed).
 *   - Whitespace (including newlines) passes through untouched inside
 *     text tokens, so callers can keep `whitespace-pre-wrap` rendering.
 *   - Common trailing punctuation (`.,;:!?)'"`) is stripped off the match
 *     and returned as text, so "see https://x.com." links cleanly.
 *
 * No dependencies. Rendering (anchor element, rel/target) is the
 * caller's job — see AnnouncementCard.
 */

export type LinkifyToken =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

// Scheme-anchored or www-anchored, then any run of non-whitespace.
// The `www.` alternative requires a word boundary so "awww.no" doesn't match.
const URL_PATTERN = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi;

// Punctuation that commonly trails a URL at the end of a clause.
const TRAILING_PUNCTUATION = /[.,;:!?)'"\]]+$/;

/** Strip sentence punctuation off the end of a raw URL match. */
function stripTrailingPunctuation(raw: string): string {
  const match = TRAILING_PUNCTUATION.exec(raw);
  return match ? raw.slice(0, match.index) : raw;
}

/**
 * Tokenize `input` into text and link tokens. Returns an empty array for
 * an empty string. Never produces a link token for a non-http(s) scheme.
 */
export function linkifyText(input: string): LinkifyToken[] {
  if (input.length === 0) {
    return [];
  }

  const tokens: LinkifyToken[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(URL_PATTERN)) {
    const url = stripTrailingPunctuation(match[0]);
    if (url.length === 0) {
      continue;
    }

    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: input.slice(lastIndex, match.index) });
    }

    const isWww = url.toLowerCase().startsWith("www.");
    tokens.push({
      type: "link",
      value: url,
      href: isWww ? `https://${url}` : url,
    });

    // Stripped trailing punctuation falls through into the next text
    // slice naturally — lastIndex stops right after the URL itself.
    lastIndex = match.index + url.length;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: "text", value: input.slice(lastIndex) });
  }

  return tokens;
}
