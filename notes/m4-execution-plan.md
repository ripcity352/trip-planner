# M4 Execution Plan — *"Trip is shippable"*

> Dated 2026-05-20, authored at Wave 0 bootstrap (W0a).
> Updated at closure (W4c, 2026-05-21).
>
> This plan covers all wave work that flips M4 from "executing" to
> "shipped." The production walk (closure browser walk on travelston.com)
> is the orchestrator's responsibility after the closure PR merges — not
> part of this document.

---

## Two-axis labeling convention (Override E)

Each DoD line carries two checkboxes:

- `[d]` *declared*: code shipped, CI green, code-reviewer approved
- `[v]` *verified*: feature exercised in a real browser on the prod
  URL (travelston.com) at 375px, outcome matches spec

The `[v]` ticks land at closure — after the production walk. `[d]` is
allowed mid-milestone; `[v]` is closure only.

---

## Wave map

| Wave | Branch prefix | PRs | Status |
|------|--------------|-----|--------|
| W0a | `feat/m4-bootstrap` | #190 | Merged |
| W0b | `feat/m4-carry-back` | #192 | Merged |
| W0c | `feat/m4-places-proxy` | #193 | Merged |
| W0d | `feat/m4-bottom-tab-bar` | #194 | Merged |
| W0e | `feat/m4-test-infra` | #191 | Merged |
| W1a | `feat/m4-dress-code` | #195 | Merged |
| W1b | `feat/m4-activity-tag` | #196 | Merged |
| W1c | `feat/m4-member-flag` | #197 | Merged |
| W2a | `feat/m4-places-ui` | #199 | Merged |
| W2b | `feat/m4-datetime-tz` | #200 | Merged |
| W2c | `feat/m4-airline-picker` | #198 | Merged |
| W3a | `feat/m4-theming` | #201 | Merged |
| W3b | `feat/m4-rsvp-color` | #202 | Merged |
| W4a | `feat/m4-legal` | #203 | Merged |
| W4b | `feat/m4-prod-walk-fixes` | #204 | Merged |
| W4c | `chore/m4-done` | (this PR) | Closure |

---

## M4 DoD checklist (the source of truth — check as work lands)

Each line has two axes per Override E. `[v]` ticks land after the
production walk at closure.

**Bootstrap + carry-back (Wave 0)**
- [d] [ ] Bootstrap plan + locked copy/data (W0a #190)
- [d] [ ] Carry-back migration (W0b #192 — Deltas 1, 2, 4, 5, 6, 7)
- [d] [ ] Places autocomplete proxy + invite GET drop (W0c #193)
- [d] [ ] Bottom tab bar + /me skeleton + deep-link middleware (W0d #194)
- [d] [ ] Test infra fixtures (W0e #191)
- [d] [ ] MINT_INVITE 10/hour + fail-CLOSED shim pin (W0c Deltas 8 + 9)
- [d] [ ] setTripNotes revalidatePath (#159 — landed in W0b)

**Structured inputs (Waves 1–2)**
- [d] [ ] Dress-code chips (W1a #195 — closes #163)
- [d] [ ] Activity-tag chips (W1b #196 — closes #164)
- [d] [ ] Member-flag chips + organizer view + self-read (W1c #197 — closes #165)
- [d] [ ] Places UI consumer + address_place_id persistence (W2a #199 — closes #166)
- [d] [ ] datetime-local + trip TZ (W2b #200 — closes #167, #108)
- [d] [ ] Airline picker + IATA enforcement (W2c #198 — closes #168)

**Polish (Waves 3–4)**
- [d] [ ] Theming + persimmon focus-ring (W3a #201 — closes #90, #121)
- [d] [ ] RSVP color + icon (W3b #202 — closes #45)
- [d] [ ] Legal stubs (W4a #203 — closes #81)
- [d] [ ] Prod-walk fixes + axe sweep (W4b #204 — closes #82)

**Closure (Wave 4c)**
- [d] [ ] m4-retro.md authored
- [d] [ ] M4 closure ADR in decisions.md
- [d] [ ] roadmap.md + ROADMAP.md updated to Closed
- [d] [ ] CLAUDE.md current-phase updated
- [d] [ ] m4-golden-path.spec.ts authored
- [d] [ ] deployment-readiness.md closure status recorded

---

## Appendix

### A. Process overrides (carry-forward from M3)

All M3 overrides A–G carry forward unchanged. M4 adds:

- **Override H (data lock):** copy/data locked after W0a; any new key
  requires a consolidation fix-up flagged in the PR.
- **Override I (Resend [v]):** sandbox sender does NOT tick the
  `[v]` box on "send invite to real attendees." The `[v]` tick
  requires a Resend-verified domain send to a real recipient.

### B. Hard-stop triggers (same as M3)

Any of these halts the wave and surfaces to the orchestrator:

1. CI red on `main` for > 30 min.
2. A CRITICAL or HIGH code/security review finding not addressed before
   merge.
3. A `[v]` box ticked without a real browser walk (sandbox don't count).
4. A new npm dep added without explicit orchestrator approval.

### C. Closure walk + [v] ticks pending

Production walk on travelston.com (`[v]` ticks) pending real-recipient
Resend send + full browser walk. The `[v]` axis will be ticked by the
orchestrator after the W4c PR merges and the walk completes.
