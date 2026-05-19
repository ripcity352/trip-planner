---
> Source: head-of-moments-and-delight subagent, 2026-05-18.
> Premise: this app is a celebration tool, not a project tracker. Delight is load-bearing.
> Prior agents confirmed: Pulse Poll, Blur Gradient, Hype Stack, Partiful-coded voice, glanceable > comprehensive.
> This doc extends that into specific build-able mechanics across pre-trip, in-trip, and post-trip phases, plus memory-as-product, roles-as-personality, and trip-template variants.
---

# Fun and Delight — Mechanics, Memory, and Templates

The job of every screen in this app is to make the next moment feel slightly more alive than it would have without us. If a feature feels like Asana, we built it wrong. If a feature feels like a friend texting the group chat, we built it right.

The phases:

1. **Pre-trip (planning)** — the trip should already feel like it's happening. Anticipation IS the early product.
2. **In-trip (live)** — the app is the shared peripheral vision of the group. It is *with* you, not *for* you.
3. **Post-trip (memory)** — the trip should keep paying dividends for at least a year. Spotify Wrapped is the model; nothing about a bach trip is less memorable than your top 5 artists.

---

## 12 Delight Mechanics

### 1. The Drumroll
**What it does.** When the organizer hits "publish trip" and sends the first invite link, the trip dashboard for invitees opens with a 3-second build: blurred hero image of the destination → location pin drops → date counter spins down to "21 days." It's the difference between getting an iMessage with a Google Doc link and getting an envelope.

**Why it works.** First impressions are sticky and *cheap*. The trip is real the moment it feels theatrical. Borrowed from Partiful's invite reveal and Cash App's payment confirmation choreography.

**Build cost.** S — Framer Motion + a single hero asset per template.

**Reference.** Partiful invite open, Cash App payment-sent screen.

---

### 2. Lock-In Day
**What it does.** When the last person RSVPs "going," the app fires a *group-wide* full-bleed moment: every attendee's avatar lands into a final stack with a soft physics bounce, one app-voice line plays ("Eight in. Phones up Friday."), and a 9:16 shareable card auto-generates with the group photo grid + dates + city. One tap → iMessage share sheet.

**Why it works.** This is the moment of *collective commitment* — currently invisible in group chats, where the 8th RSVP arrives at 11:47pm and nobody notices. We make it ceremonial. Also: every share back to the group chat is free distribution.

**Build cost.** M — Hype Stack physics + OG-card image generation via Next.js `ImageResponse`.

**Reference.** Strava's "you matched your PR" full-screen, Duolingo streak share card.

---

### 3. The Anticipation Drip
**What it does.** Starting at T-14 days, the app surfaces one small new piece of trip info per day on the home screen, above the fold — never two at once. Day 14: "Hotel locked in." Day 10: "The flight Brad is on is the same flight Marcus is on. They don't know yet." Day 7: "Pete's first time in Scottsdale." Day 3: "Weather Saturday: 78°."

**Why it works.** It treats the trip like a release campaign. Each drip is a "the trip is closer" signal. Compare to current state: nothing happens between booking and arrival, so the trip *feels* far away. Pulls from already-captured data (flights, member profiles, weather API).

**Build cost.** M — content engine over existing data + 1 home-screen slot. Most beats are templated.

**Reference.** Duolingo's daily note, Apple Sports score nudges, Robinhood pre-market headlines.

---

### 4. Fear List
**What it does.** Private celebrant-only intake on first login: 3 cards swiped left/right. *"Strippers — hard no / sure / let Dave decide." "Helicopter — yes / no." "Karaoke — only if I'm drunk / never / absolutely."* Feeds vibe tags + activity filtering invisibly. Never shown back to the group; only "the room knows" via softer defaults.

**Why it works.** Solves the groom's #1 fear (per `persona-groom.md`): being railroaded into a cliché. Crucially, *the groom never has to say "no" to a friend*. The constraint becomes ambient. Naming it "Fear List" is a wink — irreverent, occasion-specific, doesn't sound like a settings screen.

**Build cost.** S — 3-card swipe component + writes to existing vibe_tags table.

**Reference.** Hinge prompt UX, Co-Star intake.

---

### 5. The Hot Seat
**What it does.** When a poll closes or a date locks, the app picks one attendee and writes them into a 1-line app-voice callout on the home screen: *"Pete pulled the trigger on Pizanos. Heroic."* *"Marcus voted last. Marcus always votes last."* Rotates so nobody gets singled out twice in a row. Never negative — only affectionately roasty.

