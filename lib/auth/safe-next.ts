/**
 * `safeNext()` — normalize a user-supplied `?next=...` redirect target so it
 * can only ever land on our own origin.
 *
 * The attack we're closing: `/auth/callback?next=...` and any future bounce
 * route that builds `${origin}${next}`. A naive concatenation accepts:
 *
 *   - `next=//evil.com/x`           → browser sees `https://yoursite.com//evil.com/x`
 *                                     which it resolves as protocol-relative
 *                                     to `https://evil.com/x`. Open redirect.
 *   - `next=https://evil.com`       → `${origin}https://evil.com` collapses
 *                                     to `https://evil.com` on some Next
 *                                     fast-paths. Open redirect.
 *   - `next=javascript:alert(1)`    → click-through XSS if the result is
 *                                     ever surfaced as an href instead of
 *                                     handed to NextResponse.redirect().
 *
 * The contract: the returned string is either DEFAULT_NEXT or a same-origin
 * pathname that starts with exactly one slash (not two — protocol-relative)
 * and never decodes to a `scheme:` prefix.
 */

const DEFAULT_NEXT = "/trips";

export function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;

  // Must start with a single `/`, not `//` (protocol-relative). The
  // negative lookahead is what closes the `//evil.com` vector.
  if (!/^\/(?!\/)/.test(raw)) return DEFAULT_NEXT;

  // Reject anything that decodes to a scheme (`javascript:`, `data:`, etc.).
  // We check the decoded form because percent-encoding lets an attacker
  // sneak `%6avascript:alert(1)` past the surface check above.
  try {
    const decoded = decodeURIComponent(raw);
    if (/^\w+:/.test(decoded)) return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }

  return raw;
}
