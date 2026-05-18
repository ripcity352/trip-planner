# Research — Audience + Feature Gaps

> Generated 2026-05-18 by research subagent. Web access (WebSearch/WebFetch) was
> denied during the session, so this is grounded in the agent's training-data
> knowledge of the named apps and the bachelor-party domain rather than live
> citations. Treat specific stats (spend, group size) as ballpark and verify
> before quoting externally.

## 1. Target audience

**Primary user (organizer)** — the Best Man, age **28–36**, urban or suburban
US, iPhone-dominant (bachelor-party demographic skews ~75% iOS in major US
metros), high tech literacy but **low patience**. They are doing this as an
unpaid favor, often while working a full-time job. They are not "trip
planners," they are reluctant coordinators.

**Primary user (attendee)** — 6–14 men, age 26–38, mixed iOS/Android, mixed
tech literacy (one guy will not read anything you send). Typical group size is
**8–12**; trips run **2–4 nights**, usually Thursday–Sunday; per-head spend is
commonly **$800–$1,500** plus flights. Destination is usually a different city
(Nashville, Vegas, Austin, Miami, Scottsdale, New Orleans dominate the US
market).

**How this differs from a "family trip" audience:**

- Bachelor parties have a **single dictator (best man)** and a deferential
  group. Family trips have multiple equal stakeholders and negotiation.
- Bachelor-party content is **time-bounded and disposable** (1 weekend, then
  archived). Family trips recur and want historical data.
- Bachelor parties have **strong privacy needs** — the groom's fiancée should
  not see everything; some attendees don't want photos with their name
  attached. Family trips do not.
- Bachelor parties involve **money collection upfront** (Venmo-the-best-man-$400
  model). Family trips settle after.

**Secondary audiences for Goal 8 (multi-tenant pivot)**, ranked by closeness:

1. **Bachelorette parties** — same shape, slightly larger groups (10–16),
   more decoration/theme coordination, higher photo volume. Closest adjacency.