**Why it works.** Turns ambient data (who voted, who paid, who booked) into *characters in a story*. People love seeing their name in lights when it's warm-irreverent. The app becomes the group chat's narrator. Critically: never shame, never streak, never leaderboard.

**Build cost.** S — copy templates + a "who did the thing last" query. One file of voice strings.

**Reference.** Letterboxd's "you watched X" framing, Strava kudos copy, the way Slack's bot used to announce birthdays.

---

### 6. Crew Cards
**What it does.** A "meet the crew" page where each attendee has a baseball-card style profile: photo, 1-line bio they wrote themselves (160 chars, app-voice prompted: *"You in 12 words"*), how they know the celebrant, what city, two hobby emojis. No LinkedIn-style fields. Pull-to-refresh reshuffles the order.

**Why it works.** Solves the "+1 Bridge" persona's #1 anxiety (per `persona-edge-attendees.md`): not knowing names. Solves the FIL's-friend-Tom problem for the groom. Makes the trip feel cast, not assembled. Bios are *opt-in funny* — the format invites it.

**Build cost.** S — existing trip_members + a bio column + a card component.

**Reference.** Partiful guest list, NBA Top Shot moment cards, the "meet your hosts" Airbnb section.

---

### 7. The Bar Tab
**What it does.** A running ticker, visible to organizers only, that pings on a soft chime when something *good* happens — Mike RSVPed, Brad paid, the chef confirmed. Not a notification, not a feed — a single rolling line at the top of the organizer dashboard ("☑ Mike's in · ☑ Chef confirmed · 💰 Brad paid $400"), the last 5 events, auto-dismissing.

**Why it works.** Organizers (per `persona-best-man.md`) currently get *anxious* checking the trip dashboard because every visit might mean bad news. Bar Tab makes the dashboard *rewarding* to revisit. Wins-only feed = a dopamine drip for the person doing all the work. Critically: failures (declined RSVPs, missed deadlines) live elsewhere — the digest, not the Bar Tab.

**Build cost.** S — event log already exists from RSVPs/payments; just a filtered view.

**Reference.** Shopify's order ping for new merchants, Linear's activity feed but happy-only.

---

### 8. Hype Memos
**What it does.** Every attendee can record one 15-second voice memo on their profile *for the celebrant* during the planning phase ("the thing you're most excited about / want to say to the groom"). They surface to the celebrant *one per day, randomly* in the week before the trip. Never all at once. Played on the trip dashboard with the recorder's avatar pulsing.

**Why it works.** Voice > text for emotion. The drip turns it into a built-in hype campaign without anybody having to write a speech. For the celebrant: a private surprise, never showy. For the recorders: it's 15 seconds, not a 200-word toast — *unit of contribution is small* (per organizer persona insight on asymmetric labor).

**Build cost.** M — voice recording via MediaRecorder API, Supabase Storage, a daily release scheduler.

**Reference.** BeReal's voice notes, Marco Polo, the wedding-day video montage but front-loaded.

---

### 9. Live Now
**What it does.** During the trip itself, the home screen replaces the countdown with a *what's-happening-this-very-second* card: current location pin (opt-in shared by organizer), current itinerary item with elapsed time, and a single rotating reaction stream from attendees ("🔥 8 · 😂 3 · 😴 1"). Tap to add a reaction. No comments, no thread — *just a pulse*.

**Why it works.** The in-trip phase is where most planning apps die — they become irrelevant the moment the trip starts. Live Now keeps the app present as a *peripheral nervous system* of the group. Reactions are zero-cost contributions even from the guy nursing a hangover in the Uber. The lack of comments is the feature — no "where r u" texts, just vibes.

**Build cost.** M — Supabase Realtime for reactions (already in stack for Pulse Poll), itinerary already exists. Location is an opt-in stretch.

**Reference.** Apple Live Activities, Instagram Story reaction taps, Discord typing indicator.

---

### 10. Disposable Cam
**What it does.** A dedicated camera UI inside the app during the trip — opens to a square viewfinder with a fake film-counter ("23 left"), no in-camera filters, no preview, no retake. Photos are *hidden from everyone* (including the photographer) until the trip ends, at which point the whole roll develops at once on the photo wall.

