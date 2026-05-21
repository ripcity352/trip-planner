# M4 closure walk — production screenshots (travelston.com @ 375×812)

Captured 2026-05-21 via MCP-Playwright against the live production deploy
of `travelston.com` at 375×812 viewport. Used as the `[v]` axis evidence
for the M4 DoD per Override A + Override I.

## Anonymous surfaces (no auth required)

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| 01 | `/` landing | `m4-walk-01-landing-anon.png` | Hero copy holds: "Plan the trip without the group-chat chaos." Footer links to /legal/terms + /legal/privacy. Anonymous access succeeds. |
| 02 | `/login` | `m4-walk-02-login-anon.png` | Email input + "Send the link" button. Voice intact. |
| 02b | `/login` after send | `m4-walk-02b-login-sent-confirmation.png` | Confirmation: "Link's on its way. Check your email — it's quick." Voice intact. |
| 03 | `/legal/terms` | `m4-walk-03-legal-terms-anon.png` | W4a copy palette renders. No corporate boilerplate. Anonymous access succeeds. |
| 04 | `/legal/privacy` | `m4-walk-04-legal-privacy-anon.png` | W4a copy palette renders. Anonymous access succeeds. |

## Auth failure path (voice copy holds even on the error surface)

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| — | `/login?error=auth` | `m4-walk-auth-fail-pkce-cross-context.png` | Stale-link error reads: "Link's stale. Hop back to /login and try again." Override F holds on error paths too. |

## Authenticated surfaces (organizer persona — ripcity352@gmail.com)

Signed in via magic-link sent through verified Resend → received in
ripcity352@gmail.com inbox → clicked within MCP-Playwright same-session.

| # | Surface | Screenshot | What was verified |
|---|---------|-----------|---------|
| 05 | `/trips` | `m4-walk-05-trips-index-organizer.png` | "Your trips" heading. M3 prod-walk trip card visible. Avatar letter "R". |
| 06 | `/trips/m3-prod-walk` (home tab) | `m4-walk-06-home-tab-organizer.png` | Trip name + dates header. "Up next" card. Glanceable RSVP count ("1 going, 0 maybe, 0 invited"). 3-state RSVP chips. Section links to plans/posts/crew/invites/dates. "Stuff to know" notes block. Bottom tab bar (home active). |
| 07 | `/trips/m3-prod-walk/itinerary` (plans tab) | `m4-walk-07-plans-tab-organizer.png` | Itinerary timeline renders. Plans tab active in bottom nav. |
| 08 | `/trips/m3-prod-walk/announcements` (posts tab) | `m4-walk-08-posts-tab-organizer.png` | Announcements feed renders. Posts tab active in bottom nav. |
| 09 | `/trips/m3-prod-walk/roster` (crew tab) | `m4-walk-09-crew-tab-organizer.png` | Roster renders. Crew tab active in bottom nav. |
| 10 | `/trips/m3-prod-walk/me` (me tab) | `m4-walk-10-me-tab-organizer.png` | **"You" heading + Name + Email + Sign out button. NO completion UI, NO progress bars, NO counts/scores.** Voice CRITICAL C1 holds in prod. Me tab active. |
| 11 | `/trips/m3-prod-walk/invites` | `m4-walk-11-invites-organizer.png` | Existing invite token displayed with Copy + Revoke buttons. "Mint a link" CTA. |
| 12 | `/invite/[token]` (authed view) | `m4-walk-12-invite-preview-authed.png` | Trip name + dates + "with ripcity352" host attribution. Aggregate-only attendee count ("Just getting going") — no per-name decline (M1 declining-whispers ADR holds). "Count me in" CTA. |

## Override I verification (load-bearing M4 ship gate)

- ✅ **Verified Resend domain** — owner confirmed status (#135).
- ✅ **Real-recipient send** — magic link via `ripcity352@gmail.com` arrived in inbox. Token-format observation: production Supabase template still emits `pkce_*` URLs (cross-device-fragile per M3 W0c ADR — see follow-up note below).
- ✅ **Same-session click works** — MCP-Playwright same-context navigation succeeded. PKCE handler in `lib/auth/callback-handler.ts` accepted the token + redirected to `/trips`.
- ⚠️ **Cross-device click NOT verified** — MCP can't roundtrip through user's inbox. Carried as M5 watch item: if the Supabase template flip didn't take effect, real attendees who click from prefetcher-heavy clients (Gmail iOS Mail app, antivirus scanners) may hit `Link's stale` on first attempt. Workaround for real-trip use: send link via group text (recipient clicks in same browser as they request).
- ✅ **No console errors** observed on any surface during walk.
- ✅ **Persimmon focus-ring** rendered via `[data-theme=bachelor]` token cascade.

## What this walk did NOT directly exercise (covered by unit + e2e tests in CI)

- Chip-picker interactions (W1a/W1b/W1c) — covered by 56 component tests.
- Datetime widget editing (W2b) — covered by 17 unit tests including DST + cross-coast.
- Address autocomplete (W2a) — covered by 21 component tests + 23 proxy tests.
- Airline picker (W2c) — covered by 24 component tests including IATA regex enforcement.
- axe-core sweep (W4b) — covered by `e2e/m4-axe-sweep.spec.ts` against staging.
- Member-flag organizer-view via Delta 1 self-read SELECT (W1c) — covered by W0b decoy-RLS triad test + W1c picker tests.
- Cross-device magic-link click — see Override I note above.

For a real-trip-grade verification of those interactions, the user's
upcoming bachelor party usage IS the M5-gating test (per the roadmap
"stop at M4 + retro" bright line).
