# UX Design — Principles, Patterns, and Voice

> Source: ui-designer subagent, 2026-05-18.
> Holding bar for every screen this app ships. "Helpful and easy to pick up, not burdensome." Like Partiful, not like Asana.

---

## 5 UX Principles (hold-bar)

1. **Glanceable beats comprehensive.** Every screen should communicate the one thing that matters right now in under a second — trip is in 12 days, dinner is at 7, Carl hasn't RSVPed.
2. **Participation is optional until it isn't.** No onboarding checklists, no "complete your profile" banners. App is useful at zero-input; better as people engage, never required.
3. **The organizer does the work so nobody else has to.** Surface effort asymmetry honestly — make the planner feel powerful, make guests feel pampered. **Different UX modes, not the same UI for different roles.**
4. **Delight is load-bearing, not decorative.** A confetti burst on RSVP isn't a nice-to-have — it signals "this is a celebration, not a project." Friction = the app failing its job.
5. **The app is a participant, not a tool.** Write like a friend who's in on the trip. Never neutral, never formal, never passive-aggressive about incomplete data.

---

## 3 Signature Interaction Patterns

### Pattern 1 — The Pulse Poll
**Where:** Any low-stakes group decision (dinner spot, activity, departure time)

**How it behaves:**
- Organizer taps `+ Quick poll` inline in itinerary or announcements
- Options are large tap-targets with emoji support
- Vote bars animate live via Supabase realtime — *bars not percentages*
- No login wall to vote; magic-link auth triggered invisibly on first vote
- Winning option subtly glows at >50% threshold

```
┌──────────────────────────────┐
│  Where should we eat Sat?    │
│                              │
│  🍕 Pizanos                  │
│  ████████░░░░░░  5 votes     │
│                              │
│  🌮 El Burro                 │
│  ████░░░░░░░░░░  3 votes     │
│                              │
│  🍣 Katsuya                  │
│  ██░░░░░░░░░░░░  1 vote      │
│                              │
│  [ Add option ]              │
└──────────────────────────────┘
```

**Why it's right:** Cash App's send confirmation = reference. iMessage and Partiful polls work because they're embedded in context, not a separate "Polls" tab.

---

### Pattern 2 — The Blur Gradient
**Where:** Any itinerary item / announcement / expense tagged "surprise" by the organizer

**How it behaves:**
- Hidden content renders as **frosted-glass blur** (`backdrop-filter: blur(8px)` over a placeholder) for the celebrant
- Renders normally for everyone else
- Card still shows date/time/category icon so celebrant knows *something is planned* — without knowing what
- Organizer tap → "Surprise settings" sheet → toggle visibility *per field, not per card*

```
Organizer sees:           Celebrant sees:
┌─────────────────┐       ┌─────────────────┐
│ 🍽 Dinner       │       │ 🍽 Dinner       │
│ Pizanos         │  →    │ ██████████████  │
│ 7:00 PM · Sat   │       │ 7:00 PM · Sat   │
│ 832 N Rush St   │       │ 📍 Somewhere    │
└─────────────────┘       └─────────────────┘
```

**Why it's right:** Celebrant knowing "Saturday night is dinner at 7" *builds anticipation* — it's a gift, not an absence. The blur communicates "something good is coming" better than a missing card. Linear's private issues use the same shape: the slot exists, the content is hidden.

> Maps to `is_celebrant` flag + `visibility` enum primitives in `audit-round-2.md`.

---

### Pattern 3 — The Hype Stack
**Where:** RSVP confirmation, last person submits availability, T-24 hours

**How it behaves:**
- Full-screen *transition*, not a modal
- User's avatar slides into the stack of confirmed attendees with a subtle physics bounce
- One-liner from the app voice fires: *"You're in. Carl is losing his mind."*
- On full-group confirm: confetti burst + *"Everyone's in. Let's go."*
- Auto-dismisses after 2.5s or on tap. No close button — motion tells you it's temporary

**Why it's right:** Partiful nails this. The moment of commitment should *feel* like something happened, not like submitting a form. Load-bearing delight.

---

## Anti-Patterns to Avoid (Asana-coded)

### 1. Progress bars and completion scores
*"Your itinerary is 40% complete"* = Asana. The trip is not a project with a done state — it's an experience. Notion's empty states are the counter-example: invite without demanding.

### 2. Notification preference settings
Don't ship a "Notification Settings" screen. Every setting is a decision pushed onto the user. **One smart default** (push for day-of, email digest for planning-phase) + OS-level mute. The moment you ship `[ ] Polls [ ] RSVPs [ ] Announcements` checkboxes, you've become a project management tool.

### 3. Required fields on anything
No asterisks. No *"you must add a location before publishing."* An itinerary item with just a name and a vibe is valid. App works around incomplete data gracefully (*"somewhere fun · Saturday night"*). The JIRA anti-pattern is system-refuses-to-proceed until Priority, Assignee, Epic Link, Story Points filled. **Kill that instinct on contact.**

---

## Home Screen — Above the Fold