**Why it works.** Solves the "everyone's looking at their phone instead of the moment" problem. Constraint creates ritual. The reveal is the post-trip dopamine hit — see `Memory as Product` below for how this becomes the spine of the recap. Borrowed straight from Dispo / David Dobrik before it imploded, but the *mechanic* still works.

**Build cost.** M — camera page (MediaCapture API), a `developed_at` timestamp on photos, a "developing" placeholder UI. Storage already in Goal 7.

**Reference.** Dispo, Disposable Vintage Camera apps, BeReal's "no retake."

---

### 11. The Pin Drop
**What it does.** When something happens that the group will want to remember — biggest tab paid, longest karaoke run, the moment the groom got pied — anyone can "pin" the current moment with one tap from Live Now. App captures: timestamp, current itinerary item, who was in the area (from per-day attendance), nearest photo from Disposable Cam, optional 8-char caption ("RIP marcus"). Becomes a chapter heading in the post-trip recap.

**Why it works.** Most memorable trip moments are *un-photographable* — but they're *flag-able*. The pin turns ambient moments into structured story beats. The 8-char limit forces it to feel like a meme caption, not a journal entry. Zero-cost contribution again — the unit is one tap.

**Build cost.** S — a pins table + a button on Live Now.

**Reference.** Twitter "highlight this tweet," Slack pinned messages, Strava's segment achievement markers.

---

### 12. The Departure Lounge
**What it does.** The morning of the last day, the home screen flips into "Departure Lounge" mode: shows everyone's flight time + airport, a shared playlist of songs added during the trip (created automatically from any Spotify links pasted in announcements), the running Disposable Cam developing-counter ("12 hours until the roll develops"), and a single "Last call" button that lets anyone post one final reaction to the whole trip ("⭐⭐⭐⭐⭐ best weekend of my life — Pete").

**Why it works.** Trips currently end with a whimper — people peel off to Ubers, the group chat goes silent, the dashboard becomes a dead file. The Departure Lounge gives the trip a final scene. Sets up the post-trip artifact instead of leaving it on a cliff.

**Build cost.** M — mode switch on home screen, Spotify URL parser, an exit-poll micro-form.

**Reference.** Airbnb post-stay review, the way a good DJ closes a set.

---

## Delight Anti-Patterns to Avoid

The fastest way to ruin this app is to confuse *delight* with *engagement metrics*. Things that look fun and actually annoy:

- **Confetti tax.** Confetti on every action becomes wallpaper. Reserve it for *group* milestones — Lock-In Day, last-person-paid, trip-complete. Once per phase, max.
- **Gamified RSVP speed.** "Fastest RSVP" badges turn social commitment into competition. Pete RSVPs in 4 seconds because he was at his desk; Marcus takes 3 days because he asked his wife. We don't shame Marcus.
- **Leaderboards of any kind.** Who paid first, who posted the most photos, who voted most often. Leaderboards convert a celebration into a workplace. Hard ban.
- **Streaks.** Duolingo's owl is a cautionary tale, not a model. No "5-day check-in streak." No "you haven't opened the app in 2 days." The app does not need our attention; the trip does.
- **Achievement unlocks.** Badges for "first poll voted on" / "first announcement read" infantilize. We are adults at a bachelor party.
- **Sound effects by default.** A swoosh on every tap dies fast and is hostile in an Uber. Sound is reserved for *Lock-In Day* and *photo-roll develops* — moments worth a chime.
- **Anthropomorphized mascot.** No app-named character ("Hi, I'm Sparky!"). The voice is the app, not a thing inside the app.
- **Push notifications for engagement.** Push fires for *logistics* (cliff dates, day-of items, payment due) — never for "Pete added a photo!"
- **Reaction inflation.** Cap reactions at 6 emoji choices, fixed set, chosen for tone. No custom emoji uploads. Discord's emoji menu is what we are NOT.
- **Onboarding tooltips.** If the screen needs a tooltip, the screen is wrong.

Rule of thumb: if it shows up in a SaaS engagement-features blog post, kill it on contact.

---

## Memory as Product — The Recap

Spotify Wrapped works because it's auto-generated, data-rich, narratively shaped, and instantly shareable. The bach-trip equivalent is the same recipe applied to data we're already capturing: photos (Disposable Cam), itinerary items + pins, expenses (who paid for what), announcements (who said what), per-day attendance, the Hype Memos.

