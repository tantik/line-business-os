# Cafe v2.2 WP1-A — Operations — Slice 2 (Scheduling & Execution) — Handoff (2026-08-28)

Status: **PR #460 open against `dev`, CI green, independent review recorded.
RED path (`supabase/migrations/**`) → left for Founder merge. No Cloud
apply. `main` untouched.**

Read first: `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`,
`docs/ai/current-task.md` §5 (newest pointer), the product scope
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md`, and the
technical design `docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md`.

## 1. Mission

Cafe v2.2 WP1 Operations, **Slice 2**: the minimum generic Operations
execution engine — schedules, deterministic expected-task calculation,
task instances, structured responses, operational exceptions, write RPCs,
security + lifecycle tests. **No Manager/Staff UI, no HACCP presets, no
Cloud DB push.** Continues the WP1-A mission whose foundation slice merged
as PR #459 (`0099` enum value, `0100` `operations` schema + templates/items).

## 2. Repository state

- Branch `feat/operations-slice2-scheduling-execution` from `origin/dev`
  (`823be38`). Working tree clean.
- New files only:
  - `supabase/migrations/0101_operations_scheduling_execution.sql`
  - `supabase/tests/0047_operations_scheduling_execution.sql`
  - this handoff + a `current-task.md` §5 pointer + `current-task.md`
    correction (PR #459 is merged, prior pointer said "awaiting merge").
- No `apps/*` / `packages/*` / `supabase/config.toml` change.

## 3. Design reconciliation (done before coding)

Verified the slice-2 design against the merged `0099`/`0100`. **No material
contradiction with the approved product scope.** Notable confirmations /
decisions:

| Item | Outcome |
|---|---|
| Timezone source | `core.locations.timezone` (`text NOT NULL DEFAULT 'Asia/Tokyo'`, since migration `0002`) **already exists and is canonical** — reused, nothing invented, no architecture gap to report. |
| Enums | `0100` already created all 4 (`response_type`, `instance_status`, `exception_status`, `recurrence_kind`) — slice 2 does **no** `ALTER TYPE`. |
| FK targets | `0100` created `unique (tenant_id, id)` on both foundation tables — composite FKs from slice-2 tables resolve. |
| `task_schedules → checklist_templates` FK | `ON DELETE RESTRICT` (design §B3 said `cascade`; used `restrict` for consistency with P1-1 — retire via `is_active`/`effective_to`). Documented deviation. |
| `task_exceptions` INSERT `source='threshold'` | Rides `operations.task.execute`, not `operations.exception.resolve` (design P2-4 said the latter). Rationale: the threshold row is a **deterministic server-side side effect** of a measurement the same caller is permitted to record via the `SECURITY INVOKER` RPC — creating it is not privileged; **resolving** it still requires `operations.exception.resolve`. This is more correct than the paper design. Documented in the migration + PR. |
| `location_id` on `item_responses` | Denormalised (design §B5 omitted it) so RLS can location-scope responses symmetrically with the other physical tables; a guard trigger keeps it consistent with the parent instance. |

## 4. Model as built

### Recurrence — derive expectation, materialise on interaction

- `operations.task_schedules`: `recurrence_kind ∈ {daily, weekdays}`,
  `weekdays smallint[]` (ISO 1..7), `due_time time`, optional
  `window_end_time time`, `effective_from/to date`, `is_active`. Typed
  columns only — no RRULE, cron, DSL, monthly, holiday calendar.
- `api.operations_expected_tasks(p_start, p_end)` — set-returning
  `SECURITY INVOKER` function. Expectation = pure function of
  `task_schedules` × `generate_series(calendar)` where the schedule is
  active, in its effective range, its **template is active**, and the
  recurrence matches (`daily`, or `extract(isodow from d) = any(weekdays)`).
  `LEFT JOIN task_instances` on `(schedule_id, business_date)` for
  status/completion. Derived `state ∈ {completed, in_progress,
  not_started, overdue}`. **No stored row is required for a task to be
  "expected"** (scope §11 invariant). `task_schedules` RLS is the
  tenant/location/module gate.
- **Horizon clamp is inside the function body** (design P1-3):
  `[greatest(p_start, current_date-31), least(p_end, current_date+62)]`.
  Asserted by a test.
- **Missed / overdue without an instance**: `state='overdue'` = window
  closed (full `timestamptz` built from `business_date` + window, localised
  to the location tz) and no completed instance. Derived at query time, no
  job, no row. `task_exceptions.source` keeps `critical_missed` /
  `verification_required` for a future slice — **nothing in `0101` writes
  them**. `api.operations_expected_tasks` also emits `is_overdue_critical`
  and `open_exception_count` as the conceptual hook for later Manager
  Attention integration (no UI in this slice).

### Timezone / cross-midnight

`operations.schedule_business_date(tenant_id, schedule_id, p_now)` —
`SECURITY DEFINER`, fixed `search_path`, pure date math (not an
authorization check). `business_date` = location-local calendar date at the
moment the window **opens**. A Closing task (`due_time 23:00`,
`window_end_time 02:00`) performed at 01:30 local is dated to the day the
window opened. `operations.location_timezone(...)` — `SECURITY DEFINER`
(timezone is non-sensitive config) so `api.operations_expected_tasks` does
not depend on the membership-gated `core.locations` RLS join.

### Instance materialisation

Lazy. `operations.task_instances` created only by an `api.*` RPC on first
interaction, via `INSERT ... ON CONFLICT (tenant_id, schedule_id,
business_date) DO NOTHING` + a follow-up `SELECT` — concurrency-safe, the
unique constraint prevents duplicates. `status`: `in_progress` →
`completed` only (`pending` reserved, unused).

### Responses

`operations.item_responses`, one row per `(instance, item)`, three typed
columns. `BEFORE INSERT/UPDATE` trigger `operations.item_responses_guard()`:
(1) item must belong to the instance's template (design P2-1); (2)
`location_id` must match the instance; (3) **no UPDATE once the instance is
completed** (scope §19 immutability). The write RPC also validates the
payload against the item's `response_type` and raises
`operations_response_type_mismatch`.

### Numeric thresholds

`checklist_items.numeric_min/max` (from `0100`). The write RPC computes
out-of-range server-side (null-safe) and opens a `threshold` exception with
`severity = is_critical ? 'action_required' : 'warning'` (D4). **The
measurement is always recorded first** — fact is primary. A partial unique
index `(tenant_id, instance_id, coalesce(item_id,…), source) WHERE
status='open'` stops repeated breaches stacking duplicate open rows.

### Exceptions

`operations.task_exceptions` — separate table, `open → resolved` lifecycle
distinct from task state, `resolved_by`/`resolved_at`/`resolution_note`.
Sources this slice: `threshold` (auto), `reported` (Staff). Split write
keys (see §3). Open exceptions **do not block** task completion (scope §12).

### Corrective / recheck

No new table, no HACCP hardcode. Generic mechanism: a corrective recheck is
a new `item_responses` for the next period's instance; a corrective note is
`resolution_note` on the exception.

### Write RPCs (all `api.*`, `SECURITY INVOKER`, fixed `search_path`,
`#variable_conflict use_column`)

| RPC | Guards |
|---|---|
| `operations_record_response(tenant, schedule, item, bool, numeric, text)` | auth context; `has_module_access`; schedule active & in-tenant; `has_permission('operations.task.execute', location)`; item in template + active; exactly-one-value + type match; lazy instance upsert; reject if instance completed; upsert response; threshold → exception. |
| `operations_complete_task(tenant, schedule)` | as above + instance exists & `in_progress`; every active+required item answered → else `operations_required_items_incomplete`; set `completed`. |
| `operations_report_problem(tenant, schedule, item?, note?, severity)` | `task.execute` at location; item (if given) in template; lazy instance upsert; open `reported` exception. |
| `operations_resolve_exception(tenant, exception, note?)` | `has_module_access`; exception in-tenant; `has_permission('operations.exception.resolve', location)`; not already resolved; set `resolved`. |

## 5. Security

- All 4 new tables: `enable row level security`, no `anon` policy,
  `core.has_module_access(tenant_id, 'operations')` as the first conjunct of
  every policy, `tenant_id` taken from the row being checked.
- Child tables verify the parent via composite `(tenant_id, id)` FK — a
  forged cross-tenant `schedule_id`/`instance_id`/`item_id`/`template_id`
  cannot resolve.
- Location scoping: `has_permission(..., location_id)` on every physical
  table; a tenant-wide role assignment still matches, a foreign-location
  one does not.
- `authenticated` grants: `SELECT` on `task_schedules`; `SELECT, INSERT,
  UPDATE` on `task_instances` / `item_responses` / `task_exceptions` (the
  `SECURITY INVOKER` RPCs act as the caller — design P2-5). No DELETE grant
  anywhere. `anon`/`public` explicitly revoked.
- Module OFF → all tenant-facing SELECT returns 0 rows, all INSERT/UPDATE
  rejected by RLS, RPCs raise `operations_module_disabled`, **nothing is
  deleted**; module ON again restores everything unchanged.

## 6. Verification (VERIFIED, local, this session)

- `pnpm exec supabase db reset` — `0099`–`0101` apply clean.
- `pnpm exec supabase test db` — `supabase/tests/0047` **53/53 pass**. Full
  suite: **exactly the 11 known pre-existing failures** (`0002_security_rls`
  ×3 [14, 20-21], `0006_api_has_permission` ×1 [5],
  `0008_workforce_staff_recipes_rls` ×1 [5], `0012_workforce_cafe_api_facade`
  ×2 [20-21], `0023_inventory_permanent_delete` ×4 [8-11]) — the exact
  baseline from the Module Access Security Remediation report §6. **Zero new
  failures.**
- `pnpm exec turbo run typecheck lint build test --force` — **30/30 tasks
  pass** (SQL-only change; no `apps/*` / `packages/*` touched).
- Independent fresh-context review (13 mandated challenge lenses, reviewer
  re-ran `supabase test db` itself and reproduced the result exactly):
  **PASS — merge-ready. No P0/P1/P2.** 7 findings, all P3 or
  tracking-class. Three cheap P3 fixes applied in commit `1db623f`:
  - **F1** — `item_responses_guard` now blocks INSERT (not only UPDATE)
    into a completed instance (data-level backstop for §19).
  - **F2** — new `task_exceptions_guard` trigger: denormalised
    `location_id` must equal the parent instance's (within-tenant
    cross-location integrity).
  - **F3** — removed the unused `operations.can_execute_at()` helper
    (dead code).
  - **F5** (`complete_task` schedule lookup omits `is_active`) — left as
    is: finishing an in-progress task on a since-deactivated schedule is
    correct behaviour.
  - **F6** (retroactive recurrence narrowing revises non-materialised past
    expectation) / **F7** (audit wiring deferred) — accepted per design
    (§12 minimal freeze boundary; audit is an app-layer slice concern,
    §O).

## 7. Boundaries honoured

- **RED path** (`supabase/migrations/**`) — no autonomous `dev` merge;
  `scripts/ai-dev-merge.sh` would refuse it. **PR #460 left for Founder
  merge.**
- **No `supabase db push`, no `supabase link`, no Cloud/remote DB write, no
  production.** `0101` exists only on the feature branch.
- **`main` untouched.**
- No Manager/Staff UI, no Cafe HACCP presets, no notification/Storage/Event
  Bus infra, no capability framework — all out of scope for this slice.

## 8. Deferred / next (not authorized by this handoff)

- Cloud/remote apply of `0099`–`0101` — separate explicit Founder-approved
  mission with the full evidence package.
- Cafe HACCP preset content (templates/items/schedules **rows** for the
  `oruwa-cafe` tenant) — separate Cafe migration or provisioning (design
  §P).
- Manager "Operations configuration" surface + Manager "today's operations"
  + Manager Attention integration; Staff Operations entry point + checklist
  runner — later UI slices.
- `verification_required` / `critical_missed` exception generation, item
  "requires Manager verification" flag — later slice (scope §18 permits
  deferring verification).
- Point-in-time template/item wording snapshots for history (design §T);
  multiple acceptable numeric bands per item (design §G); a first-class
  "could not perform" task outcome (design §H).
