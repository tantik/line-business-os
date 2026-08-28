# Cafe v2.2 WP1-A — Operations — Historical Expectation Integrity — Handoff (2026-08-28)

Status: **PR #462 MERGED into `dev` by the Founder (`36af7f3`). Independent
review: PASS, no P0/P1; one P2 (F1) fixed in follow-up PR #463 (open, RED
path, awaiting Founder merge); two P3 notes tracked. No Cloud apply. `main`
untouched.**

## 0. Post-merge — independent review outcome

The fresh-context reviewer reproduced the mandated scenario itself and
confirmed the fix holds (past non-materialised obligation survives both a
recurrence revision and a deactivation; tenant/location/module boundaries
intact; full-suite baseline unchanged). **PASS with one P2:**

- **F1 (P2) — FIXED in PR #463 / migration `0103`.** The guard trigger's
  backward-movement floor for `effective_to` was
  `greatest(old.effective_from, current_date - 1)`, so a privileged raw
  `UPDATE effective_to = current_date - 1` still succeeded and dropped
  *today's* not-yet-elapsed occurrence (bypassing
  `api.operations_deactivate_schedule`, which rejects
  `effective_to < current_date`). `0103` tightens the floor to
  `current_date`; the sanctioned RPCs (both write `effective_to >=
  current_date`) are unaffected. Test `0049`.
- **F2 (P3) — tracked.** The `grant insert, update` also lets a Manager
  raw-`INSERT` a backdated but non-overlapping version into an existing
  `schedule_group_id` — fabricate an obligation *forward*, not destroy
  history. The future Operations config slice should add
  `FOR INSERT WITH CHECK (effective_from >= current_date)` or move the RPCs
  to `SECURITY DEFINER` and revoke direct DML.
- **F3 (P3) — accepted.** A `postgres`/owner role with
  `ALTER TABLE ... DISABLE TRIGGER` can still rewrite history — outside the
  tenant-facing threat model, consistent with the rest of the schema.
- **F4 (P3, cosmetic) — a misleading "yesterday's" comment in `0048`.**
  Tracked; the assertion itself is valid.

Read first: `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`,
`docs/ai/current-task.md` §5, the scope
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` (§11,
§13), the design `docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md`,
and the slice-2 handoff `docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_SLICE2_HANDOFF_2026-08-28.md`.

## 1. Truthful history

- **PR #459** — WP1 Operations foundation (merged `dev`).
- **PR #460** — WP1 Operations slice 2, execution engine (merged `dev`).
  Its own report/handoff flagged: *"нематериализованное прошлое следует
  текущему расписанию"* — an accepted "minimal freeze boundary" at the time.
- **This follow-up** — the Founder called that out as an architectural
  integrity defect for Operations / future Cafe HACCP records, requested it
  be verified and, if confirmed, fixed in a new migration without touching
  `0099`/`0100`/`0101`. **PR #462.**

## 2. Defect — CONFIRMED (reproduced against merged `dev`)

```
Day 1: schedule = DAILY, expected 09:00–10:00, nobody opens ORUWA,
       no task_instance, task missed.
