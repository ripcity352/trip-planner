# AUTH retro — login/invite chain closure

> Dated 2026-06-18. Closes the **AUTH — login/invite chain closure** wave
> (a between-milestones pre-gate wave, the DS/CARRY pattern — does NOT
> lift the M6 real-trip gate). 7 buildable issues across 4 waves / 7 PRs
> (#322 W0, #323 W0b, #324, #325, #326, #327, #328) + this closure.
> Reconciled from two parallel-agent lenses (code-reviewer "was execution
> rigorous?" + senior-engineer "was verification real?").

---

## TL;DR

The wave production-hardened and voice-polished the auth/invite chain M5
shipped: an `AUTH_OTP_VERIFY` rate-limit budget (10/15m) + a fail-closed
posture assert (#141/#139), a landing invite affordance (#263), a login
voice pass (#122), an invite magazine layout + a net-new OG `ImageResponse`
with an injection guard (#219), a non-vacuous POST-only accept-route lock
(#106), and a live auth-config snapshot (#128). **Zero migrations, zero
new server-action mutations.** The four-lens audit caught three real scope
traps before code (deferred #232's blind RPC build, re-scoped #139 off a
lockout-risk posture flip, kept #141 off a 5/hr ratchet that would brick
the drunk-retry case) and a Phase-4 re-audit caught a "theater" lock
(D6) that a follow-up PR (#323) made genuinely load-bearing. The honest
gap: the `[v]` axis (prod travelston.com walk) is operator-gated and not
yet earned for the surface issues.

---

## What shipped

| PR | Closes | Surface |
|---|---|---|
| **#322 (W0)** | #141, #139 | Shared infra: `AUTH_OTP_VERIFY` 10/15m budget (was default 30/60s); stale "5/hr" comment deleted; #139 assert that AUTH scopes stay OUT of `FAIL_CLOSED_ON_SHIM` + ADR; copy keys (`landingInviteAffordance`/`ogCard`/`inviteH1`/`inviteH1Fallback`); shared invite/OTP fixture; voice-lock + expanded denylist; D6 identity lock. |
| **#323 (W0b)** | — | Made the #233 State-B lock real: extracted pure `deriveStateFromHasPassword`, deleted the buggy provider-only `deriveIdentityState`, repointed the test at production code. |
| **#324** | #263 | Landing invite affordance for cold group-chat invitees ("Got a link from a friend? Tap it…"). |
| **#325** | #122 | `/login` heading straggler → `AUTH_COPY.loginPageTitle` + voice-lock. |
| **#326** | #219 | Invite magazine layout + net-new `opengraph-image.tsx` (D3 sanitize/clamp/RPC-only/fallback) + 47-assertion injection test. |
| **#327** | #106 | Non-vacuous POST-only accept-route regression lock. |
| **#328** | #128 | Live Supabase auth-config snapshot in `deployment-readiness.md` + the missing OTP-length=6 row. |

**Carry-forwards (OPEN):** #255 (fresh-OTP-only State-B prod walk — needs
Carl), #232 (OAuth-existing-user detection — blocked on enabling the
Google provider; producer+consumer in ONE future PR per the phantom-wiring
gate).

---

## What worked

- **The four-lens audit earned its cost.** Three scope traps were caught
  *before* code: #232's RPC would have re-shipped the M5 PR5 dead-code-green
  (and added an email-enumeration surface) — deferred; #139's "add AUTH to
  fail-closed" reverses a load-bearing bootstrap posture and risks locking
  out a drunk invitee — re-scoped to assert-only; #141's TODO "ratchet to
  5/hr" would brick the OTP-retry case — set to 10/15m instead. All three
  landed faithfully in code (verified post-merge).
- **The Phase-4 re-audit caught D6 "theater."** W0's identity lock tested a
  *local mirror* of inline page logic — not load-bearing. The
  code-reviewer flagged it; #323 deleted the buggy `deriveIdentityState`,
  extracted a pure helper, and repointed the test at production code. The
  #233 trap function no longer exists to be re-wired.
- **Audit scope-corrections held in the actual code.** #141 = `{10,"15 m"}`,
  stale comment gone; #139 = two `not.toContain` asserts, no scope added;
  #106 asserts `POST` callable AND `GET` undefined (fails on route
  *deletion*, not just a re-added GET).
- **The m5 failure classes were not replayed.** No phantom-wiring (#232
  built neither half); the OG injection guard covers C0/C1 + U+2028/U+2029
  via a `RegExp` constructor (source-encoding-safe), Satori text nodes, 47
  assertions; the OTP-drift class is closed by the #128 pre-walk snapshot
  (OTP=6 now an explicit readiness row).
- **Override discipline.** Tests in `lib/`/`tests/` only (Override C clean
  across all PRs); `security-reviewer` correctly scoped to the
  auth-sensitive PRs (#322 rate-limit, #326 OG boundary); copy-from-palette
  (Override F); one consolidated fix-up round on #326.

---

## What slipped / surprised

- **Override-K keyword recurrence (3rd time).** #122/#219/#263's feature-PR
  bodies lacked `Closes #X`, so they didn't auto-close — closed manually at
  closure. The plan *named* this lesson and it recurred anyway. The fix is
  mechanical (a CI/template gate), not another reminder.
- **The `[v]` axis is preview-not-prod.** Override E defines `[v]` as
  "exercised on travelston.com at 375px." The orchestrator smoked the
  landing + login on **Vercel preview**, and the invite InviteMissing + OG
  *fallback* on preview — never the prod domain. The **anonymous cold
  landing** (#263's whole point) was never walked: the prod session
  redirected to `/trips`. The magazine **hero with a real invite token**
  and the OG card in a real chat unfurl were not seen. These are
  `[d] + preview-smoke`, NOT earned `[v]`.
- **D6's mirror cost an extra PR.** A "lock already-shipped code" deliverable
  that doesn't import production code from the start is theater by
  construction; #323 was the price of not catching that at plan time.

---

## DoD honesty (`[d]` vs `[v]`)

- **`[d]` + `[v]` both earned (CI/assert-based per their plan definitions):**
  #141 (budget assert), #139 (fail-closed assert + ADR), #106 (regression
  test), #128 (snapshot present + dated).
- **`[d]` earned, `[v]` deferred to the operator prod walk:** #263
  (anonymous cold landing), #122 (login surface), #219 (magazine hero + OG
  with a real token).
- **Neither — carry-forward:** #255 (`[v]` = fresh-OTP-only State-B walk,
  needs Carl), #232 (deferred behind the Google provider).

---

## Recommendation for next session

1. **One operator prod walk clears the gated `[v]`s together:** anonymous
   cold landing (#263, incognito — avoid the `/trips` redirect blind spot)
   → fresh-OTP-only signup → State-B set-password (#255) → password sign-in
   → a real `/invite/[token]` hero + paste the link to confirm the OG card
   (#219) → POST-only accept (#106). Do it once the Google provider is also
   enabled so #232's round-trip + State-B-via-OAuth clear in the same walk.
2. **Make `Closes #X` a CI/template gate.** This is the 3rd Override-K slip;
   stop relying on a human checklist.
3. **"Lock already-shipped code" deliverables must import production from
   commit 1** — never a local mirror (the D6→#323 lesson).
4. **#232 stays gated on the operator enabling the Google provider;** when
   built, producer (`auth_email_taken_oauth`) + consumer land in ONE PR
   (phantom-wiring gate). Do NOT build it blind.

**Bright line unchanged:** AUTH shipped WITH the real-trip retro gate
STILL in place. M6 features remain gated — same line as M4/M5/DS/CARRY.
No infra wave lifts it.

---

## Addendum — production walk (2026-06-21)

The operator ran the prod walk on travelston.com. Outcome:

- **`[v]` EARNED on prod:** #263 (anonymous landing affordance, incognito),
  #122 (`/login` surface), #219 (real `/invite/[token]` magazine hero + the
  OG card unfurling in a chat), #106 (POST-only accept; direct GET refused).
  These were `[d]`+preview-smoke at closure; the walk upgraded them to `[v]`.

- **#255 NOT exercised — and a debugging lesson.** State B rendered as
  **State A** during the walk, which *looked* like a #233 regression.
  Systematic debugging (Iron Law: root-cause before fix) traced it to a
  **misidentified account**, not a bug: the account walked
  (`carlston.chang@…`) was created 2026-05-20 and **has a real password**
  (confirmed via a scoped read: `encrypted_password` set, `has_password=true`),
  so State A was *correct*. Signing in via an OTP code threw the read — OTP
  sign-in works for any existing account and does not imply passwordlessness.
  **No code changed; nearly "fixed" a non-bug.**

- **Real finding (spec, not bug):** **State B is currently unreachable through
  the app UI.** Every account-creation path sets a password (`signUpAction`),
  OTP won't create one (`shouldCreateUser:false`, anti-phantom-account), and
  Google OAuth is off — so a genuinely passwordless account (the only thing
  that renders State B) is producible only via **Google OAuth** or a
  **Supabase admin passwordless invite** on a never-used email. State B is
  effectively dormant until OAuth ships — consistent with its design intent
  (built for OAuth users). #255's `[v]` therefore bundles with #232's OAuth
  enablement; it is not independently walkable today.

- **Process note:** the walk re-validated that real-account `[v]` walks catch
  what preview smokes and unit tests cannot — here, an account-identity
  confusion that a fixture would never surface — and that the Iron Law
  prevented a wasted "fix" of correct behavior.
