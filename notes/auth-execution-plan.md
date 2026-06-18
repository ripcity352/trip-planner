# AUTH Execution Plan — login/invite chain closure

> Dated 2026-06-17. Structured for a `/goal`-driven, subagent-parallel
> push. Mirrors `carry-execution-plan.md` / `m3-execution-plan.md` shape
> (Constraints → waves → file-ownership matrices → per-PR contracts →
> DoD `[d]`/`[v]` → closure checklist → per-wave reading lists). The goal
> loop reads this file on every turn — keep it terse and verifiable. Tick
> DoD checkboxes as work lands.
>
> Source of scope: the `AUTH — login/invite chain closure` GitHub
> milestone (9 issues): #263, #122, #219, #141, #139, #128, #106, #255,
> #232. These are M5 / trip-readiness auth carry-backs — landing/login
> voice, invite magazine layout + OG card, an OTP rate-limit budget, a
> fail-closed-posture assert, the redirect-allowlist doc, a POST-only
> accept-route regression test, a fresh-OTP State-B walk, and the
> OAuth-existing-user alert (deferred behind a human dashboard step).

## Milestone framing (load-bearing — re-read every wave)

This is a **BETWEEN-MILESTONES, PRE-GATE wave** (the DS / CARRY pattern).
It is **config + copy + read-only-render + docs/walk** only. The
architect verdict is binding:

- **ZERO new server-action mutations.** No new mutation surface is
  authored. The #232 producer (`auth_email_taken_oauth` from
  `signInWithPasswordAction`) + consumer (stripped `_form.tsx` OAuth
  alert) are **deferred to one future PR** gated on the Google OAuth
  provider being enabled — not built this wave.
- **ZERO migrations.** No new tables, no new columns, no enum changes,
  no RLS swap. **Any SQL is a hard-stop.**
- **ZERO new product surface gated behind M6.** The invite/login chain
  already exists; this wave polishes voice, hardens the invite preview
  render (read-only, anon RPC-sourced), adds one rate-limit budget +
  one assert, and documents the now-live redirect allowlist.