### Day-3-of-Planning
```
┌─────────────────────────────┐
│  Scottsdale Bender  🌵      │
│  12 days away               │  ← ABOVE FOLD: countdown + name
├─────────────────────────────┤
│  📣  New: hotel confirmed   │  ← latest announcement (1 line)
│                             │
│  ✅  You're in · 7 going    │  ← RSVP state
│                             │
│  📅  Vote on dates          │  ← ACTIVE NUDGE: one thing to do
│       3 of 8 responded      │
├─────────────────────────────┤
│  Weekend at a glance:       │
│  Fri · Fly in               │
│  Sat · [surprise]           │
│  Sun · Golf · 9am           │
└─────────────────────────────┘
```

### Day-Of
```
┌─────────────────────────────┐
│  Scottsdale Bender  🌵      │
│  TODAY                      │  ← countdown → TODAY
├─────────────────────────────┤
│  ▶  NOW: Golf · 9am         │  ← current/next item, prominent
│     Scottsdale National     │
│     📍 Tap for directions   │
│                             │
│  NEXT: Lunch · 12:30pm      │
├─────────────────────────────┤
│  👥  Everyone here?         │
└─────────────────────────────┘
```

**The single piece of data always above-the-fold:** trip name, countdown/TODAY, and the most actionable next step. Everything else scrolls.

---

## Onboarding — Under 60 Seconds, 3 Taps, 2 Fields

1. **Tap link in iMessage** → opens Safari/Chrome. **No App Store prompt.** Web app only.
2. **Full-bleed trip card** — *"You're invited to Scottsdale Bender · June 6-9 · 8 going."* One button: `I'm in.` **No account language anywhere.**
3. **Tap `I'm in.`** → bottom sheet slides up: `What's your name?` + `Your number or email — we'll send updates`. Two fields, big inputs, auto-focus. No password, no username, no avatar upload.
4. **Tap `Send my invite.`** → magic link fires. **Screen transitions immediately** to the trip view with a ghost/pending state (*"We sent you a link to lock in your spot — explore in the meantime"*).
5. **First thing they see:** the active poll or availability picker. Not the full itinerary. **The one thing that needs their input right now.**

Total: 3 taps, 2 fields, ~45 seconds.

Borrow Arc's "trust this device" pattern: once confirmed, no re-auth on mobile for 90 days.

---

## Mobile-First Details (often forgotten)

- **Thumb reach:** all primary actions in bottom 40% of screen. Top is context. shadcn `Sheet` components slide from bottom — thumb-reach by default.
- **One-handed:** swipe gestures for navigating sections (availability, itinerary, expenses). Never require two hands.
- **Lock-screen widget:** iOS 16+ WidgetKit bridge. Next.js PWA can't do this natively — flag as native-wrapper consideration. Widget = trip name + countdown + next event. Read-only, tap-to-deep-link.
- **Share-sheet:** every itinerary item + the trip get native share targets via `navigator.share` (Safari 14+).
- **Add to Calendar:** each confirmed item → `.ics` download via Server Action returning blob. Includes location → Apple Maps auto-links. No library needed.
- **Apple Wallet / PassKit:** if trip has flight/hotel confirmation → "Add to Wallet" pass. ~2 days engineer spike. Genuine delight moment.

---

## Personality & Voice

**RIGHT tones:** warm, irreverent, self-aware, occasion-specific, never trying too hard.
→ Partiful invite copy, Cash App confirmations, the best-man speech that lands without cringing.

**WRONG tones:** corporate enthusiasm (*"Let's make memories!"*), hollow hype (*"Get PUMPED"*), frat-coded (*"Beers on deck"*), passive-aggressive (*"Carl still hasn't responded..."*), gender-assuming, penis-anything.

### Microcopy samples

| Where | Copy |
|---|---|
| Empty itinerary | *"Nothing planned yet. That's either very chill or very chaotic — hard to say."* |
| RSVP confirmation | *"You're in. The group just got better."* |
| Nudge to non-responder (sent by app, not shown publicly) | *"Hey — quick heads up, [Name] is waiting on your RSVP for Scottsdale. Takes 10 seconds, promise."* |

### Voice test (every string must pass)

> *Would you say this out loud at a pre-trip dinner?*

If yes, ship it. If it sounds like a SaaS onboarding email, rewrite.

---

## Design implications for the roadmap

- **Visibility primitive** (audit #2) directly enables Pattern 2 (Blur Gradient). Cannot ship surprise mechanics without it.
- **Magic-link auth deferred-as-long-as-possible** changes Goal 2 — view trip preview *before* asking for email.
- **Realtime via Supabase** is load-bearing for Pulse Poll — already in Goal 4 but needed earlier for polls
- **`navigator.share`, `.ics`, PWA manifest** are not "polish" — they're table-stakes mobile delight. Goal 5 / Goal 6.
- **`activity_tag` field on itinerary items** (`bar`/`meal`/`outdoor`/`chill`) is the foundation of sober/balance UX (see persona-edge-attendees.md)
- **One-tap deep-links out** (Maps, Uber, Venmo) is a design principle — *"don't be the destination, be the launchpad"*
- **Microcopy review checklist** in PR template for any UI-touching PR — does the string pass the "say this at dinner" test?