Day 2: Manager changes recurrence DAILY -> weekdays (excluding Day 1's weekday).

BEFORE fix: api.operations_expected_tasks(Day 1, Day 1) -> 0 rows.
            The past obligation was silently erased.
```

Root cause: `api.operations_expected_tasks` evaluated every business date
against the schedule row's **current** columns; a raw `UPDATE` mutated the
single row for all of history.

## 3. Fix — effective-dated schedule versioning (`0102`, additive only)

| Element | What |
|---|---|
| `task_schedules.schedule_group_id` | stable identity of one **logical** schedule across its effective-dated versions (backfilled `= id` for existing rows). |
| `CHECK (is_active or effective_to is not null)` | a superseded / retired version must carry an end boundary — it can never be "silently off forever with no history boundary". |
| `EXCLUDE USING gist (tenant_id, schedule_group_id, daterange(effective_from, effective_to, '[]'))` (needs `btree_gist`) | no two versions of one logical schedule may overlap in effective time. |
| `BEFORE UPDATE` trigger `operations.task_schedules_history_guard()` | once a version's `effective_from` has passed, its recurrence / timing / identity is **immutable**; `effective_to` may only be set or advanced (retirement), never pulled back before `current_date - 1` or before a prior end. Fires for every role (unlike RLS). |
| `api.operations_expected_tasks` (drop + recreate; return type gains `schedule_group_id`) | a version applies to a business date **iff** that date is inside its `[effective_from, effective_to]` range — `task_schedules.is_active` is **no longer consulted**. Everything else (timezone, overnight windows, horizon clamp, `expected ∪ materialised` union, overdue derivation, RLS gate) unchanged from `0101`. |
| `api.operations_revise_schedule(tenant, schedule, recurrence_kind, weekdays, due_time, window_end_time, effective_from?)` | atomic: close the current (open-ended, active) version the day before the boundary + insert a new version sharing `schedule_group_id`. Default boundary = **next business date**; `v_boundary <= current_date` and `<= current version's effective_from` are rejected. `SECURITY INVOKER`, fixed `search_path`, `#variable_conflict use_column`, early `has_module_access`, `operations.template.manage` at the schedule's location, tenant+id-keyed lookup. |
| `api.operations_deactivate_schedule(tenant, schedule, effective_to?)` | retire at an `effective_to` boundary (default today; `< current_date` rejected; a not-yet-effective future version is refused — the future config slice can `DELETE` those). |
| grants | `grant insert, update on operations.task_schedules to authenticated` (the `SECURITY INVOKER` RPCs act as the caller; RLS write policy + the guard trigger are the boundary). `anon`/`public` revoked. |

## 4. Edit semantics (scope §9)

- **A — future change**: the default. New version from the next business
  date; the past is untouched.
- **B — same-day before window** / **C — change while window active**:
  collapsed into the same rule — a revision's earliest effect is the next
  business date. **Trade-off**: a manager cannot retro-fix *today's*
  occurrence through `revise` (handled operationally; the config change
  applies tomorrow). This is the smallest deterministic product-safe rule
  and matches the scope's suggested MVP rule.
- **D — change after window expired**: structurally impossible to rewrite
  (guard trigger + versioning).

## 5. Deactivation semantics (scope §10)

`effective_to` boundary, default today → stops producing expected tasks from
tomorrow. Retroactive boundary rejected. Past expected/overdue occurrences
remain. Future occurrences stop after the boundary.

## 6. Historical missed-task behaviour

Unchanged from `0101` and now robust to edits: `expected` (from the version
effective for that date) minus a `completed` instance, with the window
expired, = `state='overdue'`. No instance, no job. Survives recurrence
change and deactivation — proven by `0048` TEST 1/3/4/8.

## 7. Template / item change classification (scope §11)

| Change | Class | Note |
|---|---|---|
| template `name` edit | SAFE TO MUTATE | cosmetic; history via `template_id` FK + response values. |
| item `label` edit | SAFE TO MUTATE | recorded value is the durable fact; exact historical wording explicitly deferred (design §T). |
| item `is_active` / `is_required` change | ALREADY PRESERVED | completion gate + projection are schedule-level; past `item_responses` keep `item_id` + value. |
| item `numeric_min` / `numeric_max` change | ALREADY PRESERVED | a threshold violation is a persisted `operations.task_exceptions` row written at record time (`0101`). Later range change does not touch it. **Regression-tested (`0048` §20).** |
| item `response_type` change | MUST PRESERVE — not fixed | no tenant-facing write path exists (no config RPC for items yet); the future config slice must version or forbid it. Tracked. |
| `checklist_templates.is_active = false` | MUST PRESERVE — **not fixed here** | same defect class, smaller blast radius: retroactively hides past *non-materialised* expected occurrences; materialised history unaffected. Needs template effective-dating. **Tracked follow-up.** The `expected` CTE still gates on `template.is_active` (keeps that behaviour explicit and `0047` coverage intact). |

## 8. Security (unchanged posture, extended)

- Module access AND permission AND tenant/location/domain rule — preserved
  on every path. `api.operations_expected_tasks` still `SECURITY INVOKER`
  with `task_schedules` RLS as the tenant/location/module gate.
- New RPCs: `SECURITY INVOKER`, fixed `search_path`, early
  `operations_module_disabled` raise, `operations.template.manage` at the
  schedule's own location (re-derived, not trusted), lookup keyed on
  `tenant_id` **and** `id` (a forged cross-tenant `p_schedule_id` →
  `not_found`). `0048` proves: cross-tenant revise rejected (T9),
  cross-location revise + deactivate rejected (T10/T10b), module OFF blocks
  the RPCs (T7b) and the view (T7), data preserved (T7c), restored unchanged
  on ON (T8), `anon` denied.

## 9. Tests

- **`supabase/tests/0048_operations_schedule_versioning.sql`** — new.
  Reproduces the defect, then: TEST 1/4 past obligation survives recurrence
  change; TEST 2/2b future uses the new recurrence; TEST 3/3b deactivation
  preserves past, stops future; TEST 5 no duplicate occurrence across
  versions; TEST 6 materialised instance stays associated to its version;
  TEST 7/8 module OFF hides / ON restores; TEST 9/10/10b cross-tenant +
  cross-location revise/deactivate rejected; TEST 11a superseded version
  cannot be revised; TEST 11b `EXCLUDE` rejects a hand-crafted overlap;
  §20 threshold history (violation persists after `numeric_max` relaxed).
- **`0047` adjusted (2 changes, coverage not reduced)**:
  - the "disabled schedule" fixture (`d4`) is now a *retired* schedule
    (`effective_to` in the past, `is_active=false`) to satisfy the new
    `CHECK`; the assertion still proves "no expected tasks after the
    boundary".
  - the "historical expectation after a schedule edit" test now drives
    `api.operations_revise_schedule` (a raw `UPDATE` of a started version's
    recurrence is now blocked by the guard trigger — itself asserted) and
    checks by `schedule_group_id`: today's materialised occurrence survives,
    no duplicate on the boundary day, the day after uses the new recurrence.

## 10. Verification (VERIFIED, local, this session)

- `pnpm exec supabase db reset` — `0099`–`0102` apply clean.
- `pnpm exec supabase test db` — `0046`, `0047` (58), `0048` (24) pass.
  Full suite: **exactly the 11 known pre-existing failures**
  (`0002`×3, `0006`×1, `0008`×1, `0012`×2, `0023`×4), **zero new**.
- `pnpm exec turbo run typecheck lint build test --force` — **30/30**.
- Independent fresh-context review — launched against PR #462 with the
  reproduction requirement + 14 challenge lenses; outcome recorded here /
  in the PR once complete.

## 11. Boundaries honoured

- **No edit to `0099` / `0100` / `0101`.** No history rewrite. `0102` is
  additive; no row deleted, no historical Operations data dropped.
- **No cron / job / Event Bus / event-sourcing / snapshot JSON /
  pre-materialised instances** (scope §6).
- **RED path** (`supabase/migrations/**`) → autonomous `dev` merge
  forbidden. **PR #462 left for Founder merge.**
- **No `supabase db push`, no `tenant_modules` change, no Preview toggle,
  no production.** `0102` exists only on the feature branch.
- **`main` untouched.**
- No Manager/Staff UI, no HACCP presets, no Attention integration.

## 12. Deferred / follow-ups (not authorized by this handoff)

- **`checklist_templates` effective-dating** — close the same defect class
  for template deactivation (item 7 above).
- **Item-level config write path** (`response_type` / label / threshold
  edits) — the future Operations configuration slice; must version or
  forbid `response_type` changes.
- Cancelling a not-yet-effective future schedule version (needs a DELETE
  policy/grant + no-history check) — future config slice.
- Cloud/remote apply of `0099`–`0102` — separate explicit Founder-approved
  mission with the full evidence package.
- Cafe HACCP preset content; Manager/Staff Operations UI; Manager Attention
  integration — later bounded slices, each on its own Founder prompt.
