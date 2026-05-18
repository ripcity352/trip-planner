# Moderation & legal policy stub

> Pre-Goal 6 draft. Replace with a real ToS / Privacy Policy before
> sharing the invite link with actual users.

## Surface area requiring moderation

1. **User-generated photos** (Goal 7) — risk #3 from
   `notes/research/audience-features.md`. May include nudity, drug
   references, content of non-attendees who didn't consent.
2. **Announcements** (Goal 4) — organizer-authored text; lower risk
   because writers are scoped to organizer/co-organizer only.
3. **Trip names, descriptions, invite-link previews** — could be
   defamatory or expose private people by association.

## Mitigations (planned, by goal)

| Mitigation | Where |
|---|---|
| Default 90-day photo expiry, opt-in archive | Goal 7 schema |
| Per-trip storage cap | Goal 7 |
| `mailto:` takedown channel + a `reports` table | Goal 7 |
| ToS bullets: uploader is responsible, no illegal content, account/trip deletion on request | Goal 6 |
| Photos auth-walled — no public URLs | Goal 7 |
| Invite-link preview shows only trip name + dates (never attendee list) | Goal 2 |
| Single-use invite tokens via `invites.uses_left` decrement | Goal 2 |

## ToS bullets (draft)

- This is a hobby project. No SLA. Data may be lost or deleted.
- By uploading content you confirm you have the right to share it and
  that it is not illegal in your jurisdiction.
- Trip organizers are responsible for the contents of their trip,
  including photos, announcements, and invite recipients.
- We delete photos after 90 days unless explicitly archived.
- Email `[takedown email TBD]` to request removal of any content
  involving you.
- We do not move money; "money pool" amounts are informational only.
  Real payments happen via your chosen out-of-band channel
  (Venmo, Cash App, Zelle, etc.).

## Privacy bullets (draft)

- We store: email, display name, avatar URL, trips you belong to,
  RSVPs, expenses, announcements, photos you upload, payment handles.
- We do NOT store: payment instruments, real-world identity beyond
  display name + email, location beyond the trip's `location` field
  you typed yourself.
- We use Supabase (Postgres + Storage + Auth) and Vercel (hosting +
  analytics).
- Magic-link auth — no passwords stored.
- Trip data is visible only to trip members; enforced by Postgres RLS.

## Open questions

- Legal entity to operate under (LLC? sole prop?) before launching
  publicly in Goal 8.
- Jurisdiction for ToS (US-only? Global?).
- Whether Sentry / Vercel Analytics counts as a "third-party data
  processor" under California / EU rules — likely yes, must disclose.