North star unchanged: **one bachelor party, insider (celebrant-vs-
organizer) threat model.** The friction-vs-security philosophy holds —
the email-OTP factor still needs inbox access, so the rate-limit shim
stays **OPEN-on-outage** (see #139 below).

> ### ⛔ Real-trip retro gate STILL IN PLACE
> AUTH does **not** lift, touch, or depend on the real-trip
> retrospective gate. **M6 features remain gated** exactly as before —
> same bright line as M4 / M5 / CARRY. The closure ADR records "AUTH
> shipped WITH the real-trip gate STILL in place." Do **not** mark a
> roadmap milestone done. Do **not** claim the gate is lifted. Do
> **not** flip any M6 surface to reachable.

---

## Constraints (re-read every wave)

These carry the M3 / CARRY Overrides A–G verbatim-in-spirit, add the
J / K / L rulings carried from the CARRY set, then layer the
AUTH-specific rulings.

### Override A — Real-browser 375×812 smoke (scoped to surface-touching PRs)
CI green ≠ change works. The MCP-driven Playwright session at 375×812
against the Vercel preview, with a screenshot pasted under
`## Preview smoke (375px)`, is **required on every PR that changes a
rendered surface** — here that is **W1 (#263 landing affordance, #122
login voice)** and **W2 (#219 invite magazine layout + OG card)**.
Pure-test, pure-config, and pure-docs PRs (W0, W3-doc) do not need this
section. **C4 lives here: a 375px prod/preview smoke runs on EVERY code
wave (W1, W2).**

### Override B — Cross-wave infra (Wave 0) lands first; no `test.fixme` substitutes
Wave 0 (shared copy keys, the rate-limit budget, the shared fixture, the
voice-lock) is a **hard merge-blocker** before any W1 / W2 PR opens. W1
and W2 consume W0's `lib/copy/auth.ts` keys and W0's shared fixture — so
**W0 merges first** and no later PR may stub a W0 dependency with
`test.fixme` and defer; the thing it consumes must already be on `main`.

### Override C — Tests live in `lib/`, `components/`, `tests/` only
`app/` is excluded from the vitest glob. Every PR with tests gets a
manual `grep -rEn "\b(describe|test|it)\(" app/` check by the wave agent
— non-empty = fail the wave gate. (Word-boundary form is mandatory — the
bare `it\(` pattern false-matches `Submit(`.) The #106 regression test
and the #219 OG injection test both live under `lib/` or `tests/`, never
under `app/**/__tests__/`.

### Override D — Reviewers dispatch in PARALLEL; security-reviewer scoped
On PR open, dispatch `code-reviewer` always. Dispatch `security-reviewer`
**in the same batch (single message)** on the **auth-sensitive PRs** —
here that is **W0 (the #141 rate-limit budget + #139 fail-closed
assert)** and **W2 (#219 OG injection / escaping / oversize + #106
POST-only accept-route regression)**. The voice / copy / docs PRs run
**`code-reviewer` only**. One consolidated fix-up round, **< 100 LOC**;
do not stage round-2 reviews.

### Override E — DoD has a `verified` axis
Each DoD line has two checkboxes:
- `[d]` *declared*: shipped, CI green, reviewer(s) approved.
- `[v]` *verified*: exercised at closure per the per-issue `[v]`
  definition (see DoD section).

`[d]` ✓ is allowed mid-wave; `[v]` ✓ is **closure-only**. #255's `[v]`
is the State-B set-password walk on a fresh OTP-only account. #232's
`[v]` is a **carry-forward** (provider OFF — cannot be verified this
wave).

### Override F — No inline UI string literals; pull from `lib/copy/*`
Every UI string is sourced from `lib/copy/*`. The #122 voice pass pulls
the remaining inline login stragglers into `lib/copy/auth.ts`. The #263
landing affordance and the #219 invite H1 / OG card strings are
**pre-seeded in W0** (D1) and read-only thereafter. An inline `"…"`
literal in a JSX leaf on the login / landing / invite surface is a
review-blocker.

### Override G — `app/page.tsx` ownership at closure
W1 **owns** `app/page.tsx` (it adds the #263 landing affordance). Closure
therefore confirms `app/page.tsx` already reflects AUTH reality (the
new-account affordance shipped in W1) — no separate closure edit needed,
but the closure ADR records it explicitly. Orphaning the landing page
is out of bounds.

### Override J — Wave worktree timing (add/add conflict avoidance)
Pre-create a wave's worktrees **only AFTER the preceding wave fully
merges.** W1 / W2 worktrees are created only after W0 is entirely on
`main` (they consume W0's copy keys + fixture); a later PR that re-touches
a file a prior PR created does not collide.

### Override K — Phantom-wiring audit on deferred producer+consumer
Carried from the trip-readiness polish-sweep pattern. **#232 is the
phantom-wiring gate for this wave.** Its producer
(`auth_email_taken_oauth` from `signInWithPasswordAction`) and consumer
(the stripped `_form.tsx` OAuth alert) **must land together in ONE future
PR** — never half-wired. This wave ships **neither half**. The W3
tracking note records the gate so the future PR lands both ends in one
commit, with the Google provider enabled first.

### Override L — Review-reality declaration (match PR bodies to this)
The execution reality this wave: agents `security-reviewer` +
`code-reviewer` dispatch **in parallel** (per Override D's scoping); the
**orchestrator squash-merges** after reviews pass. **There is NO named
human review gate** in the loop — Carl is surfaced walk-only / human-step
items at closure (#255 walk, #232 provider enablement) but does not gate
each PR merge. **Every PR body must state this review reality** (agent
reviewers + orchestrator squash-merge; no named human gate) rather than
implying a human approver that does not exist.

### AUTH-specific rulings (FINAL — do not re-litigate)

- **#232 is DEFERRED + GATED, not built.** Keep #232 **OPEN** in the
  milestone with a `(human-step: enable Google provider)` blocker note.
  Do NOT build the RPC, the producer, or the consumer this wave. Carry
  it forward to the next pre-flight. Its `[v]` is a carry-forward
  (provider OFF).
- **#139 is RE-SCOPED to assert-only.** Do **NOT** add any AUTH scope to
  `FAIL_CLOSED_ON_SHIM`. Add a unit assert that **`AUTH_OTP_VERIFY` +
  `ACCEPT_INVITE` STAY OUT** of the fail-closed set, plus one ADR line in
  `notes/decisions.md`. The shim-**OPEN** posture is load-bearing:
  *lockout-on-outage > brute-force-during-bootstrap; the email-OTP factor
  still needs inbox access.* Adding AUTH scopes to the fail-closed set is
  a hard-stop.
- **#141 budget is 10 req / 15 min per email — NOT 5/hr.** The stale
  "ratchet to 5/hr" comment (D2, lines 73–77 of `lib/rate-limit/index.ts`)
  is **deleted** in the same co-located change block.
- **#106 is verify-only.** The GET handler is **already removed**
  (`app/invite/[token]/accept/route.ts:101`). The deliverable is a
  **regression test asserting GET → 405/gone** — **no behavior change**.
- **#219 OG card is net-new.** No `ImageResponse` route exists today;
  `app/invite/[token]/opengraph-image.tsx` is created fresh. It sources
  **ONLY** from the bucketed anon `invite_preview` RPC (never request
  headers), clamps + sanitizes inputs (D3), and falls back to a generic
  card on RPC error.
- **#255 is walk-only.** A fresh OTP-only **REAL** account (no password
  ever set), operator-driven prod `[v]` walk verifying State B renders on
  `/account/sign-in-and-security`. No code.
- **#128 is doc-only.** Document the now-live Supabase Auth redirect
  allowlist as a `deployment-readiness.md` **last-verified config
  snapshot** + a runbook note.
- **Never stage** the pre-existing working-tree edits to `CLAUDE.md` /
  `notes/collaboration.md`, nor the `.claire/` / `.claude/` directories.
  Closure touches `CLAUDE.md` deliberately; those WIP edits are NOT part
  of any AUTH PR.

---

## Reality check (state at AUTH start)

- **Landing (#263):** `app/page.tsx` has no new-account affordance for a
  fresh invitee arriving cold. The fix is **occasion-framed, NOT account
  language** — "Got a link from a friend? Tap it — that's your way in."
  (D1 `landing_invite_affordance`). No "sign up / create account" copy.
- **Login voice (#122):** stragglers remain inline in `app/login/**`
  rather than in `lib/copy/auth.ts`. The pass pulls them into
  `lib/copy/auth.ts` and voice-reviews against the anti-tell denylist.
- **Invite layout + OG (#219):** `/invite/[token]` is functional but not
  a "magazine" layout, and there is **no** `opengraph-image.tsx` — links
  pasted into a group chat render no card. Net-new OG route + layout
  pass. OG inputs must be injection-safe (D3).
- **Rate-limit budget (#141):** `AUTH_OTP_VERIFY` currently inherits the
  default 30 req / 60 s. The OTP-verify path wants a tighter
  **10 / 15 min per email** budget. A stale "ratchet to 5/hr" comment
  sits at `lib/rate-limit/index.ts:73-77` — delete it.
- **Fail-closed posture (#139):** the shim is **OPEN-on-outage** by
  design. `FAIL_CLOSED_ON_SHIM` must **not** include AUTH scopes. The
  deliverable is an **assert** pinning that posture + an ADR line — no
  behavior change.
- **Redirect allowlist (#128):** the Supabase Auth redirect allowlist
  (`https://travelston.com/auth/callback` + `https://*.vercel.app/auth/callback`)
  is now live but only documented as a generic dashboard row. #128 adds
  a **last-verified config snapshot** + runbook note.
- **Accept route (#106):** the GET handler is **already removed** at
  `app/invite/[token]/accept/route.ts:101`. Deliverable is a regression
  test that GET → 405/gone (the invite-redirect contract: `next` must be
  GET-navigable; `/invite/[token]/accept` is POST-only — P0 #316 from a
  real walk).
- **State B / fresh OTP (#255):** no fresh OTP-only account has walked
  the State-B set-password surface on `/account/sign-in-and-security` in
  prod. Needs Carl's operator-driven walk (no password ever set on the
  account).
- **OAuth-existing-user alert (#232):** producer + consumer not wired;
  **Google OAuth provider is currently OFF** in the Supabase dashboard.
  Deferred + gated.

**Schema reality:** unchanged. **AUTH adds ZERO migrations.** Any SQL is
a hard-stop.

---

## Architect Wave-0 deliverables (D1–D5)

W0 pre-seeds everything W1 / W2 consume, so the surface waves read
copy / fixtures / budgets read-only.

### D1 — `lib/copy/auth.ts` pre-seed (before consumers)
Add (occasion-framed, no account language):
- `landing_invite_affordance` = **"Got a link from a friend? Tap it — that's your way in."**
- `og_card` = **"You're invited — {Trip} · {dates}."** — *(Phase-4 voice
  fix: dropped the "{host}'s crew" possessive — frat-coded "crew" +
  excludes the +1 / late-arrival who isn't part of the established
  friend-group, and double-renders the host on a celebrant-named trip.)*
- `invite_h1` = **"{Host} wants you on this one."**
- `invite_h1_fallback` = **"You're on the list."** — used when `host` is
  null/empty OR `host == trip celebrant name` (avoids "Dave wants you on
  Dave's Bender" self-reference per CLAUDE.md §11 asymmetry).
- the **#122 login keys** (the pulled-in stragglers — named per the
  voice pass).

**Interpolation-fallback contract (Phase-4 voice fix — binds D1 + D3):**
- Null/empty `host` → `invite_h1_fallback` on-page; generic card for OG.
- Null/empty `trip` or `dates` → omit the missing segment cleanly (no
  dangling "· ."); OG falls back to the generic card.
- On-page `invite_h1` host name clamps to ~30 chars + ellipsis (D3
  clamps the OG card; the on-page H1 needs its own clamp).

### D2 — `lib/rate-limit/index.ts` single co-located change block
- Add `[AUTH_OTP_VERIFY]: { limit: 10, window: "15 m" }` to `SCOPE_BUDGETS`.
- **Delete the stale "ratchet to 5/hr" comment (lines 73–77).**
- Add the **#139 assert** (in the rate-limit test): `AUTH_OTP_VERIFY` +
  `ACCEPT_INVITE` are **NOT** in `FAIL_CLOSED_ON_SHIM`.

### D3 — `#219` OG injection guard (ship a test)
- Clamp `trip_name` / `host` to **~40 / 30 chars + ellipsis**.
- **Strip control chars + collapse whitespace** — explicitly including
  `\r \n    ` (line/paragraph separators are the OG-text
  injection sink, not just C0 controls). *(Phase-4 coverage fix.)*
- Source **ONLY** from the bucketed anon `invite_preview` RPC — **never
  request headers.**
- **Generic-card fallback on RPC error OR null/empty field** (not just
  RPC error — a null `host`/`trip` must also fall back, per the D1
  interpolation contract). *(Phase-4 voice fix.)*
- Ship an **injection / escaping / oversize test** (cases: HTML/markup in
  trip name, CRLF + ` ` in host, 500-char trip name, null host, null
  trip).

### D4 — shared invite/OTP test fixture
One factory `{ token, email, otp }` consumed by **both** the #106
regression test **and** the #141 budget assert. Pure fixture; no app
import.

### D5 — voice-lock extension
Extend `lib/copy/__tests__/m5-auth-voice-locks.test.ts`:
- **Pin** the D1 strings (`landing_invite_affordance`, `og_card`,
  `invite_h1`, `invite_h1_fallback`).
- **Anti-tell denylist (Phase-4-expanded — surface-specific tells):**
  `"welcome back"`, `"get started"`, `"sign up"`, `"create account"`,
  `"don't miss out"`, `"join now"`, `"join the trip"`, `"RSVP now"`,
  `"claim your spot"`, `"complete your profile"`, `"you're almost there"`,
  `"let's make memories"`, `"get pumped"`, `"spots left"` (false
  scarcity), `"top responders"`, `"first to RSVP"` (leaderboard nouns),
  `"crew"` (frat-coded), and any **progress/completion-score** string
  (`"% responded"`, `"of 8"`, `"X of Y going"`). Assert no required-field
  asterisk in any copy value.

### D6 — State-B identity regression lock (Phase-4 coverage fix; prevents #233 replay)
`#233` (the M5-walk bug where `/account/sign-in-and-security` rendered
State A for OTP-only users) was fixed via the `has_password` shadow
column. #255 only *walks* State B — if that fix ever regresses, the walk
re-discovers #233 instead of verifying it. Add a unit test
(`tests/unit/identity-state-has-password.test.ts`) asserting the
identity-state derivation keys off **`has_password`**, NOT a provider-only
`identities.some(provider === "email")` check: a user with an email
identity but `has_password = false` must derive **State B**. This is a
no-op regression-lock on already-shipped code — confirm the current
derivation source before writing (the `has_password` column shipped in
the trip-readiness sweep).

---

## Wave 0 — shared infra (1 PR; merge-blocker for W1 + W2)

**Hard merge-blocker before any W1 / W2 PR opens.** W0 ships D1–D5 and
closes the two infra issues (#141 budget, #139 assert-only). W1 / W2
consume W0's copy keys + fixture, so **W0 merges first.**

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **0a** | `chore/auth-shared-infra` | `Closes #141`<br>`Closes #139` | `lib/copy/auth.ts` (D1 pre-seed: `landing_invite_affordance`, `og_card`, `invite_h1`, `invite_h1_fallback`, #122 login keys), `lib/rate-limit/index.ts` (D2 co-located block: add `AUTH_OTP_VERIFY` 10/15m, delete stale 5/hour comment), `tests/fixtures/invite-otp.ts` (**new** — D4 `{token,email,otp}` factory), `lib/copy/__tests__/m5-auth-voice-locks.test.ts` (D5 voice-lock + expanded denylist), `lib/rate-limit/__tests__/index.test.ts` (D2 budget + #139 fail-closed assert), `tests/unit/identity-state-has-password.test.ts` (**new — D6** State-B identity regression lock; see below) | the rate-limit test, the voice-lock test, the **D6 identity-state lock**, a fixture-smoke test placed under `tests/unit/` (the fixture itself is import-only, outside the vitest glob) | medium |

**Reviewers:** `code-reviewer` **+** `security-reviewer` in parallel (the
rate-limit budget + the fail-closed assert are auth-sensitive). One
fix-up round, < 100 LOC.

**#139 assert contract (FINAL — assert-only):**
```
expect(FAIL_CLOSED_ON_SHIM).not.toContain(AUTH_OTP_VERIFY)
expect(FAIL_CLOSED_ON_SHIM).not.toContain(ACCEPT_INVITE)
```
Plus one ADR line in `notes/decisions.md` (landed in this PR):
*"AUTH scopes stay OUT of the fail-closed shim set — lockout-on-outage >
brute-force-during-bootstrap; the email-OTP factor still needs inbox
access. The shim-OPEN posture is load-bearing."*

**Gate to W1 & W2 (run AFTER 0a merges):**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "\b(describe|test|it)\(" app/ || echo "OK: no tests in app/"
# Budget is present + tight:
grep -nE "AUTH_OTP_VERIFY" lib/rate-limit/index.ts        # 10 / "15 m"
# Stale comment is gone (Phase-4 fix: match the REAL comment text "ratchet this down to ~5 / hour", not a paraphrase):
grep -niE "ratchet.*5 ?/ ?hour" lib/rate-limit/index.ts && echo "FAIL: stale comment still present" || echo "OK: stale comment deleted"
# Fail-closed posture pinned:
grep -n "FAIL_CLOSED_ON_SHIM" lib/rate-limit/__tests__/index.test.ts
# D1 keys present for W1/W2 consumers:
grep -nE "landing_invite_affordance|og_card|invite_h1" lib/copy/auth.ts
# Shared fixture present for #106 + #141 consumers:
test -f tests/fixtures/invite-otp.ts && echo "OK: fixture present"
```
W1 and W2 stay closed until 0a is on `main`.

**Out of scope for W0:** any rendered-surface change (that's W1 / W2),
any new mutation, any SQL, any FAIL_CLOSED_ON_SHIM addition.

**Risk: medium.** The rate-limit budget + the fail-closed assert are the
only auth-sensitive surface; the blast radius of the copy / fixture /
voice-lock is the test harness + read-only palette.

---

## Wave 1 — login / landing (2 PRs; W0 copy keys consumed read-only)

Opens after W0 merges. **Two PRs, distinct files, parallel-eligible.**
Both consume W0's `lib/copy/auth.ts` keys read-only. **375px smoke
required on both (Override A / C4).**

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **1a** | `feat/landing-invite-affordance` | `Closes #263` | `app/page.tsx` (render `landing_invite_affordance`; occasion-framed, NO account language) | `tests/unit/landing-affordance.test.tsx` (renders the key, no banned copy) | low |
| **1b** | `chore/login-voice-pass` | `Closes #122` | `app/login/_form.tsx` + `app/login/**` (pull inline stragglers → `lib/copy/auth.ts` keys; no inline literals) | `app/login` consumers covered by D5 voice-lock; add a render assert under `tests/unit/` if a leaf needs one | low |

**Coordination rule:** zero file overlap. 1a owns `app/page.tsx`; 1b owns
`app/login/**`. Both **read** `lib/copy/auth.ts` (W0-owned) — neither
writes it. The voice-lock (D5) is the regression guard for both;
**no new copy keys are minted in W1** (Override F — keys live in W0).

**Acceptance (both):** 375px preview/prod smoke screenshot in PR body
under `## Preview smoke (375px)` — landing shows the invite affordance in
occasion voice (no "sign up / create account"); login renders all
strings from `lib/copy/auth.ts` with no inline leaf literals.

**Verification gate after W1:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "\b(describe|test|it)\(" app/ || echo "OK: no tests in app/"
# No account-language on landing (D5 denylist covers it, but re-grep the surface):
grep -niE "sign up|create account|welcome back|get started|don't miss out" app/page.tsx app/login/ || echo "OK: no anti-tells"
# Phantom-wiring: the W0-pinned landing key has a render-site producer (not a dead pin):
grep -rn "landing_invite_affordance" app/page.tsx
# 375px preview smoke (Override A) — screenshots in both PR bodies
```
**Risk: low.** Copy + render only, no logic. The voice-lock + denylist
are the containment; the only failure mode is a banned phrase slipping
in, which D5 catches.

---

## Wave 2 — invite (2 PRs; W0 OG-guard + fixture consumed)

Opens after W0 merges (worktrees created only after W1 fully merges —
Override J — to avoid any add/add collision on shared invite files).
**Two PRs.** Both auth-sensitive → `security-reviewer` + `code-reviewer`
in parallel. **375px smoke required on 2a (Override A / C4).**

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **2a** | `feat/invite-magazine-and-og` | `Closes #219` | `app/invite/[token]/page.tsx` (magazine layout; render `invite_h1`), `app/invite/[token]/opengraph-image.tsx` (**net-new** ImageResponse; D3 clamp/sanitize; anon `invite_preview` RPC only; generic-card fallback), `lib/og/invite-card.ts` (**new** — D3 sanitize/clamp helper if extracted) | `lib/og/__tests__/invite-card.test.ts` (D3 injection / escaping / oversize), invite page render test under `tests/unit/` | medium |
| **2b** | `test/accept-route-post-only` | `Closes #106` | `tests/unit/accept-route-method.test.ts` (**new** — GET → 405/gone regression; consumes D4 fixture) | the new regression test | low |

**Coordination rule:** zero file overlap. 2a owns
`app/invite/[token]/page.tsx` + the net-new `opengraph-image.tsx` (+ the
optional `lib/og/` helper); 2b owns the new accept-route regression test
only — it **does NOT touch** `app/invite/[token]/accept/route.ts` (the
GET handler is already removed at `:101`; #106 is **verify-only, no
behavior change**). Both **read** W0's `lib/copy/auth.ts` (`invite_h1`)
and the D4 fixture.

**#219 OG contract (C2 — must visibly pass the D3 test):**
- Inputs sourced **ONLY** from the bucketed anon `invite_preview` RPC —
  **never request headers.**
- Clamp `trip_name` ~40 / `host` ~30 chars + ellipsis; strip control
  chars; collapse whitespace.
- **Generic-card fallback** on RPC error (no crash, no leak).
- The injection / escaping / oversize test is a **merge-blocker** for 2a.
- **Anti-pattern guard (Phase-4 voice fix — NAMED acceptance):** 2a's
  invite layout ships **ZERO** completion-count, RSVP-speed, leaderboard,
  progress-bar, or "X of N going / responded" affordance. The invite is
  not a project with a done state. A plain attendee count is fine; a bar,
  a score, or a "be the first to RSVP" is a review-blocker (CLAUDE.md
  hard-banned patterns). The D5 denylist + the `code-reviewer` enforce
  this; the smoke screenshot is eyeballed for it.

**#106 contract (verify-only):**
- The GET handler is **already removed** (`accept/route.ts:101`). The
  regression test asserts **GET → 405/gone**. **No behavior change** — if
  the agent edits `accept/route.ts`, that is a scope violation → stop.
- **(Phase-4 fix — make the test meaningful):** the test must ALSO assert
  `POST` is exported and reachable (POST returns non-405). GET→405 alone
  passes *vacuously* if the whole route is deleted — Next.js 405s any
  method on a missing route. Asserting POST works makes the lock fail on
  route deletion, not just on a re-added GET handler.

**Verification gate after W2:**
```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
grep -rEn "\b(describe|test|it)\(" app/ || echo "OK: no tests in app/"
# OG card sources from RPC, never headers (grep the new route):
grep -n "invite_preview" app/invite/[token]/opengraph-image.tsx
grep -niE "headers\(|x-forwarded|request\.headers" app/invite/[token]/opengraph-image.tsx || echo "OK: no header sourcing"
# #106 regression test asserts BOTH GET→405 AND POST reachable (non-vacuous):
grep -nE "405" tests/unit/accept-route-method.test.ts && grep -niE "POST" tests/unit/accept-route-method.test.ts
# Phantom-wiring: the W0-pinned invite keys have render-site producers (not dead pins):
grep -rn "invite_h1" app/invite/[token]/page.tsx
grep -rn "og_card" app/invite/[token]/opengraph-image.tsx
# #106 did NOT edit the route (verify-only):
git diff --name-only origin/main...HEAD | grep -q "accept/route.ts" && echo "VIOLATION: route edited" || echo "OK: route untouched"
# 375px preview smoke (Override A) — invite magazine layout + OG card screenshots in 2a PR body
```
**Risk: medium (2a — OG injection surface), low (2b — pure test).** 2a's
OG route is the only novel render; the D3 test + the RPC-only sourcing +
the generic fallback are the containment. `security-reviewer` reviews 2a
for header-sourcing, escaping, and the fallback path.

---

## Wave 3 — docs + walk + deferred tracking (1 doc PR; 1 walk; 1 tracking note)

Opens after W1 + W2 merge. The doc PR is the only code-tree change; the
#255 walk and the #232 tracking are closure-surfaced.

| ID | Branch | Closes | Owns (files) | Tests claimed | Risk |
|---|---|---|---|---|---|
| **3a** | `docs/auth-redirect-allowlist` | `Closes #128` | `notes/deployment-readiness.md` (redirect-allowlist last-verified config snapshot + runbook note), `notes/runbooks/auth-setup.md` (runbook note, if the allowlist click-path lands there) | none | low |

**3a — #128 auth-config snapshot (H3 / C-doc):**
Add a **last-verified config snapshot** row to `deployment-readiness.md`
recording the now-live Supabase Auth config. **Broadened (Phase-4 fix) to
the full pre-walk eyeball set, not just the allowlist:** the redirect
allowlist (`https://travelston.com/auth/callback` + the Vercel preview
wildcard `https://*.vercel.app/auth/callback`), **Email OTP Length = 6**,
**Site URL = `https://travelston.com`**, and the `{{ .Token }}` email
template — each with a `Last verified` date and a runbook pointer for
re-verifying after any domain/provider change. This snapshot IS the
checklist the closure-walk step 0 reads. Doc-only; `code-reviewer` only.

**#255 — fresh OTP-only State-B walk (walk-only; C3):**
Operator-driven (Carl) prod `[v]` walk on a **fresh OTP-only REAL
account (no password EVER set)**: sign up via OTP → land on
`/account/sign-in-and-security` → verify **State B** (set-password
surface) renders. No code; this is the #255 `[v]`. Surfaced to Carl in
the closure PR body. **(Phase-4 voice fix:** the walk includes a one-look
voice eyeball of the State-B OTP-only helper copy — it's pre-existing
copy, but State B is the one surface a real fresh user lands on, so
confirm it still passes the dinner test.)

**#232 — deferred-tracking (C1 / Override K):**
Keep **#232 OPEN** in the milestone with a
`(human-step: enable Google provider)` blocker note. The closure ADR
records the **phantom-wiring gate**: when built, the producer
(`auth_email_taken_oauth` from `signInWithPasswordAction`) **and** the
consumer (stripped `_form.tsx` OAuth alert) land in **ONE** PR, gated on
the Google OAuth provider being enabled (Supabase Dashboard →
Authentication → Providers → Google → Enable). **Carry-forward to the
next pre-flight.** Its `[v]` is a carry-forward (provider OFF — cannot
verify this wave).

**Verification gate after W3:**
```
pnpm typecheck && pnpm lint && pnpm build
# #128 snapshot present + dated:
grep -niE "redirect.+allowlist|auth/callback|vercel\.app/auth/callback" notes/deployment-readiness.md
# #232 still OPEN with the blocker note:
gh issue view 232 --json state,labels,body | grep -i "human-step: enable Google provider"
```
**Risk: low.** Docs + tracking only.

---

## DoD checklist (source of truth — check as work lands)

Two axes per Override E. `[v]` ticked at closure only. `[v]` definitions
per issue are recorded inline.

**Wave 0 — shared infra**
- [ ]d [ ]v #141 `AUTH_OTP_VERIFY` budget = **10 / 15 min per email**; stale "ratchet to 5/hr" comment (`index.ts:73-77`) deleted (PR 0a) — `[v]` = **budget assert green in CI + grep proof**
- [ ]d [ ]v #139 assert-only: `AUTH_OTP_VERIFY` + `ACCEPT_INVITE` **NOT** in `FAIL_CLOSED_ON_SHIM`; ADR line landed (PR 0a) — `[v]` = **assert green in CI + ADR present (no surface walk)**

**Wave 1 — login / landing**
- [ ]d [ ]v #263 landing new-account affordance — occasion-framed, **NO account language** (PR 1a) — `[v]` = **375px landing screenshot (affordance present, no anti-tells)**
- [ ]d [ ]v #122 login voice pass — stragglers pulled to `lib/copy/auth.ts`, voice-reviewed (PR 1b) — `[v]` = **375px login screenshot + D5 voice-lock green**

**Wave 2 — invite**
- [ ]d [ ]v #219 `/invite/[token]` magazine layout + net-new `opengraph-image.tsx` (D3 clamp/sanitize, RPC-only, generic fallback) (PR 2a) — `[v]` = **375px invite-preview screenshot + OG injection test green** (C2)
- [ ]d [ ]v #106 GET → 405/gone regression test (route already POST-only; **no behavior change**) (PR 2b) — `[v]` = **regression test green in CI (no surface walk)**

**Wave 3 — docs / walk / deferred**
- [ ]d [ ]v #128 redirect-allowlist last-verified snapshot + runbook note (PR 3a) — `[v]` = **snapshot row present + dated**
- [ ]d [ ]v #255 fresh OTP-only **REAL** account (no password ever set), State-B renders on `/account/sign-in-and-security` (**walk-only**) — `[v]` = **operator-driven prod walk (Carl); the State-B `[v]`** (C3)
- [ ]d **#232 DEFERRED** — producer + consumer land in ONE future PR, gated on Google provider enablement; kept **OPEN** with `(human-step: enable Google provider)` — `[v]` = **CARRY-FORWARD (provider OFF; cannot verify this wave)** (C1 / Override K)

**Process / closure**
- [ ]d [ ]v `app/page.tsx` — reflects AUTH reality (the #263 affordance shipped in W1, Override G); recorded in closure ADR
- [ ]d [ ]v `notes/retros/auth-retro.md` authored (two-lens per pattern)
- [ ]d [ ]v `notes/decisions.md` "AUTH — milestone closed" ADR appended (incl. shim-OPEN posture, #232 phantom-wiring gate, #106 verify-only outcome)
- [ ]d [ ]v `CLAUDE.md` "Current phase" + carry-forwards list updated; gate STILL in place
- [ ]d [ ]v #255 + #232 flagged to Carl at closure (walk + provider human-step — out of scope here)

---

## Closure wave checklist

Single branch: `chore/auth-done`. Single PR.

**Touches:**
- `CLAUDE.md` — update "Current phase" to record AUTH shipped **WITH the
  real-trip gate STILL in place**, and update the carry-forwards list
  (remove the items AUTH closed: #263, #122, #219, #141, #139, #128,
  #106; keep #232 + #255 as carry-forwards).
- `notes/decisions.md` — append **"AUTH — milestone closed"** ADR at the
  top: the load-bearing decisions (the shim stays **OPEN-on-outage** —
  AUTH scopes out of `FAIL_CLOSED_ON_SHIM`; #141 = 10/15min not 5/hr;
  #219 OG sources anon RPC only + generic fallback; #106 verify-only, no
  behavior change; #232 phantom-wiring gate — producer + consumer in ONE
  future PR behind the Google-provider human-step) **and the explicit
  statement: "AUTH shipped WITH the real-trip retro gate STILL in place;
  M6 features remain gated."**
- `notes/retros/auth-retro.md` (**new**) — two reconciled lenses per
  pattern (TL;DR, what shipped, what slipped, follow-up triage, process
  learnings).
- `app/page.tsx` — Override G check; expected outcome **already reflects
  AUTH reality** (the #263 affordance shipped in W1), recorded in the
  closure ADR.
- `notes/auth-execution-plan.md` (this file) — tick `[d]` and `[v]`.

**Closure-deviation note (do NOT):**
- Do **NOT** mark a roadmap milestone done — the §AUTH roadmap section is
  the scope record; the closure ADR is the outcome record (per CARRY /
  DS precedent).
- Do **NOT** claim the real-trip gate is lifted.
- Do **NOT** flip any M6 surface to reachable.
- Do **NOT** build the #232 producer/consumer (provider OFF — deferred).
- Do **NOT** stage the pre-existing working-tree edits to `CLAUDE.md` /
  `notes/collaboration.md`, nor the `.claire/` / `.claude/` dirs.

**Final AUTH gate:**
```
1. Local green: pnpm typecheck && pnpm lint && pnpm test && pnpm build
2. Test-in-app check: grep -rEn "\b(describe|test|it)\(" app/ → 0 lines
3. Fail-closed assert re-run: AUTH_OTP_VERIFY + ACCEPT_INVITE NOT in FAIL_CLOSED_ON_SHIM → green
4. Budget grep: AUTH_OTP_VERIFY = 10 / "15 m"; "ratchet to 5/hr" comment gone
5. #106 route-untouched proof: git diff origin/main...HEAD has no accept/route.ts edit
6. Issue queue: gh issue list --milestone "AUTH — login/invite chain closure" --state open
   → only #232 (deferred — provider human-step) remains; #255 flagged to Carl
7. Milestone closed (with #232 carried forward)
```

**375×812 closure walk script (travelston.com — operator/MCP-driven):**

This is the C4 prod walk. Each step notes which `[v]` it ticks. The OAuth
round-trip step is **SKIPPED** (provider OFF — carries forward to #232).

0. **Pre-walk Supabase dashboard eyeball (Phase-4 coverage fix — m5
   retro rec 5).** BEFORE walking, the operator confirms in the Supabase
   Dashboard → Auth: **Email OTP Length = 6** (the M5 walk discovered an
   8-vs-6 drift mid-walk), **Site URL = `https://travelston.com`**, the
   email template emits `{{ .Token }}`, and the redirect allowlist
   includes `/auth/callback`. A glance, not a discovery. Snapshot into the
   closure PR body so the next walk inherits it.
1. **New-account-from-landing** — open `/` cold; the #263 invite
   affordance renders in occasion voice (no "sign up / create account").
   → ticks **#263 `[v]`**.
2. **OTP signup (fresh account)** — sign up a **fresh OTP-only REAL
   account, no password ever set**; verify the 6-digit code from the
   inbox. → substrate for **#255**.
3. **State-B set-password (#255)** — land on
   `/account/sign-in-and-security`; verify **State B** (set-password
   surface) renders for the no-password account. → ticks **#255 `[v]`
   (the State-B `[v]`)**.
4. **Password sign-in** — set a password in State B, sign out, sign back
   in with email + password. → exercises the chain end-to-end.
5. **Invite preview (#219)** — open an `/invite/[token]` preview; verify
   the magazine layout + `invite_h1` render, and the OG card renders
   (paste the invite URL into a chat / preview tool to confirm the
   `opengraph-image.tsx` card). → ticks **#219 `[v]`**.
6. **Accept (#106 still POST-only)** — accept the invite via the
   POST-only `/invite/[token]/accept` route; confirm a direct GET → 405/
   gone. → confirms **#106 `[v]`** (regression test is the CI proof).
7. **OAuth round-trip — SKIPPED.** Google provider is OFF; **#232
   carries forward** (provider human-step + producer/consumer in one
   future PR).

Screenshot steps 1, 3, 5, 6 (4 screens) → embed under `## Production
walk (375px)` in the closure PR body.

**Flag at closure:**
- **#255** — needs Carl's operator-driven OTP-only State-B walk (the
  walk above). Surface in the closure PR body.
- **#232** — needs the Google provider enabled (Supabase Dashboard) +
  the one-PR producer/consumer wiring. Carry-forward to the next
  pre-flight; surface in the closure PR body.

---

## Per-wave reading list (3–5 files max per wave's agent)

**Wave 0 (shared infra):**
1. `lib/copy/auth.ts` (where D1 keys land) + `lib/copy/__tests__/m5-auth-voice-locks.test.ts` (D5 extends it)
2. `lib/rate-limit/index.ts` (`SCOPE_BUDGETS`, `FAIL_CLOSED_ON_SHIM`, the stale 73–77 comment)
3. `lib/rate-limit/__tests__/index.test.ts` (D2 budget + #139 assert)
4. The **#141 / #139 issue threads** (10/15min budget; assert-only re-scope)
5. `notes/decisions.md` "M5 auth redesign" ADR (the shim-OPEN rationale)

**Wave 1 (login / landing):**
1. `app/page.tsx` (#263 affordance insertion point)
2. `app/login/_form.tsx` + `app/login/**` (#122 straggler sources)
3. `lib/copy/auth.ts` (W0 keys — read-only) + the D5 voice-lock + denylist
4. The **#263 / #122 issue threads**
5. `notes/research/ux-design-principles.md` §voice guide (occasion-framing, anti-tells)

**Wave 2 (invite):**
1. `app/invite/[token]/page.tsx` (current layout; `invite_h1` insertion)
2. `app/invite/[token]/accept/route.ts:101` (GET already removed — #106 verify-only)
3. The bucketed anon `invite_preview` RPC (D3 OG source; **never headers**)
4. `tests/fixtures/invite-otp.ts` (W0 D4 fixture — consumed by #106 + the OG test)
5. The **#219 / #106 issue threads** + the invite-redirect contract (P0 #316: `next` must be GET-navigable; `/accept` is POST-only)

**Wave 3 (docs / walk / deferred):**
1. `notes/deployment-readiness.md` (redirect-allowlist row to snapshot — #128)
2. `notes/runbooks/auth-setup.md` (runbook note insertion point + the Google-provider click-path for the #232 gate)
3. The **#128 / #255 / #232 issue threads**

---

## Appendix — Per-wave hard-stop conditions

- 150 turns OR 2 consecutive wave-gate failures OR **any SQL/migration**
  OR **any new server-action mutation** OR **any AUTH scope added to
  `FAIL_CLOSED_ON_SHIM`** OR new dependency request → STOP and surface.
- **Wave 0:** 1 gate failure → stop (W0 is the merge-blocker for W1/W2).
  If the #139 assert can't be written without adding a scope to the
  fail-closed set → stop (that's a re-scope, not assert-only).
- **Wave 1:** a banned anti-tell phrase reaching `main` past the D5
  denylist → stop, re-grep. No new copy keys minted outside W0.
- **Wave 2:** if 2a's OG route sources from request headers, or the D3
  injection test is missing → stop. If 2b edits `accept/route.ts` (#106
  is verify-only) → stop.
- **Wave 3:** #232 marked closed or its producer/consumer built →
  stop (it is DEFERRED + OPEN with the provider human-step blocker).
- **Closure:** failed #255 State-B walk → fix-then-retry once, then stop.
  Do NOT tick #232 `[v]` (carry-forward, provider OFF).

## New dependencies this wave introduces

**None expected.** AUTH ships config + copy + a net-new
`opengraph-image.tsx` (Next.js `ImageResponse` is already in the App
Router runtime — no new dep), test-harness additions, a shared fixture,
and docs. **Zero migrations, zero new server-action mutations.** Any
agent-introduced new dependency is a hard-stop.

**Estimated totals:** 5 PRs (0a; 1a/1b; 2a/2b) + 1 doc PR (3a) + the
closure PR. **#232 deferred + OPEN** (provider human-step). **#255
walk-only** (operator-driven by Carl). No dependabot batch scoped to this
wave.
