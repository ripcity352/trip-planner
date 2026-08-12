# Shopping List v2 — lifecycle, on-behalf, filter view, precise copy

Date: 2026-08-12
Status: **approved for implementation** (operator-designed in session; this
supersedes the coordination-UX portions of the v1 spec
`2026-08-11-shopping-list-design.md`).
Builds on: PR #602 (core list) + PR #603 (reactions + Notes), both live in prod.

## 0. What v2 is

The shipped list has three flat, ambiguous controls on each row (a checkbox, an
"I've got this" link, a "Remove" link) and cute/vague copy ("Got it", "up for
grabs"). You cannot glance at the list and tell what's **open**, what's
**in-progress and who's on it**, or what's **done**. v2 makes the item lifecycle
**legible and precise**, adds **commit-on-behalf** (assign another member),
adds a **state filter view**, and replaces every vague string with precise copy.

**Guiding principle (operator, standing preference):** for the coordination
state machine — action buttons and status labels — **precise/literal beats
warm/cute**. "Completed by Marcus" over "Marcus got it". Warmth stays in the
empty state and the Notes thread, not the state labels. (See
`feedback_precise_copy_over_cute`.)

**Deliberately NOT in v2 (deferred):** structured quantities / partial
fulfillment ("need 4 dozen, have 2, need 2 more"). Freeform quantity in the item
name ("2 dozen eggs") stands. If a real trip hits the split-the-egg-run case,
it's a separate feature with its own child table — do not build it now.

## 1. The lifecycle

Four states. The first three are the normal flow; **Removed** is a second
terminal outcome (not-needed), distinct from **Completed** (procured).

```
                 ┌───────────── Re-assign → Open ─────────────┐
                 │                                            │
   ┌────────┐  I'll complete / Assign   ┌─────────────┐      │
   │  Open  │ ─────────────────────────▶│ In-progress │──────┘
   └────────┘                           └─────────────┘
       │ │                                    │
       │ │ Completed (skip)                   │ Completed (+ who completed it?)
       │ ▼                                    ▼
       │  ┌───────────┐                  ┌───────────┐
       │  │ Completed │◀─────────────────│ Completed │
       │  └───────────┘                  └───────────┘
       │        ▲  Re-open (comment + assign)
       ▼        │
   ┌─────────┐  │
   │ Removed │──┘  Re-open (comment + assign)
   └─────────┘
   (Remove, from any non-terminal state)
```

- **Open** — added, nobody committed.
- **In-progress** — a member is committed to complete it (self-claimed OR
  assigned by someone). The in-progress step is **skippable** (Open → Completed
  directly).
- **Completed** — procured (bought or brought), attributed to whoever completed it.
- **Removed** — taken off as not-needed, attributed, **undoable** (soft-close,
  not a hard delete).

## 2. Data model — derive states; add attribution columns

The three normal states already *derive* from the two shipped columns; v2 adds
attribution + a soft-remove so the precise "…by X" labels are accurate and
Removed can persist.

New migration (next timestamp after `20260811020000`, e.g.
`20260812010000_shopping_list_v2.sql`). Columns added to
`public.shopping_list_items` (all nullable, all coordination state):

```sql
alter table public.shopping_list_items
  add column completed_by_trip_member_id     uuid references public.trip_members(id) on delete set null,
  add column removed_by_trip_member_id       uuid references public.trip_members(id) on delete set null,
  add column removed_at                       timestamptz,
  add column claim_assigned_by_trip_member_id uuid references public.trip_members(id) on delete set null;
```

- `completed_by_trip_member_id` — who completed it (chosen at completion time —
  NOT assumed to be the claimer; see §6 "who completed it?").
- `removed_by_trip_member_id` + `removed_at` — soft-close. A removed item has
  `removed_at is not null`; it filters out of the active list and shows in the
  Removed section. **Remove is soft, not a hard delete** (the shipped
  `deleteShoppingItem` cascade-delete is retained only as an organizer-only
  permanent purge via `⋯`, or dropped — not the primary "Remove").
- `claim_assigned_by_trip_member_id` — who assigned the current claimer (null
  when self-claimed). Powers "Marcus put you on this" provenance.

**Column-scoped UPDATE grant** — extend it (a new grant statement in the new
migration) to add the four new mutable columns. `id, trip_id,
created_by_trip_member_id, visibility, idempotency_key, created_at` stay
immutable-after-insert (unchanged):

```sql
grant update (completed_by_trip_member_id, removed_by_trip_member_id, removed_at,
              claim_assigned_by_trip_member_id)
  on public.shopping_list_items to authenticated;
```

**RLS is UNCHANGED.** The shipped UPDATE policy already gates on
`can_see_content(trip_id, visibility)`; the new columns fall under it. On-behalf
assign and cross-member complete are **action-layer** capabilities (RLS already
permits any visible-item member to update the mutable columns). This deliberately
**avoids touching RLS** — no OR-stacking risk (the laggards-wave lesson). Re-assert
grants after `db reset` (#361), keeping intentional revokes.

**State derivation** (a pure `deriveShoppingItemState(item)` helper, display-layer):

| State | Predicate |
|---|---|
| Removed | `removed_at is not null` (wins over all) |
| Completed | `removed_at is null and bought = true` |
| In-progress | `removed_at is null and bought = false and claimed_by_trip_member_id is not null` |
| Open | `removed_at is null and bought = false and claimed_by_trip_member_id is null` |

## 3. Precise copy (locked — replaces the shipped cute strings)

State labels / filter tabs / dividers: **Open · In-progress · Completed · Removed**.

| Element | Precise copy |
|---|---|
| Complete action (button) | **Completed** |
| Completed state (status line) | **Completed by {name}** |
| Claim-self action | **I'll complete** |
| In-progress status, you | **You to complete** |
| In-progress status, them | **{name} to complete** |
| Assign / Re-assign action | **Assign…** / **Re-assign…** → picker (crew + **Open — no one**) |
| Remove action | **Remove** |
| Removed state (status line) | **Removed by {name}** |
| Re-open action (terminal states) | **Re-open** |
| Open state (status line) | **Open** |

The spine is the verb **complete**: *I'll complete → {name}/You to complete →
Completed → Completed by {name}*. Retire the shipped strings `gotIt`,
`gotItDivider`, `claimCta` ("I've got this"), `claimedByYou`, `claimedBy_template`,
`unclaim` — replace per this table. Warmth-OK strings (empty state, notes) stay.

## 4. Row UI

Mobile-first, ~375px, glanceable. Each row: a **leading state glyph** for the
1-second vertical scan, the item name (+ freeform qty inline), an **attributed
status line**, **one primary action** for the state, and a **`⋯`** for
everything else. The whole row taps to open the existing detail sheet
(reactions + Notes).

State glyphs (neutral ink, **no red/green** — traffic-light states are banned):
`○` Open · `◐` In-progress · `✓` Completed · `⊘` Removed.

```
[ All ][ Open ][ In-progress ][ Completed ][ Removed ]

Open             ○  Sunscreen   Open · [ I'll complete ]           ⋯
In-progress(you) ◐  Ice         You to complete · [ Completed ]    ⋯
In-progress(them)◐  Aux cable   Mark to complete · [ Completed ]   ⋯
Completed        ✓  T̶e̶q̶u̶i̶l̶a̶      Completed by Marcus · [ Re-open ]  ⋯
Removed          ⊘  C̶h̶a̶r̶c̶o̶a̶l̶     Removed by Marcus · [ Re-open ]    ⋯
```

**Row-calm strategy (to avoid button pile-up at 375px):**
- The **leading glyph is a tap target = "Completed"** (the universal check-it-off
  gesture). So an Open row can be completed in one tap on the glyph (skip
  in-progress) without a second inline button.
- Exactly **one visible primary button** per state: Open → `I'll complete`;
  In-progress → `Completed`; Completed/Removed → `Re-open`.
- Secondary actions live on `⋯` (or the detail sheet): **Assign / Re-assign**
  (picker), **Re-open's** comment+assign flow, **Remove**, permanent-purge
  (organizer), amend/edit.
- On someone else's **In-progress** row, the `Completed` button is still shown
  (anyone can close it out — §6), and Re-assign is on `⋯`.

**Sectioning (the "All" view):** active items (Open + In-progress) on top, then a
**Completed** divider + struck completed items, then a **Removed** divider +
struck removed items. Completed/Removed sections are collapsible.

## 5. Filter view

A segmented control over the list: **All / Open / In-progress / Completed /
Removed**. `All` = the sectioned list above. Each other tab filters to that one
state (e.g. **Open** = "what still needs a taker"; **In-progress** = "who's on
what"). Filtering is a client-side segment over the already-loaded items (all
states are already fetched; removed items included).

**Counts:** a tab MAY carry a plain navigational count ("Open · 4"). It MUST NOT
render a fraction, percentage, or progress bar ("4/12 done") — that is the banned
completion score. Nothing aggregates across items into a list-level "done" metric.

## 6. Transitions & actions

New/changed server actions (envelope `{ ok:true; … } | { ok:false; errorKey }`,
`callAction` + `router.refresh`, no `revalidatePath`, no `redirect` — I12). All
validate acting user is a member of the item's trip; all target members must be
in the **same trip** (validate server-side).

- **`I'll complete`** (Open → In-progress, self) — `assignShoppingItem(itemId,
  self, { assignedBy: self })`: set `claimed_by = self`, `claim_assigned_by =
  self` (self-claim). 
- **`Completed`** (any non-terminal → Completed) —
  `completeShoppingItem(itemId, completedByMemberId)`: set `bought = true`,
  `completed_by = completedByMemberId`. **"Who completed it?"** — when the actor
  is NOT unambiguously the completer, tapping Completed presents a lightweight
  picker (default = the on-hook member, else self; changeable) so
  `completed_by` is accurate. If the actor is completing their own claimed item,
  no prompt (completed_by = self). **Anyone** who can see the item may complete
  it, including someone else's in-progress item.
- **`Assign…` / `Re-assign…`** (set who's on the hook) —
  `assignShoppingItem(itemId, targetMemberId | null, { assignedBy: self })`:
  target member → `claimed_by = target`, `claim_assigned_by = self`; **Open — no
  one** → `claimed_by = null`, `claim_assigned_by = null`. Same action/picker
  from Open (initial assign) and In-progress (re-assign / send back to Open).
- **`Remove`** (any non-terminal → Removed) — `removeShoppingItem(itemId)`: set
  `removed_by = self`, `removed_at = now()`. Soft-close (undoable). If the item
  has a live reaction/comment thread, keep the existing confirm.
- **`Re-open`** (Completed OR Removed → Open/In-progress) —
  `reopenShoppingItem(itemId, { assignTo: memberId | null, comment?: string })`:
  clear the terminal marks (`bought = false, completed_by = null` and/or
  `removed_by = null, removed_at = null`), set the assignment per `assignTo`
  (member → In-progress attributed to `self` as assigner; null → Open), and if
  `comment` present, post it to the item's Notes thread (reuse the PR2
  `addShoppingComment` engine). Idempotency key per the comment rules.

Keep `addShoppingItem` (+ fast-add, §7) and `amendShoppingItem` (+ wire the UI,
§8). The shipped `toggleBought`/`setClaim`/`deleteShoppingItem` are superseded by
the above (retain internals where reused; drop dead action surface).

**On-behalf attribution & consent (rule #8):** assignment records the assigner
(`claim_assigned_by`), the detail sheet shows "**{assigner} put {assignee} on
this**", and the assignee can always **Re-assign → Open** in one step. No
nagging, no "still hasn't…" — banned.

## 7. Fast multi-add

Replace the heavyweight single-item form as the *default* entry path:
- An always-visible **single-line input** ("Add an item…") at the top of the
  list. **Enter adds and keeps going** — the item posts, the field clears, focus
  stays. Rip through a list without leaving the keyboard. Each Enter is its own
  logical add → its own idempotency key (rotate per confirmed `ok:true`, the
  shipped composer pattern).
- **Paste a list:** newline-separated paste offers "Add N items?" (split on
  `\n`, trim blanks).
- **"Add with details"** — a collapsed affordance opening today's full form
  (category / cost / surprise) for the occasional item that needs them at
  creation. Category/cost/surprise otherwise set later via amend (§8).

## 8. Amend / edit

Wire the shipped-but-headless `amendShoppingItem` (action + db + tests already
ship — see the `notes/decisions.md` "amend deferral" ADR). Inline edit of
name / category / cost from the detail sheet (or the row `⋯`). Partial-patch
discipline is already enforced in the action (gap-A).

## 9. RLS, grants, invariants

- **RLS unchanged** (§2). New columns ride the existing `can_see_content` UPDATE
  policy. No new policy, no new SECURITY DEFINER fn/view (I5 stays a no-op).
- **Grants:** extend the column-scoped UPDATE grant (§2); re-assert after
  `db reset` (#361), keep revokes.
- **CI invariants:** I1 (no new *_COLUMNS projection needed unless a new read
  column is surfaced — the new columns must appear in `SHOPPING_ITEM_COLUMNS`
  since actions read/write them); I3 (23505/42501 split — the new actions inspect
  `error.code`); I6 (names via `resolveMemberName`/`resolveContentAuthorName`,
  never `.email`); I12 (no `callAction`-wrapped `redirect`). I2 unaffected.
- **Adversarial RLS/security** (ultracode pairing): confirm the on-behalf assign
  + cross-member complete cannot (a) target a member in another trip, (b) mutate
  an immutable column, (c) touch an item the actor can't see; confirm soft-remove
  can't be abused to hide/unhide across trips; confirm the extended grant lists
  exactly the intended mutable columns.

## 10. Testing

- **Data layer:** `deriveShoppingItemState` truth table (all four states +
  precedence: removed wins, completed over in-progress); each setter's column
  effects; no-row sentinels.
- **Actions:** self-claim, assign-to-other (attribution recorded, same-trip
  validation, cross-trip target rejected), complete-with-explicit-completer,
  complete-someone-elses-item, re-assign-to-open, remove (soft), re-open (clears
  terminal + optional comment posts to thread), envelopes, 23505/42501 split,
  redirect-free.
- **RLS harness** (extend `supabase/tests/`): a member cannot assign a
  member of another trip; a member cannot un-remove/complete an item they can't
  see; the extended column grant denies UPDATE of an immutable column;
  celebrant still cannot see hide_from_celebrant items across all new columns.
- **UI:** glyph reflects derived state; one primary action per state; glyph-tap
  = Completed; filter tabs filter correctly and carry no fraction/score; the
  who-completed picker; re-open flow (comment + assign); fast-add Enter-to-
  continue + paste-split; assign/re-assign picker (incl. "Open — no one");
  precise copy (assert the cute strings are gone). No `.email` (I6).
- **e2e:** add several via fast-add → assign to a member → complete with
  who-picker → remove one → re-open it with a comment → filter to In-progress.
  Local Supabase creds (not `.env.local` = prod).

## 11. Prod rollout

Local `db reset` green first, then apply `20260812010000_shopping_list_v2.sql`
to prod via the Management-API keychain curl (ref `bonvqazcqwkrowtkdmuq`) + a
`schema_migrations` bookkeeping row; verify the four columns exist, the extended
UPDATE grant lists exactly the intended columns, RLS unchanged, advisors + login
healthy (`migration-apply-automated`). MCP `apply_migration` is
classifier-blocked — use the direct curl.

## 12. Hard bans (unchanged, re-assert in review)

No progress bar / "X/Y done" completion score / percentage; no leaderboard; no
streaks/badges; no red/green traffic-light glyphs; no required-field asterisks;
no passive-aggressive nudges ("Mark still hasn't…"); reactions stay ≤6 &
aggregate-only (v2 doesn't touch them). Filter counts are navigational only.

## 13. Suggested build order (decompose into subagent tasks; no separate plan doc)

1. Migration — 4 columns + extended grant (RLS unchanged). **[ultracode: security + code]**
2. `deriveShoppingItemState` + data-layer setters (completed_by / removed soft /
   assign+assigner / re-open) + types + tests (TDD).
3. Precise copy — replace the SHOPPING_LIST_UI_STRINGS state strings + add
   filter/section labels + sync copy-fixture guards.
4. Actions — `completeShoppingItem`, `assignShoppingItem`, `removeShoppingItem`,
   `reopenShoppingItem` (+ retire superseded surface). **[ultracode: security + code]**
   (aggregate-only unaffected; focus on same-trip target validation + immutability.)
5. Row redesign — glyph + status line + one primary action + `⋯`; the who-
   completed picker; the assign/re-assign picker; Reopen flow (comment+assign).
6. Filter view (segmented All/Open/In-progress/Completed/Removed) + sectioning.
7. Fast multi-add (Enter-to-continue + paste) ; wire amend/edit.
8. RLS harness additions + e2e + full local gate + prod migration.

Ultracode pairing on tasks 1 & 4 + the final whole-branch review. Everything else
is single-subagent TDD with the two-stage task review.
