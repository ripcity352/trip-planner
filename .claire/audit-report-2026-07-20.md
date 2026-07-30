# Full-app e2e functional + usability audit — 2026-07-20

Method: 8 parallel evaluator agents walked every feature surface of the app live
(localhost:3000 against local Supabase, seeded 3-trip / 10-persona matrix,
375×812 mobile viewport, per-persona Playwright sessions), each combining a
functional walk with an adversarial UX critique against consumer-app norms and
the repo's own design principles. Every non-P3 finding then went through a
skeptic verification pass (live re-repro, code trace, ADR cross-check).
65 raw findings → 23 verified findings + 24 P3 nits after dedup/downgrade;
0 findings refuted outright. Screenshots in
`/private/tmp/claude-501/-Users-carlchang-Projects-Party-Trip/91986cf3-5e48-47b7-b29c-3361012fd81f/scratchpad/shots/`.

## P0 — broken, live-reproduced, data loss

### 1. Editing a travel leg silently wipes airline + flight number (and they never render)
- Repro: add flight → pick "UA / United Airlines" + 1234 → save. DB write is
  correct. But the card never shows "UA 1234", the edit form re-opens with
  blank airline/flight fields, and saving a **notes-only edit nulls both
  columns in the DB** (psql-confirmed twice, two independent agents).
- Root cause: `TRAVEL_LEG_COLUMNS` in `lib/db/travel-legs.ts:12-13` omits
  `airline_iata, flight_number`, while the action's own column list at
  `lib/actions/travel-legs.ts:104-105` includes them — the two lists drifted.
  Read path returns `undefined` → edit-form defaults blank
  (`travel-leg-form.tsx:112-113`) → submit sends `null` (`:145-146`).
- Fix: add the two columns to `TRAVEL_LEG_COLUMNS` (one line); consider a test
  asserting the db column list ⊇ the action's payload keys.

### 2. Itinerary item times can never be saved — and there's no UI path to set one at creation
- Repro: edit any item, set Starts via datetime-local, save → "Didn't save.
  Give it another tap — your connection's flaky." forever. DB `start_time`
  stays NULL. Postgres rejects the write: the edit form sends a UTC ISO-8601
  string (`edit-item-form.tsx:52`) into `start_time time` (without time zone)
  — `lib/actions/itinerary.ts:296` vs `0001_init.sql:270-271`.
- Compounding: the Add form has **no time fields at all**
  (`add-item-form.tsx:187`, date-only) even though the server schema already
  accepts startTime/endTime. Net: no itinerary item anywhere in the app can
  have a time. "When is dinner" — the core value of an itinerary — is dead.
- Corollary bug: if a row ever did hold a DB time (`19:00:00`), the edit
  form's zod `.datetime()` default would fail and block ALL edits of that item.

## The travel form — your seeded critique, validated and extended

Your instinct was right, and the audit shows the individual symptoms are one
modeling gap: **`travel_legs` has no origin, destination, or direction
columns** (psql-confirmed — only kind/depart/arrive/carrier/flight/conf/notes).

- **"Why are times always in Los Angeles?"** — deliberate ADR #382 (datetime-local
  carries no TZ, so the app picked one clock: the trip's). But it contradicts the
  universal airline convention (origin-local departure / destination-local
  arrival), so anyone transcribing their confirmation email enters a wrong
  departure time. The one caption disclosing this sits *below the Arrive field*,
  after "Leave" is already filled. Without an origin column, origin-local time
  is unrepresentable — the ADR was forced by the schema.
- **"Shouldn't only arrival/departure matter?"** — confirmed, stronger than that:
  the **Leave time is used by nothing**. The manifest sorts by `arrive_at` only
  (`lib/db/travel-legs.ts:28`), the dashboard glance reads `arrive_at` only
  (`:55-66`). The form collects a field that is probably-wrong AND unused.
- **No airport (your FYI)** — the manifest can't answer the real coordination
  questions: *which airport* (LAX vs Burbank changes the pickup plan) and *who
  can share a ride*. Heading promises "Who's landing when"; data model can't say where.
- **Return flights corrupt the math** — with no inbound/outbound direction, a
  logged flight home counts toward "X landed / everyone's in" while people are
  flying home (P1).
- Also confirmed on this surface: empty form saves a blank content-free leg
  visible to the whole trip (P1, all fields optional client+server);
  arrive-before-leave accepted silently (P1, no cross-field check);
  confirmation codes (PNRs) broadcast to every member (P2 — a PNR + last name
  can manage/cancel a booking; rule 7 visibility-first says default narrower);
  one-tap no-confirm delete directly under Save (P2); two-field airline entry
  instead of parsing "UA 1234" (P3).

**Recommended shape** (closes all of the above in one redesign): a leg is
*inbound or outbound* with *origin + destination* (airport/city autocomplete or
even free text); show/collect the airline-convention times (origin-local depart,
destination-local arrive — derivable once origin exists); require arrival time
for inbound legs; manifest groups inbound arrivals by airport+time window
("3 of you land at LAX within 40 min — share a car"); dashboard glance counts
inbound legs only.

