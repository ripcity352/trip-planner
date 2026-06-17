/**
 * Invite URL paths.
 *
 * Load-bearing contract (#316 / #106): a post-sign-in redirect is a GET
 * navigation (`window.location.href = next`), so any value handed to an
 * auth flow as a `next=` target MUST be a GET-navigable page.
 *
 * - `invitePreviewPath` → the public preview page (`/invite/[token]`), a
 *   real GET route. This is the ONLY invite path safe to use as a `next=`
 *   redirect target. Once the viewer is signed in, the preview renders the
 *   one-tap Accept POST form.
 * - `inviteAcceptPath` → the POST-only accept route handler. GET was
 *   removed in #106 as a CSRF surface, so a GET lands a 405 (blank page).
 *   Use it ONLY as a `<form method="post" action>` target — NEVER as a
 *   redirect / `next=` target.
 */

export function invitePreviewPath(token: string): string {
  return `/invite/${token}`;
}

export function inviteAcceptPath(token: string): string {
  return `/invite/${token}/accept`;
}
