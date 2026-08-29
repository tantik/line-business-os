# Cafe v2.2 WP1-A — Operations — Template Historical Expectation Integrity — Handoff (2026-08-29)

Status: **PR OPEN on branch `fix/operations-template-historical-integrity`
(RED path — migration — autonomous `dev` merge forbidden, left for Founder
merge). No Cloud apply. `main` untouched.**

Read first: `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`,
`docs/ai/current-task.md` §5, the scope
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` (§11, §13),
the design `docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md`
(§D, §J, §T), and the prior integrity handoff
`docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_HISTORICAL_EXPECTATION_HANDOFF_2026-08-28.md`.

## 1. Truthful history

- **PR #459** — WP1 Operations foundation (merged `dev`, `823be38`).
- **PR #460** — WP1 Operations slice 2, execution engine (merged `dev`, `f18b884`).
- **PR #462** — historical-expectation integrity for **schedule** changes;
  effective-dated schedule versioning, migration `0102` (merged `dev`,
  `36af7f3`). Its header **explicitly recorded the template sibling defect as
  not fixed**, needing "template effective-dating".
- **PR #463** — review F1 follow-up, guard-floor tightened to `current_date`,
  migration `0103` (merged `dev`, `fa1cbb1`).
- **This PR** — closes the template sibling defect. Migration `0104`.

## 2. Defect — CONFIRMED (reproduced against merged `dev`, 0102 + 0103 applied)

```
Day 1: template is_active=true, schedule = DAILY, window 09:00–10:00,
       nobody opens ORUWA, no task_instance, window expires.
       api.operations_expected_tasks(Day1, Day1) -> 1 row, state='overdue', instance_id null.
Day 2: UPDATE operations.checklist_templates SET is_active = false.
       api.operations_expected_tasks(Day1, Day1) -> 0 rows.   <-- past obligation erased