2. **Guys'/girls' annual trips** ("the lake house weekend") — recurring,
   smaller (6–10), less drama, but want trip-to-trip continuity (last year's
   photos, last year's costs).
3. **Destination-wedding guest blocks** — the wedding has its own site, but
   friend-group sub-coordination (shared Airbnb, ride from airport, who's
   bringing what) is unserved.

Distant 4th: **fantasy football / golf trip leagues** — annual, money-handling,
group-chat-driven. Same DNA.

## 2. Competitive landscape

| App | Does well | Missing for bachelor party | Pattern to borrow |
|---|---|---|---|
| **Partiful** | Beautiful shareable invite link, no-download RSVP, SMS reminders, "who's coming" social proof. Best-in-class onboarding for unauthenticated visitors. | Single-event model. No multi-day itinerary, no expense tracking, no persistent group. | **Phone-number RSVP without account creation** — say "yes" with just a name and number, upgrade to account later. |
| **Squad** | Group polling, photo sharing. | Discontinued/fragmented brand; not trip-shaped. | Lightweight in-thread polls. |
| **Settle Up** | Multi-currency, simple debt graph, clean settle-up suggestions. | Requires every attendee to install; no trip context. | **Debt simplification algorithm** (minimize number of transfers). |
| **Splitwise** | Brand recognition — "just Splitwise it" is a verb. Receipt OCR, recurring expenses. | Paywalled receipt scanning, ads, no event context, ugly mobile web. | Settlement suggestions; "you owe X / X owes you" framing. |
| **Splid** | Works **without accounts** for all attendees — only the creator needs one. Killer for one-off trips. | Expense-only; no itinerary, RSVP, or chat. | **Accountless attendee mode** — single link, no sign-in for everyone but the host. Big unlock for the "guy who won't download anything." |
| **TripIt** | Email-forwarding to auto-parse confirmations into an itinerary. Pro tier adds flight tracking. | Individual-first, not group-first; sharing is read-only; no RSVP, no money, no chat. | **Forward-email-to-import** for flight/hotel confirmations. |
| **Wanderlog** | Best collaborative itinerary editor (map + day-by-day), good mobile web, generous free tier. | Itinerary-first; weak on RSVP, no money pool, no real-time chat, identity per-user not per-trip. | Day-tabs with **per-day map view**; place-cards with photos from Google. |
| **GroupMe** | The default group chat for any group with mixed iOS/Android. SMS fallback. | Pure chat — no structure, no itinerary, no money. Polls are weak. | SMS fallback for non-installers; "@all" mention. |
| **Hugs** (event app) | Co-host roles, theme customization. | Niche; not trip-shaped. | Co-host permission tier — relevant for "best man + maid of honor" coordination on Goal 8. |

**Notable absence in the market:** nobody combines **RSVP + multi-day itinerary
+ money pool + group chat + photos** in one mobile-web app without forcing
downloads. **That's the wedge.**

## 3. Required functionality vs roadmap gaps

Priority-ordered:

| Gap | Where to place it | Why |
|---|---|---|
| **RSVP separate from invite acceptance** | **Goal 2** (must) | Accepting the invite link ≠ "yes I'm coming." Need a 3-state RSVP (in / out / maybe) distinct from "joined the trip." This is the #1 question every best man asks and it's currently unanswered. |
| **Money pool / "Venmo me $X" upfront collection** | **MVP add (Goal 6) or new mini-goal between 6 and 7** | Most-asked feature in bachelor-party planning forums. MVP can skip actual payment processing — track "owed/paid" with manual marks and a Venmo/CashApp deep link per attendee. Real Stripe/Plaid is Goal 7. |
| **Activity voting / polls beyond availability** | **Goal 3 or 5** | Steakhouse A vs B, golf vs paintball. Same primitive as availability polling (options + votes). Should be in MVP. |
| **Late-arrival / partial-attendance flag** | **Goal 2 / 3** | "I can only do Friday night + Saturday." RSVP per-day, not per-trip. Tie into availability poll. **In MVP.** |
| **Accommodation / hotel block coordination** | **Goal 5** (itinerary) | Who's in which room, who's pairing up. Render as a "lodging" block in the itinerary. **In MVP** as a freeform itinerary item; structured rooms list in Goal 7. |
| **Dietary / sober / allergy notes (organizer-visible only)** | **Goal 2** | Collect during RSVP; show only to organizer + the attendee. One sober groomsman or shellfish allergy can derail a dinner reservation. **In MVP**, low cost. |
| **Transport / arrival logistics** (flight #, arrival time, "ride from MCO") | **Goal 5** | Attendee profile fields surfaced on the itinerary's arrival day. **In MVP** as freeform; structured flight parsing later (TripIt-style email forwarding). |
| **Packing list / "bring your own X"** | **Goal 7 or 8** | Nice-to-have but not blocking. Announcements covers it for MVP. |
| **Group chat vs announcements** | **Decision at Goal 4** | Announcements (one-to-many) is correct for MVP. Full chat is much bigger (typing, threading, push). **Recommend: stick with announcements + comments for MVP**, and tell users "use your group text for chat." Trying to replace GroupMe is a losing battle. |
| **Plus-ones / non-member attendees** | **Skip MVP, Goal 8** | Bachelor parties almost never have plus-ones. Skip. |
| **Calendar export (ICS)** | **Goal 5 / Goal 6 polish** | One-line feature, huge perceived value — "add this trip to my calendar." |
| **Per-attendee notes the groom doesn't see** ("surprise gift logistics") | **Goal 6 or 7** | Side-channel for best man to coordinate the surprise without the groom seeing. Differentiator. |

**Things the roadmap has right:** announcements before chat, availability poll
early, photos late (post-trip use case), magic-link auth (zero-friction is
critical here).

## 4. Mobile UX specifics

Shape of the experience: **"text message → tap link → use one-handed in a
bar."**

**(a) Onboarding without a download (mobile web, not app)**
- **Partiful model**: link opens a public page showing event, host's name, and
  existing yes-RSVPs as social proof. RSVP with just name + phone number.
  Magic-link auth fires only when you try to do something stateful (post a
  message, mark availability). **Defer auth as long as possible.**
- Show the trip preview **before** asking for the email. Auth wall = drop-off.
- iOS Safari "Add to Home Screen" via a small PWA manifest gives 80% of native
  feel for 5% of the work. Critical for trip-week.

**(b) Shareable trip URLs**
- Short, memorable slug: `/trip/nashville-jake-2026` not `/trips/8f3a-uuid`.
  Memorable slugs let people text "here's the link again" without scrolling.
- **Invite tokens in URL fragment or query param** that auto-binds on first
  auth — never make someone type a code.
- **Open Graph card** with trip name, dates, host avatar, attendee count. This
  is the preview that renders in iMessage/WhatsApp. **High ROI; first-class
  deliverable, not afterthought.**

**(c) "Is everyone here yet" state**
- Persistent status strip at the top of trip home: **"8 of 11 in · 2 maybe · 1
  hasn't responded."** The single piece of info the organizer checks 20× a
  week.
- Per-attendee avatar row with RSVP color-coding (green/yellow/gray). Tap →
  that person's RSVP detail.
- Realtime presence ("Mike is viewing the itinerary right now") is overkill
  for MVP. Skip.

**(d) The "link mid-night-out" moment**

User is drunk, in a loud bar, on cellular, one-handed, 4% battery.
- **No autoplay video, no large hero images** — kill battery and data.
- **Above-the-fold = the answer**: where am I going, when, who's confirmed,
  what's next on the itinerary. No marketing copy on the trip home.
- **Big tap targets** (min 44pt), bottom-anchored primary action.
- **Works offline-ish**: trip home cached aggressively (Next.js RSC +
  `revalidate`), so reopening on bad signal still shows last-known state.
- **One-tap deep links out**: "Open in Maps," "Call Uber," "Venmo Jake." Don't
  try to be the destination — be the launchpad.

## 5. Risks the roadmap doesn't address

1. **Invite-token leakage via screenshots / forwards.** A `?token=abc` link is
   shareable to anyone, and someone WILL screenshot the trip page and post it
   to the wedding group chat where the bride's family sees it. Mitigations:
   (a) bind tokens to phone/email on first use and invalidate the raw link,
   (b) public preview shows only trip name + date, never attendee list or
   itinerary until authed, (c) per-invite single-use tokens.

2. **"Best-man churn"** — the organizer abandons the trip after the wedding,
   but the data (photos, expense records, payment-owed entries) is still
   legally/socially load-bearing for attendees. Single-owner data models
   break here. Need (a) co-organizer role from day one, (b) ownership
   transfer flow, (c) read-only archive that survives if the owner deletes
   their account. Not addressed in current roadmap.

3. **Liability exposure from user-generated content during a bachelor party.**
   Photos and announcements may include nudity, drug references, or content
   involving non-attendees who didn't consent. Risks: DMCA, revenge-porn
   statutes (varies by state), Apple/Google app-store policy if ever wrapped
   as native. Mitigations needed before Goal 7 (photos): (a) report/takedown
   flow, (b) auto-delete photos after N days unless explicitly archived,
   (c) ToS that puts upload responsibility on the uploader, (d) no
   public-by-default sharing — every photo URL requires auth.

**Honorable mention** — **Supabase storage quota + cost** if the photo wall
goes viral on multi-tenant launch (Goal 8). 14 people × 200 photos × 3MB
each = 8GB per trip. 1,000 trips = 8TB. Budget for this or enforce per-trip
caps before Goal 7 ships.