### The Roll
The Disposable Cam roll "develops" 24 hours after the trip ends. Push notification: *"Your roll is ready."* Opens to a full-screen photo wall with a vintage thumb-flip feel — every photo from the trip, no filters, time-ordered. Tap any photo to attach a memory (8-char caption max, app-voice prompted). The Roll is the single source for the recap that follows.

### The Recap Card (per attendee)
24 hours after The Roll develops, each attendee gets a personalized share card auto-generated as a 9:16 image, push-notified, one-tap share to iMessage / Instagram Stories:

- **Hero photo.** The one Disposable Cam shot they're in that has the highest reaction count.
- **Their stat line.** "Pete · Scottsdale Bender · 3 days · 14 photos in · 8 reactions given · 1 pin to his name ('RIP marcus')."
- **One moment.** The Pin Drop tagged with them.
- **Closing line.** App-voice, e.g. *"You showed up. The group chat won't shut up about it."*

These are *personal*. No leaderboard, no comparisons. Each attendee's card is theirs.

### The Group Recap
A single shared artifact (web page + 9:16 video export) for the trip, auto-generated. Structure:

- Cold open: trip name, dates, hero photo.
- The Cast: Crew Cards arranged like end credits, in arrival order.
- Chapters: each Pin Drop as a scene with photos, the itinerary item, the people present, a one-line app-written summary built from announcements + reactions.
- The Tab: total spent, total reimbursed, single "you all balanced out — clean ledger" line. *No per-person money breakdown.* Money is not the memory.
- The Closing: the Hype Memos all played back-to-back. Final card.

Auto-generated. Zero attendee effort. Organizer can re-order or hide chapters before share.

### The Time Capsule
On the trip's 1-year anniversary, every attendee gets a single push: *"One year ago today, you flew to Scottsdale."* Opens to The Roll with one randomly resurfaced photo, the corresponding Pin Drop, and a fresh share card with new copy: *"One year ago, Pete pulled the trigger on Pizanos. He'd do it again."* On the 5-year anniversary, the celebrant gets the Group Recap re-delivered with a "your wedding was that fall" tag if we know it.

This is the killer feature for retention into Goal 8 (multi-tenant). It is *why someone uses the app for their next trip a year later.* The app is the only thing that remembers.

---

## Roles as Personality, Not Permissions

Currently `trip_role` is access-control: organizer, co-organizer, member, celebrant. That maps to *capabilities*. We layer a *personality* layer on top — same database column, different UI treatment per role.

- **Celebrant ("the groom").** UI badge is a small star next to their name on Crew Cards. Their home screen has a private *"For your eyes only"* drawer with the Fear List, the Hype Memos, and a one-line preview of the surprise schedule (blurred from `Pattern 2`). The app addresses them by name and treats them like the guest of honor: *"Pete, the room is full. Tomorrow at 11."*
- **Best Man / Primary Organizer.** UI badge: "running the show." Has a private *Best Man's Notes* pane — markdown scratch space scoped to them, never shared, perfect for "Greg is bringing the cigars, don't forget to comp him." Plus the Bar Tab (mechanic #7) and a private "send anonymously to the group" thread for surprise coordination. Their home screen has the *Money Front Badge* — running total of personal cash floated, visible passively, never as a complaint.
- **Co-Organizer.** UI badge: "spend authority $200." Reads as a *perk*, not a limit. The badge is a literal stamp graphic, not text — it says *"trusted lieutenant,"* not *"capped at $200."* They get the Bar Tab feed but a slim version. Can publish announcements with a "co-signed" label that hits differently than a solo organizer announcement.
- **Member (default attendee).** No badge needed. They're the protagonist of their own trip — the app addresses them by name on Live Now and Crew Cards but never makes their role feel auxiliary.
- **Plus-One.** UI badge: *none*. Per `persona-edge-attendees.md`, the +1 Bridge persona explicitly does NOT want to be marked. They are a Member with a *self-authored connection line* on their Crew Card ("here with Tasha — bride's BFF") — that's the only differentiator.

Implementation principle: roles add **micro-affordances** (one private drawer, one badge graphic, one bespoke string per phase), never *gates* in the UI. Celebrant doesn't see a "you can't edit the itinerary" message — they see *"Dave's got this. Here's what they're cooking up."*

---

## Trip Variants — Same Engine, Different Personality

The MVP is one bachelor party. Goal 8 generalizes. Templates aren't *different apps* — they're a personality skin: color palette, copy tone, default activity tags, default vibe tags, and 1-2 template-specific delight moments. The mechanics above are the chassis.