```

Reproduction script run this session (fresh `supabase db reset`, before the
fix): `DAY1 -> n=1`, `DAY2 -> n=0`. **CONFIRMED.**

Root cause: `api.operations_expected_tasks`'s `expected` CTE joined
`operations.checklist_templates et … and et.is_active`. `is_active` is a
single mutable boolean on the one template row; flipping it re-evaluates
every historical business date. Materialised instances were unaffected (the
final projection join does not gate on `is_active`), so the blast radius was
**non-materialised** history only — same defect class as the schedule defect
0102 fixed, smaller blast radius.

## 3. Required invariant (mission §3)

> If the effective schedule version says a task was required on business date
> D, then a later template deactivation / configuration change must not make
> that historical obligation disappear — even when no `task_instance` was
> materialised.

Plus the opposite direction (mission §4, test B): a **legitimate** template
retirement must still stop FUTURE task generation.

## 4. Chosen fix — retirement dating for templates (`0104`, additive only)

The direct analogue of 0102's schedule effective-dating. Smallest model that
satisfies both directions.

| Element | What |
|---|---|
| `checklist_templates.retired_on date` (nullable) | the **last business date** this template may generate expected tasks. `NULL` = not retired. Template-level equivalent of `task_schedules.effective_to`. |
| `CHECK (is_active or retired_on is not null)` | a deactivated template must carry a retirement boundary — it can never be "off forever with no history boundary". This is exactly what makes it safe to drop `is_active` from the projection. Mirrors 0102's `operations_task_schedules_retired_has_end`. |
| `BEFORE UPDATE` trigger `operations.checklist_templates_history_guard()` | `retired_on` may be **set or advanced while still in the future**, never set into the past; **once elapsed it is frozen** (no pull-back, clear, or forward-advance — the last would fabricate missed history). Fires for every role (unlike RLS). Mirrors `operations.task_schedules_history_guard()`. Errors: `operations_template_retire_retroactive`, `operations_template_retirement_elapsed_frozen`. |
| `api.operations_expected_tasks` (**create-or-replace**, SAME signature + return type as 0102) | the `expected` CTE no longer joins on `checklist_templates.is_active`; it adds `and (et.retired_on is null or c.d <= et.retired_on)`. A retired template still reports every past date it covered and no date after its boundary. **Everything else byte-for-byte the 0102 body** (timezone, overnight windows, horizon clamp `[current_date-31, current_date+62]`, `expected ∪ materialised` union, overdue derivation, `is_overdue_critical`, RLS as the tenant/location/module gate). |

**No write RPC added.** There is currently **no tenant-facing write path** to
`checklist_templates` at all (`0100` grants `SELECT` only; the RLS write
policies are defence-in-depth). Setting `retired_on` alongside `is_active` is
the future Operations Configuration API slice's job — which `0104` now
constrains: that slice **cannot** deactivate a template without recording a
non-retroactive boundary.

### Why this is the minimum

- It reuses a shape already reviewed and merged (0102's schedule model),
  keeping one consistent "history boundary + guard trigger + projection
  derives from the boundary, not from a mutable flag" pattern across the
  module.
- No template versioning, no snapshot JSON, no `checklist_item_versions`, no
  event sourcing, no cron/jobs — none needed to preserve "what task was
  required on date D" (mission §5, §7).
- The projection change is a one-line predicate swap. The column is
  additive; the backfill is trivial (`retired_on = NULL` for every existing
  row, all of which are `is_active = true`).

## 5. Historical expectation (after the fix)

A `(schedule version, business_date)` is expected iff: the date is inside the
schedule version's `[effective_from, effective_to]` range **and**
`template.retired_on is null or date <= template.retired_on`. Neither
`task_schedules.is_active` nor `checklist_templates.is_active` is consulted.
Non-materialised past obligations survive template retirement; materialised
instances were already safe and remain so (test C).

## 6. Future retirement behaviour

Setting `retired_on = D` (with `is_active = false`) stops the template
producing expected tasks after `D`. `D` must be `>= current_date` (guard).
While `retired_on` is still in the future it may be advanced or cleared. Once
`retired_on` has **elapsed** it is fully frozen: it cannot be pulled back,
cleared (un-retire), or pushed forward — the last would retroactively
fabricate missed/overdue history for the gap days (independent-review P2,
fixed pre-PR; error `operations_template_retirement_elapsed_frozen`).
Resuming a retired template after its boundary elapsed is a
configuration-slice concern (a new template, or an explicit forward-only
resume mechanism), not a mutation of frozen history. Schedules on a retired
template still exist and are still readable; they simply project nothing past
the template's boundary.

## 7. Template / item change classification (mission §6)

| Surface | Class | Rationale |
|---|---|---|
| `checklist_templates.is_active` | **MUST FREEZE/VERSION → done here** | was the defect. Now: not consulted by the projection; paired with `retired_on` + CHECK + guard. |
| `checklist_templates.retired_on` | **the new freeze mechanism** | set/advance-only history boundary. |
| `checklist_templates.name` | **SAFE TO MUTATE** | cosmetic; history via `template_id` FK + response values; exact historical wording deferred (design §D/§T). |
| `checklist_templates.description` | **SAFE TO MUTATE** | same. |
| `checklist_items.label` | **SAFE TO MUTATE** | recorded value + `item_id` are the durable facts; exact historical wording deferred. |
| `checklist_items.is_active` | **ALREADY HISTORICALLY PRESERVED** (obligation) / **DEFER TO CONFIG SLICE** (severity flag) | completion gate + expected projection are schedule/template-level, not item-level; past `item_responses` keep `item_id` + value. Caveat: `api.operations_expected_tasks.is_overdue_critical` recomputes from `checklist_items.is_active AND is_critical` live, so deactivating a critical item flips a *past* overdue row's `is_overdue_critical` true→false. The **obligation itself does not disappear** (still expected + overdue). This severity-flag recomputation is bounded and left to the config slice (freeze `is_critical` for elapsed occurrences, or accept). |
| `checklist_items.is_required` | **ALREADY HISTORICALLY PRESERVED** | only affects the *completion gate* for a not-yet-completed instance; no historical rewrite. |
| `checklist_items.is_critical` | **DEFER TO CONFIG SLICE** | see `is_active` caveat — same `is_overdue_critical` recomputation. |
| `checklist_items.response_type` | **MUST FREEZE/VERSION → DEFER TO CONFIG SLICE** | see §8. |
| `checklist_items.numeric_min` / `numeric_max` | **ALREADY HISTORICALLY PRESERVED** | a threshold violation is a persisted `operations.task_exceptions` row written at record time (`0101`); a later range change does not touch it. Regression-tested — `0048` §20. |

Only `checklist_templates.is_active` was in scope and fixed here. Nothing
else is implemented in this PR.

## 8. `response_type` recommendation (mission §9)

`checklist_items.response_type` selects which response column
`api.operations_record_response` accepts and validates against. Changing it
after an item has been answered would make historical `item_responses`
un-interpretable against the current definition, and would change the
validation semantics of future responses mid-stream. There is **no
tenant-facing write path to `checklist_items` today**, so nothing to defend
yet.

**Mandatory input for the Operations Configuration API slice:** the item
write-path must **prohibit a `response_type` change once the item is
operational** — i.e. once any `operations.item_responses` row references it,
or (stricter, simpler) once any `operations.task_schedules` row references the
item's template. If a genuine change is needed, the sanctioned path is
**deactivate the item and create a new one** (the existing `is_active` retire
pattern) — not a versioned item-definition table. No heavy versioning without
a demonstrated need.

## 9. Schedule raw-INSERT F2 (mission §10)

**Status: TRACKED — not fixed here.** The `grant insert, update on
operations.task_schedules to authenticated` (added by 0102 for the SECURITY
INVOKER RPCs) also lets a Manager holding `operations.template.manage`
raw-`INSERT` a backdated but non-overlapping version into an existing
`schedule_group_id` — fabricating an obligation *forward*, not destroying
history. Fixing it is not directly necessary to the template defect and would
expand this bounded PR. **Mandatory input for the Operations Configuration
API slice:** add `FOR INSERT WITH CHECK (effective_from >= current_date)` on
`operations.task_schedules`, or move the schedule-write RPCs to `SECURITY
DEFINER` and `REVOKE` direct DML from `authenticated`.

## 10. Item response history (mission §8) — verified, unchanged

- Persisted `operations.item_responses` retains `item_id` + the typed value
  (`0101` schema).
- A numeric threshold violation persists as an `operations.task_exceptions`
  row written at record time (`0101`); a later `numeric_min`/`numeric_max`
  change does not rewrite it — regression-tested `0048` §20.
- `operations.item_responses_guard()` (`0101`) blocks INSERT/UPDATE once the
  instance is `completed` — completed responses are immutable.

`0104` adds nothing here and duplicates none of it.

## 11. Security (mission §12) — unchanged posture

- Module access **AND** permission **AND** tenant/location/domain rule —
  preserved on every path. `api.operations_expected_tasks` stays `SECURITY
  INVOKER`; `task_schedules` RLS is still the tenant/location/module gate;
  the added `retired_on` predicate is inside the same function body.
- No RLS weakening. No new grant to `checklist_templates` (still `SELECT`
  only for `authenticated`). No `service_role` in the frontend. `operations`
  stays out of the PostgREST exposed schemas. No new SECURITY DEFINER
  function (the guard trigger runs as the table owner like every other
  trigger here; it only *raises*, never reads cross-tenant).
- The guard trigger fires for **every** role — a privileged raw `UPDATE`
  cannot retroactively rewrite a template's history either (test `0050`
  boundary group).
- `0050` proves: cross-tenant isolation (F), cross-location isolation (G),
  module OFF hides history (D) / ON restores it unchanged (E).

## 12. Tests

- **`supabase/tests/0050_operations_template_retirement.sql`** — new.
  Baseline (past date expected + overdue + critical, no instance); **TEST A**
  past obligation survives template retirement (+ A2: every historical date
  through `retired_on` still projected); **TEST B** future occurrences stop
  after `retired_on`; **TEST C / C2** materialised historical instance still
  visible + interpretable (projection + `api.operations_task_instances`);
  **TEST D / E** module OFF hides / ON restores unchanged; **TEST F / F2**
  cross-tenant isolation; **TEST G / G2** cross-location isolation; **boundary
  group** — CHECK rejects `is_active=false` without `retired_on`, guard
  rejects retroactive `retired_on`, guard rejects backward move into the past,
  guard rejects un-retire once elapsed, forward advance allowed + re-expands
  the projection.
- **`0047` adjusted** (1 fixture + 1 assertion label, coverage unchanged):
  the `is_active=false` template fixture (`a3`) now carries a past
  `retired_on` (0104 CHECK requires a deactivated template to be bounded);
  the assertion "a schedule on that template produces no expected tasks"
  still holds, now via the retirement-dating model. Same pattern PR #462
  applied to the disabled-schedule fixture.
- **`0046`, `0048`, `0049` unchanged and green** (0048/0049 = the schedule
  versioning suite, mission §13.H).

## 13. Verification (VERIFIED, local, this session)

- `pnpm exec supabase db reset` — `0099`–`0104` apply clean.
- `pnpm exec supabase test db supabase/tests/` — `0046`–`0050` pass;
  full suite = **exactly the 11 known pre-existing failures**
  (`0002`×3, `0006`×1, `0008`×1, `0012`×2, `0023`×4), **zero new**.
- `pnpm exec turbo run typecheck lint build test --force` — **30/30**.
- Reproduction script (pre-fix) confirmed the defect; post-fix the unsafe
  raw `is_active=false` is rejected by the CHECK and the sanctioned
  `is_active=false, retired_on=…` path preserves history (`0050` TEST A).

## 14. Boundaries honoured

- **No edit to `0099`–`0103`.** `0104` additive; no row deleted, no
  historical Operations data dropped.
- **No Operations Configuration UI/API** built. **No HACCP presets. No
  Manager UI. No Staff UI. No Attention integration.**
- **No cron / job / Event Bus / event-sourcing / snapshot JSON / generic
  temporal framework / universal form versioning / workflow engine.**
- **RED path** (`supabase/migrations/**`) → autonomous `dev` merge forbidden.
  **PR left for Founder merge.**
- **No `supabase db push`, no Cloud `tenant_modules` change, no Preview
  toggle, no production.** `0104` exists only on the feature branch.
- **`main` untouched.**

## 15. Independent review — DONE, **PASS WITH REQUIRED FIXES → fixed**

A fresh-context reviewer independently reproduced the defect question against
this branch (own SQL), ran the full suite, and challenged the guard logic,
schedule-versioning interaction, isolation, module OFF/ON, and
over-architecture. Verdict: **PASS WITH REQUIRED FIXES**.

- **P2 (REQUIRED) — FIXED pre-PR.** The guard blocked pulling `retired_on`
  back / clearing it once elapsed, but *permitted advancing an already-
  elapsed `retired_on` forward* — which retroactively turns gap days (no
  obligation) into `state='overdue'`. Same defect class, create direction.
  Fix: once `old.retired_on < current_date`, **any** change to `retired_on`
  is rejected (`operations_template_retirement_elapsed_frozen`). Test `0050`
  boundary group extended with two forward-advance-once-elapsed assertions.
- **P3 — schedule sibling gap (tracked).** `operations.task_schedules_history_guard()`
  has the same asymmetry (extending a retired version's `effective_to`
  forward). Out of scope here — added to the config-slice mandatory inputs
  (§16) alongside F2.
- **P3 — incoherent `is_active=true` + elapsed `retired_on` reachable
  (cosmetic).** Projection ignores `is_active` so behaviour is correct; the
  config slice owns `is_active`/`retired_on` coherence (§16).
- **P3 — `0047` fixture comment (fixed).** Fixture `retired_on` moved to
  `current_date-4` (after the schedule's `effective_from = current_date-5`),
  so the assertion genuinely tests "nothing after the boundary".
- Cleared by the reviewer: SECURITY INVOKER preserved (`prosecdef = f`),
  guard not SECURITY DEFINER, RLS unchanged, no new grant, trigger order
  vs. `set_updated_at` harmless, NULL handling correct, inclusive date
  boundaries with no off-by-one, `retired_on < effective_from` → empty (no
  error), CHECK clean against existing data, architecture proportionate.

## 16. Deferred / follow-ups (NOT authorized by this handoff)

- **Operations Configuration API slice** — the next mission, own Founder
  prompt. Mandatory inputs it must carry: (a) `response_type` change
  prohibition once operational (§8); (b) schedule raw-INSERT F2 fix (§9);
  (c) set `retired_on` when deactivating a template / item; (d) `is_critical`
  / `is_active` item-severity freeze decision (§7 caveat); (e) cancelling a
  not-yet-effective future schedule version; (f) `is_active`/`retired_on`
  coherence for templates (review P3); (g) the schedule `effective_to`
  forward-advance-once-elapsed asymmetry in
  `operations.task_schedules_history_guard()` (review P3 — the sibling of the
  P2 fixed here); (h) an explicit forward-only "resume a retired template"
  mechanism if the product needs one.
- Cafe HACCP preset content; Manager/Staff Operations UI; Manager Attention
  integration — later bounded slices, each on its own Founder prompt.
- Cloud/remote apply of `0099`–`0104` — separate explicit Founder-approved
  mission with the full evidence package.
