# Killed & Deferred Features

> Canonical log of features we *considered and intentionally cut*. Future
> retros should consult this file before re-proposing any item below.
>
> Two states:
> - **Killed (issue closed):** removed from MVP. Earn back via a real-trip
>   retro that surfaces the gap.
> - **Deferred (issue open, milestone M5):** still on the roadmap, but
>   gated on MVP earning the right to ship them.
>
> Source review: `notes/synthesis-2026-05-18.md` +
> multi-perspective audit on 2026-05-19 (6 parallel reviewers: architect,
> groom, best-man, edge-attendees, mobile-UX, product strategy).

---

## Killed (issues closed)

| # | Feature | Why killed | What would change to revive |
|---|---|---|---|
| #44 | Hot Seat copy templates | Auto-roasting attendees via templates is a tone landmine. One bad string gets screenshotted as "the app being mean." Unanimous: Groom + Best Man + Mobile UX + Product. | A real voice library, per-string human review pipeline, and demonstrated trust in app voice across MVP. |
| #43 | Drumroll on first invite-link open | 3-sec build animation delays the *one thing* invitees want (who else is going). Pure decoration, Safari-slow-network failure mode. | Evidence delight is *missing* after MVP — i.e. the trip felt flat without it. |
| #42 | Lock-In Day full-bleed share card | Must not name last-to-RSVP person; Groom: "celebrates admin." | Redesign: organizer-private dopamine + optional share card that *never* names the locker and *never* auto-displays to celebrant. |
| #41 | ICS calendar export per attendee (signed JWT + webcal + VTIMEZONE) | Engineering bill wildly out of proportion to ~2/8 adoption — people screenshot the itinerary. | A simpler "copy itinerary as text" or "add all to calendar (single shared cal)" preceding it, and only if MVP retro shows people *wanted* it. |
| #33 | Notification outbox + dispatcher seam | Premature abstraction — MVP ships only Realtime; an outbox seam with no second channel is a pattern, not a product. | The second channel (email or SMS) arrives — likely with money-pool nudges in M5. Seam designed *then*. |
| #34 | Remove email digest stretch (Goal 4) | Subsumed by closing #33. | n/a |
| #32 | Pin Drops table + tap-to-flag | Downstream consumer (Group Recap) is itself deferred. Nobody taps a button mid-trip. No card design exists. | Group Recap ships first and surfaces a clear need for chapter-heading data, OR a different in-trip surface emerges. |
| #31 | Crew Cards / member directory (with "how do you know the celebrant?" field) | The "how do you know" field is exactly the +1 Bridge persona's anxiety wedge. Sparse cards look clique-coded. | A bare member-bio column (optional, auto-default) without the framing-around-celebrant question, *if* the +1 anxiety actually surfaces post-trip. |
| #29 | Fear List 3-card swipe ceremony | Keep the primitive (vibe tags, #30); kill the swipe-card onboarding. Groom won't sit through it; Best Man would ask at dinner. | A celebrant who specifically asks for the swipe UI. (Unlikely.) |
| #18 | Break Goal 2 into sub-issues (meta) | Superseded by milestone rebucket (M1/M2/M3/M4). | n/a |

---

## Hard-banned (anti-patterns — never)

From `notes/research/fun-and-delight.md` "Delight Anti-Patterns" + this review:

- Leaderboards (RSVP speed, payment, photo count, votes)
- Streaks
- Achievement unlocks / badges
- Notification-preferences settings screen
- Tooltips, onboarding banners, "complete your profile" prompts
- Required fields with asterisks
- Progress bars / completion scores
- Anthropomorphized mascot
- Reaction inflation (cap ~6 fixed emoji)
- Penis-anything in UI / assets / copy
- Push notifications for non-logistics events ("Pete added a photo")
- Per-name "going / declining" visibility on poll components by default (must be opt-in to the voter)
- Naming the last-to-RSVP person anywhere
- Group-visible "outstanding payment" lists (organizer-private only; aggregate-only when shared)
- Mid-trip push for anything that isn't a cliff date / day-of logistics

---

## Deferred to M5 (open, gated on real-trip retro)

These items are *valid* and *might ship* — they're just not in MVP. They
live in the M5 milestone. See GitHub for the current list:
`gh issue list --milestone "M5 — Earned post-trip"`.

Includes: itemized money pool, proration, silent comping, 3-tier nudge,
Money-Front badge (rescoped organizer-private), Settlement closer,
Quick Tab mode, Disposable Cam, Group Recap, expense_category,
Splitwise deep-link, template configs, Time Capsule, Recap Card,
Live Now, Hype Memos, AI itinerary extraction research, Wallet pass
research, audit_log triggers (narrowed to money tables), display_name_override.

---

## Schema corrections applied to M1

These were *not* killed; they were *fixed* before the foundation
migration ships. Logged here so the rationale survives:

- **Synthetic PK on `trip_members`** (new issue) — existing `(trip_id, user_id)` PK breaks with nullable `user_id`. Every feature table's `user_id` FK retargets to `trip_member_id`. Architect flagged as the single biggest miss in the original Goal 1.6 plan.
- **`trip_member_days` pulled forward to M1** — Goal 6.5 proration and Goal 7 Quick Tab both read it. One design pass with the rest of the foundation.
- **`audit_log` deferred to M5** — was in Goal 1.6 DoD; YAGNI for MVP and the original single-polymorphic-JSONB design is wrong anyway. Will be re-designed scoped to money tables when 6.5 ships.
- **`content_visibility_grants` deferred** until first `custom` audience consumer ships. Land the visibility enum now; design the join (polymorphic vs per-type) later under real requirements.
- **Idempotency unique index scope is per-table**, not uniformly `(trip_id, user_id, idempotency_key)` — organizer-acting-on-behalf cases (announcements, money) need `(trip_id, idempotency_key)`.
- **`dietary_notes` → per-itinerary-item private flag**, not a `trip_members` profile column (don't stamp the edge attendee's situation on their member row).
- **Money-Front badge → organizer-private only**, never "passively visible to group."
- **Pulse Poll aggregate-only by default**; per-name "going/declining" visibility is opt-in per voter.
- **`declined` RSVP visibility default = `organizers_only`** (enforces "going broadcasts, declining whispers" at the schema level, not aspirationally).