### Bachelorette ("The Reverie")

- **Color palette.** Soft warm peach, gold leaf, deep wine, off-white. *Not* hot pink — that's the cliché trap. Editorial, not Party City.
- **Copy tone.** Warm-irreverent leans more *Nora Ephron* than *frat house*. Voice line at Lock-In: *"Everyone's in. Bring sunscreen and bring opinions."* App-voice on a pin drop: *"This is the moment Sarah claimed the front seat for the rest of the weekend."*
- **Default activity tags.** `brunch` / `pool` / `spa` / `dinner` / `cocktails` / `dance` / `chill` — note `brunch` is first-class, not a `meal` subcategory. `gaming` and `outdoor` are not removed but demoted.
- **Default vibe tags.** `no-themed-shirts` (the inverse of the bach equivalent), `phones-down-at-dinner`, `glam` / `low-key` slider.
- **Template-specific delight: The Lookbook.** Per-event "what to wear" field on itinerary gets a *visual board* — attendees can pin photos of outfits (Pinterest-style) to a shared per-day look. Solves a real coordination problem AND becomes part of the recap. Not patronizing — *every* template has it, it's just *featured* here.
- **Template-specific delight: Sunrise Send-off.** A dedicated final-morning ritual screen — each attendee writes one toast to the bride (140 chars), surfaced on the Departure Lounge. Becomes the final chapter of the Group Recap.

### Ski Trip ("The Cabin")

- **Color palette.** Cold navy, snow white, lodge red accent, deep pine. Texture: matte, not glossy.
- **Copy tone.** Drier, drier wit. Voice line at Lock-In: *"Eight in. Wax your boards."* On a pin drop: *"This is when Marcus admitted he'd never been on a black diamond."*
- **Default activity tags.** `lift` / `lodge` / `apres` / `dinner` / `chill` / `night-out`. `bar` and `club` are demoted in favor of `apres` which has a softer connotation.
- **Default vibe tags.** `ability-level` (green/blue/black per attendee — drives the group/split-group itinerary suggestion), `gear-rental-needed`, `night-skier-yes-no`.
- **Template-specific delight: Conditions Drop.** Daily morning push on the trip: weather + snow report + lift status, app-voice rendered ("8 inches overnight. Lifts open at 8:30. Get up."). Replaces the home screen Live Now card with a *conditions briefing* before the day starts.
- **Template-specific delight: Run Tally.** Voluntary, lightweight — attendees can pin "ran this" on a generic mountain map, no GPS needed, no leaderboard. Becomes the spatial spine of the recap instead of itinerary chapters. (Avoids the Strava-comparison trap — pins are *which runs you hit* not *how fast*.)

### Generic Group Trip ("The Roll")

- **Color palette.** Neutral defaults that the organizer can recolor — set one accent color at trip creation, everything else greyscale.
- **Copy tone.** The base warm-irreverent voice without occasion-specific in-jokes. Voice line at Lock-In: *"Eight in. Let's go."*
- **Default activity tags.** Full set: `meal` / `outdoor` / `chill` / `night-out` / `bar` / `gaming` / `travel`. Organizer can hide/show per trip.
- **Default vibe tags.** Just the universal ones: `phones-down-at-dinner`, `expense-cap-soft`.
- **Template-specific delight: none.** This is the *engine without a skin* — every mechanic above works as-is. We don't try to make it more specific than the data allows.

The variant system is one config file (`/lib/templates/<template>.ts`) per template — palette, copy strings, default tags, and a `delightExtras` array of optional components to mount. Adding a template is hours, not days.

---

## What this implies for the roadmap

- **Goal 4 (announcements + realtime)** — add a `pins` table at the same time. Both mechanics live on the same realtime channel.
- **Goal 5 (itinerary)** — add `activity_tag` + `dress_code` fields. Both feed the Lookbook (bachelorette) and Conditions Drop (ski).
- **Goal 6 (polish + ship)** — Lock-In Day card and the OG share card pipeline land here. Both are pure delight that don't depend on later goals.
- **Goal 7 (expenses + photos)** — Disposable Cam ships *alongside* the photo wall, not after. The `developed_at` timestamp is the only schema delta.
- **Goal 8 (multi-tenant pivot)** — Trip variants and The Time Capsule. The Time Capsule is the retention loop that makes Goal 8 *worth* shipping.

Most of this isn't more work — it's the *same* work, with the personality compiled in instead of left out.