## P1 — confirmed, core-flow impact

| # | Surface | Finding | Evidence |
|---|---------|---------|----------|
| 3 | posts | Announcements can't be edited or deleted — a typo is permanent | verified live |
| 4 | posts | Multi-line announcements collapse to a single run-on line (schedule posts unreadable) | verified live |
| 5 | nav | Zero loading feedback anywhere — on slow network a tab tap gives nothing for seconds (no skeletons, no spinner, no route progress) | verified live |
| 6 | crew | Per-day headcount counts declined/maybe/pending as "in" — `getPerDayGoingCounts` filters only `trip_member_days.status='going'`, never joins `rsvp_status`; nothing clears day rows when a member declines (`trip-member-days.ts:70-74`, trigger in `m1_foundation.sql:303-337`). This is the number an organizer books tables against | DB-verified: declined member holds 4 stale 'going' rows |
| 7 | home | Trip dates are permanently immutable once set — edit sheet is name+location only; only date-writer is `lockInCandidateAction` (undated trips only). A typo at creation is unfixable without DB access | code-verified `lib/db/trips.ts:336-341` |
| 8 | home | "Lock it in" is single-tap, no-confirm, irreversible, rendered 3× among vote chips at 375px — and #7 makes a mis-tap permanent | `_lock-in-button.tsx:34-58` |
| 9 | itinerary | Deterministic server failures blamed on the user's connection — "Give it another tap — your connection's flaky" loops forever on the P0 above (`lib/copy/errors.ts:195` collapses all save_failed) | verified live |

## Downgraded by verification (deliberate ADRs, critique still open)

- **Celebrant's hidden day vanishes entirely** (no "Something planned"
  placeholder): the 2026-05-20 ADR explicitly rejected placeholders as teasers
  and prescribes the decoy-item pattern — but no decoy exists in practice, so
  the celebrant can double-book the surprise slot. The real gap: nothing
  reminds organizers to add a decoy. P2.
- **Invite minting dead** on this environment: intentional fail-closed shim
  (#397/#139) because local `.env.local` lacks the Upstash vars (they exist on
  Vercel). Not a prod bug; blocks local QA of the whole invite flow. P2, env-config.
- **No balances/settle-up view** and **no per-item split opt-out** (expenses),
  **tab-less orphan pages** (expenses/arrivals/dates light no bottom-nav tab):
  documented decisions; each still worth re-litigating on dogfood evidence.

## P2 — confirmed friction (grouped)

- **Systemic: long display names (80 chars allowed) break the 375px layout**
  on expenses, roster, and arrivals — one root cause, no truncate/min-w-0 on
  member-name renders; one fix (truncate the shared name render) closes all three.
- Expenses: split membership invisible to non-payers; zero-split submit error
  doesn't say what's wrong.
- Posts: pinning is dead surface (schema+badge exist, no UI can pin); URLs not
  tappable; newest post buried under poll+composer+pinned stack.
- Date poll: proposed windows can never be edited/deleted; celebrant's "Works"
  verdict renders no badge (silent default is indistinguishable from unloaded);
  founders can't see who voted what (P3 after downgrade — group chat covers a
  10-person group).
- Dashboard: identical headcount line rendered twice ("Who's in" + "Who's
  coming"); personal RSVP chips sit under a group-question heading.
- Itinerary: item days accepted outside the trip window (silent stray
  section); end-before-start accepted; times settable only via Edit (survives
  the P0 fix); no "now/next" cue and empty days invisible (P3 — deliberate
  code-comment tradeoff).
- Forms/nav: password form collapses all validation errors into one generic
  line; sign-in-and-security page is a dead end (P3); sub-44px tap targets on
  the dashboard ("See the dates" is 20px tall vs the app's own 44pt rule).

## What worked (exercised and clean)

Auth/session handling across 10 personas; RLS visibility held everywhere probed
(organizers_only + hide_from_celebrant leaked nothing, incl. via manifest and
OG surfaces); idempotency held under double-submit on travel legs, expenses,
posts; expense math checked by hand was correct; airline typeahead, RSVP chips,
day chips, reactions cap, create-trip flow, legal pages, 404s, deep-link
round-trip after login; voice/microcopy passes the say-it-out-loud test almost
everywhere (evaluators specifically praised empty states).

## Suggested fix order

1. The two P0 one-liners-plus-tests (travel column drift; itinerary `time`
   column vs ISO string + add-form time fields).
2. Error-copy split: deterministic server failure ≠ flaky connection.
3. Headcount correctness (join rsvp_status / clear day rows on decline).
4. Travel-leg model rework (origin/destination/direction) — closes the
   timezone complaint, the airport gap, return-flight corruption, and the
   Leave-field confusion in one migration + form pass.
5. Systemic name truncation; then the P2 batch.
