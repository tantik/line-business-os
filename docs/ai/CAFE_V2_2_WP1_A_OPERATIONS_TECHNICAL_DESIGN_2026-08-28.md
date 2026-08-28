# Cafe v2.2 WP1-A — Operations — Technical Design / Plan (2026-08-28)

Status: **REVIEWED — independent architecture review PASS WITH REQUIRED
FIXES (2026-08-28), zero P0.** Fixes folded in below. Produced by the WP1-A
implementation mission's design phase.

### Independent review outcome (2026-08-28)

Fresh-context reviewer challenged all 14 mandated points (§7 of the mission
prompt). Verdict: **PASS WITH REQUIRED FIXES**, no P0. All of tenant /
location / module-OFF / permission / generic-boundary / Workforce-
independence / audit-separation passed. Required fixes, folded into this
document:

- **P1-1 (blocks PR1 partially):** history tables must not be destructible
  by a config `DELETE`. All FKs from `task_instances` / `item_responses` /
  `task_exceptions` → `ON DELETE RESTRICT`; `checklist_items.template_id` →
  `RESTRICT` **already in `0100`** (not `cascade`); config is retired only
  via `is_active=false` / `effective_to`. Only `core.tenants on delete
  cascade` (whole-tenant offboarding) may cascade through.
- **P2-2 (blocks PR1):** `checklist_items` gains `is_active boolean not
  null default true`.
- **P1-2 (fix in §J before slice 2):** explicit operational-period
  definition for cross-midnight (Closing) tasks and DST — see §J.
- **P1-3 (fix in §J before slice 2):** hard horizon cap **inside**
  `api.operations_expected_tasks` as a contract, not prose — see §J.
- **P2-1 / P2-4 / P2-5 / P2-6 (slice 2 / test):** parent-consistency
  trigger on `item_responses`; split exception write keys; DML grants for
  the SECURITY INVOKER RPCs; a parent-forgery negative test. Recorded in
  §L / §M / §Q / §R.
- **P2-3 (hardened in `0100`):** rather than accept `workforce.recipes`-style
  soft visibility, the template RLS splits on `location_id is null`:
  tenant-wide templates need the permission in-tenant; location-scoped
  templates need it **at that location** (`core.has_permission(...,
  location_id)`), which a tenant-wide role assignment still satisfies and a
  foreign-location assignment does not. A real location boundary — see §D
  and `supabase/tests/0046`.

Canonical product scope (authoritative, fixed):
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` (D1–D5,
§§3–17).

Governance: `docs/ai/current-task.md` §5 (2026-08-28 pointer);
`docs/strategy/oruwa-master-roadmap.md` Phase 3.

This document is MVP-sized. Every meaningful architectural choice records:
chosen approach / alternatives considered / why smallest correct / future
limitation.

---

## 0. Repository truth this design is grounded in (recovered 2026-08-28)

- Branch `dev` = `origin/dev` = `ecefa15`, working tree clean, 0/0 divergence.
- Migrations exist through `supabase/migrations/0098_ai_module_access_gate.sql`.
  pgTAP test files through `supabase/tests/0045_ai_module_access_gate.sql`.
  **Next free numbers: migration `0099`, test `0046`.**
- **Module access primitive is live on `dev`**: `core.has_module_access(uuid,
  core.module_code)` (`0093`), SECURITY DEFINER, STABLE, fixed `search_path`,
  fail-closed (missing row → false, `is_enabled=false` → false), no
  platform-staff bypass, granted to `authenticated` + `service_role`.
- **Module Access Security Remediation is merged to `dev`** (PRs #448–#451,
  #453, #454; migrations `0093`–`0098`) but **NOT applied to Supabase Cloud
  dev or production** — every one of those migrations exists only on `dev`
  today. WP1-A adds to that same not-yet-pushed stack.
- `core.module_code` enum (`0001_core_enums.sql`) values today:
  `core, workforce, booking, logistics, crm, inventory, ai`. **No
  `operations` value exists.**
- `core.tenant_modules(tenant_id, module, is_enabled, config jsonb)`,
  `unique(tenant_id, module)`, `updated_at` trigger already attached
  (`0006`). Rows are seeded per tenant explicitly (e.g.
  `0068_oruwa_cafe_reference_tenant.sql` seeds `core/workforce/inventory`
  for the `oruwa-cafe` tenant).
- RBAC: `core.permissions(key, module, description)`,
  `core.role_permissions(role_id, permission_key)`, system role ids
  `…0003` tenant_owner, `…0004` tenant_admin, `…0005` manager,
  `…0006` employee. `core.has_permission(tenant_id, key, location_id)`
  (location-scoped) and `core.has_permission_in_tenant(tenant_id, key)`
  (any-location / tenant-wide) — both SECURITY DEFINER STABLE with the
  `is_platform_staff()` short-circuit.
- **PostgREST Data API exposes only `public` + `api`**
  (`supabase/config.toml`: `schemas = ["public", "api"]`). Every domain
  schema (`workforce`, `inventory`, `purchases`, …) stays unexposed;
  tenant-facing access is exclusively through `api.*` `security_invoker`
  views + `api.*` RPCs. `authenticated` is granted `USAGE` on the domain
  schema and `SELECT` on the specific base tables a `security_invoker` view
  reads, so RLS engages as the caller. Writes go through `apps/api`
  service-role paths or explicit `api.*` `SECURITY INVOKER` RPCs; RLS stays
  the real authorization boundary either way.
- Established RLS pattern after the remediation mission:
  `core.has_module_access(tenant_id, '<module>') AND
  core.has_permission[_in_tenant](tenant_id, '<key>'[, location_id]) AND
  <domain rule>`.
- Domain-table conventions (`0009_workforce.sql`, `0089_purchases_module.sql`):
  own schema; every table carries `tenant_id uuid not null references
  core.tenants(id) on delete cascade`; physical rows carry `location_id`;
  `created_at`/`updated_at timestamptz not null default now()` + a
  `core.set_updated_at()` `before update` trigger; composite
  `(tenant_id, id)` unique constraints where the table is an FK target;
  `enable row level security` on every table.
- Frontend module gating: `apps/web/src/lib/tenant/modules.ts` reads
  `api.my_tenant_modules` (already generic — a plain `module` string, no
  per-module code) and `isModuleEnabled()` fails closed. No frontend change
  is required for the foundation slice.

---

## A. Existing architecture being reused (no new infrastructure)

| Need | Reused mechanism | New code? |
|---|---|---|
| Module ON/OFF backend boundary | `core.has_module_access(tenant_id, 'operations')` | no — one new enum value only |
| Module entitlement storage/config | `core.tenant_modules` row per tenant | no |
| Permission checks | `core.has_permission` / `core.has_permission_in_tenant` + `core.permissions` / `core.role_permissions` catalog | new permission rows only (data) |
| Tenant isolation | `tenant_id` FK chain + RLS predicates keyed off the row's own `tenant_id` | no |
| Location isolation | `location_id` + `core.has_permission(..., location_id)`; tenant-wide rows (`location_id is null`) use `_in_tenant` | no |
| Data API surface | `api.*` `security_invoker` views + `api.*` RPCs; `config.toml` unchanged | new `api` views/RPCs |
| `updated_at` maintenance | `core.set_updated_at()` trigger | no |
| Frontend entitlement read | `api.my_tenant_modules` / `listTenantModules()` | no |
| Audit of config actions | existing `audit.*` pattern (`0005`) | wired in the config-write slice, not foundation |

**Chosen / alternatives / why:** the alternative was to build an
Operations-specific entitlement or capability check. Rejected by scope §10
(no capability infrastructure in WP1) and §9 (use the existing
`core.has_module_access` pattern). Smallest correct approach = add one enum
value and reuse every primitive as-is. Future limitation: none introduced;
a future Entitlement layer can be added inside `core.has_module_access`'s
body without touching Operations call sites (that function's own header
already promises this).

---

## B. Proposed minimal domain model (whole WP1 MVP — not all in the first slice)

New schema: `operations`. New enums in that schema (matches
`workforce.request_status` precedent):

- `operations.response_type` = `('boolean', 'numeric', 'text')`
- `operations.instance_status` = `('pending', 'in_progress', 'completed')`
- `operations.exception_status` = `('open', 'resolved')`
- `operations.recurrence_kind` = `('daily', 'weekdays')`

Tables (6). Column lists are the design intent; exact types are confirmed at
implementation.

### B1. `operations.checklist_templates` — reusable configuration
```
id                uuid pk
tenant_id         uuid not null  -> core.tenants(id) on delete cascade
location_id       uuid null      -> core.locations(id) on delete cascade   (null = tenant-wide template)
name              text not null
category          text null       -- free-text label ("Opening", "Closing", "Cleaning", "Temperature") — DATA, never an enum
description       text null
is_active         boolean not null default true
created_at / updated_at
unique (tenant_id, id)            -- FK target
```

### B2. `operations.checklist_items` — the checks inside a template
```
id                uuid pk
tenant_id         uuid not null
template_id        uuid not null  -> operations.checklist_templates(tenant_id, id) on delete restrict   -- P1-1: no cascade; retire via is_active
label             text not null
response_type      operations.response_type not null
is_critical        boolean not null default false   -- drives D4 severity derivation
is_required        boolean not null default true
is_active          boolean not null default true    -- P2-2: retire an item without hard delete
numeric_min        numeric null    -- only meaningful when response_type = 'numeric'
numeric_max        numeric null
numeric_unit       text null
sort_order         integer not null default 0
created_at / updated_at
unique (tenant_id, id)
check (response_type <> 'numeric' or (numeric_min is null or numeric_max is null or numeric_min <= numeric_max))
```

### B3. `operations.task_schedules` — binds a template to a location + recurrence
```
id                uuid pk
tenant_id         uuid not null
location_id        uuid not null  -> core.locations(tenant_id, id)   -- a schedule is always physical
template_id        uuid not null  -> operations.checklist_templates(tenant_id, id) on delete cascade
recurrence_kind    operations.recurrence_kind not null
weekdays           smallint[] null   -- ISO 1..7; required when recurrence_kind='weekdays', null for 'daily'
due_time           time not null      -- local wall time at the location's timezone
window_end_time    time null          -- optional operational window close
effective_from     date not null default current_date
effective_to       date null
is_active          boolean not null default true
created_at / updated_at
unique (tenant_id, id)
check (recurrence_kind <> 'weekdays' or (weekdays is not null and array_length(weekdays,1) between 1 and 7))
```

### B4. `operations.task_instances` — one concrete occurrence (created lazily — see §J)
```
id                uuid pk
tenant_id         uuid not null
location_id        uuid not null
schedule_id        uuid not null  -> operations.task_schedules(tenant_id, id) on delete restrict   -- P1-1: history is not destructible by config DELETE
template_id        uuid not null  -> operations.checklist_templates(tenant_id, id) on delete restrict  -- denormalized for history stability + parent-consistency check (P2-1)
business_date      date not null      -- the operational period this instance belongs to (location-local)
status             operations.instance_status not null default 'in_progress'
started_at         timestamptz not null default now()
started_by         uuid not null  -> core.users(id)
completed_at       timestamptz null
completed_by       uuid null      -> core.users(id)
created_at / updated_at
unique (tenant_id, schedule_id, business_date)   -- at most one materialized instance per period
unique (tenant_id, id)
```

### B5. `operations.item_responses` — structured response per item within an instance
```
id                uuid pk
tenant_id         uuid not null
instance_id        uuid not null  -> operations.task_instances(tenant_id, id) on delete restrict   -- P1-1
item_id            uuid not null  -> operations.checklist_items(tenant_id, id) on delete restrict
response_bool      boolean null
response_numeric   numeric null
response_text      text null
recorded_by        uuid not null  -> core.users(id)
recorded_at        timestamptz not null default now()
updated_at
unique (tenant_id, instance_id, item_id)   -- one current response per item per instance
-- P2-1: a trigger enforces item.template_id = (select template_id from task_instances where id = instance_id)
--        so a response cannot reference an item from a different template than the instance runs.
check ( -- exactly the column matching the item's response_type is used; enforced in the write RPC, mirrored here loosely
  (response_bool is not null)::int + (response_numeric is not null)::int + (response_text is not null)::int >= 1
)
```

### B6. `operations.task_exceptions` — operational problem, lifecycle distinct from task state (§I)
```
id                uuid pk
tenant_id         uuid not null
location_id        uuid not null
instance_id        uuid not null  -> operations.task_instances(tenant_id, id) on delete restrict   -- P1-1
item_id            uuid null      -> operations.checklist_items(tenant_id, id) on delete restrict   -- null = instance-level problem/report
severity           text not null check (severity in ('warning','action_required'))   -- D4
source             text not null check (source in ('threshold','critical_missed','reported','verification_required'))
note               text null
status             operations.exception_status not null default 'open'
resolved_by        uuid null  -> core.users(id)
resolved_at        timestamptz null
resolution_note    text null
created_at / updated_at
unique (tenant_id, id)
```

---

## C. Why each table is necessary (challenge every one)

| Table | Necessary because | If removed |
|---|---|---|
| `checklist_templates` | scope §4 "create reusable operational templates / checklists"; reuse across locations and future verticals (D5). | no reusable config; every location re-defines items. |
| `checklist_items` | scope §4 "define checklist items", §6 structured response model needs per-item `response_type` + numeric range. | can't express a checklist. |
| `task_schedules` | scope §11 "simple operational schedule / recurrence" + the §11 invariant (expected regardless of app-open) needs a persistent rule to derive expectation from. | no way to know what is "expected today". |
| `task_instances` | scope §5 "complete the task … see a clear completion state"; §13 history ("what was done, when, by whom"). | no completion record. |
| `item_responses` | scope §6 structured responses; §6 "numeric measurements stored structurally (not free text)". | responses unstructured / lost. |
| `task_exceptions` | scope §12 (exception ≠ task state, must stay distinct), D4 (two severities), §8 "Operations sends Manager Attention only actionable exceptions", "required verification waiting for a Manager". | exception lifecycle would have to be crammed into `item_responses`/`task_instances`, coupling problem-resolution to task-completion — exactly what §12 forbids. **This is the one table most worth challenging; see §I for the full argument to keep it.** |

Explicitly **not** created (Recovery-Report hypotheses, scope §16 —
rejected): a `template_snapshot` jsonb (B4 denormalizes only `template_id`,
not a frozen blob — MVP does not need point-in-time item wording for
history; deferred, see §T), a `recurrence` jsonb (B3 uses typed columns —
closed vocabulary, not a builder), a generic custom-field table, a
`haccp`-anything.

---

## D. Template / configuration model

- A **template** (B1) + its **items** (B2) are pure configuration, editable
  by `operations.template.manage` holders.
- Templates may be **tenant-wide** (`location_id is null`, visible to every
  location — like `workforce.recipes`) or **location-scoped**.
- **P2-3 (hardened):** `location_id` on a template **is** a security
  boundary. RLS splits on it: a tenant-wide template (`location_id is
  null`) needs the permission *in-tenant*; a location-scoped template needs
  it *at that location*. A tenant-wide role assignment
  (`role_assignments.location_id is null`) satisfies both (it manages every
  location); a Manager scoped to location L1 sees/edits tenant-wide + L1
  templates and **not** L2's. Exercised by `supabase/tests/0046`
  (location-isolation group).
- `category` is **free text** supplied by the Manager or by preset content
  — never an enum, never a code branch. "Opening / Closing / Cleaning /
  Temperature" (scope §7) are Cafe **preset data**, shipped in a separate
  Cafe migration, not in the generic `operations` schema (§P).
- Editing a template's items does **not** retroactively change already-
  completed `task_instances` history in MVP (B4 keeps `template_id`, and
  `item_responses` keep `item_id` — the response value is the durable fact;
  exact historical item wording is deferred, §T).

**Chosen / alternatives / why:** alternative — freeze a JSON snapshot of the
template into every instance for perfect historical fidelity. Rejected as
premature for an MVP whose history requirement (§13) is "what values were
recorded", satisfied by the response rows themselves. Smallest correct =
FK + denormalized `template_id`. Future limitation: if a customer later
disputes "what exactly did the checklist say on 2026-03-01", we would add a
`checklist_item_versions` table or a snapshot column then; nothing here
blocks it.

---

## E. Task-instance / execution model

- An instance is **materialized lazily** (§J): the first time a Staff member
  opens today's task for a given `(schedule, business_date)` and records a
  response (or a Manager marks it), the `task_instances` row is `INSERT`ed
  via an `api.*` RPC that resolves `business_date` from the location
  timezone server-side.
- `status`: `in_progress` on creation → `completed` when the RPC that
  completes it is called (all `is_required` items answered). `pending` is
  reserved for a future pre-materialization path and is not written by MVP
  code (documented, not dead — kept so the enum need not change later).
- **Expectation does not depend on the instance row existing** — see §J/§K.
  A missing instance for a past due period *is* the "missed" signal.

**Chosen / alternatives / why:** alternative — always create instance rows
ahead of time (cron/job). Rejected: adds scheduled-infra failure modes,
backfill logic, and a moving part, for no MVP benefit, because expectation
is already derivable from `task_schedules` + the calendar. Smallest correct
= lazy INSERT on first real interaction. Future limitation: if per-instance
assignment or per-instance notification-before-anyone-acts is later needed,
instances must be pre-created then — the table already exists, only the
population trigger changes.

---

## F. Structured response model (boolean / numeric / text)

- One `operations.item_responses` row per `(instance, item)`.
- `checklist_items.response_type` selects which column the write RPC accepts:
  `boolean` → `response_bool`; `numeric` → `response_numeric` (stored as
  `numeric`, **never** text — scope §6); `text` → `response_text`.
- The write RPC (`api.operations_record_response`) validates the payload
  against the item's `response_type` and raises a distinguishable error on
  mismatch (same friendly-error posture as
  `api.record_purchase_action`). RLS remains the real gate.
- No arbitrary key/value fields, no JSON form schema — a fixed
  three-value vocabulary (§12 "not a generic form builder").

**Chosen / alternatives / why:** alternative — a single `value jsonb` column
+ a per-item JSON schema. That *is* a form builder (scope §3, §15 out of
scope). Smallest correct = three nullable typed columns + a closed enum.
Future limitation: adding `photo` (D2) means adding an enum value + a
`response_attachments` child table + Storage wiring — additive, not blocked.

---

## G. Numeric threshold / range evaluation

- `checklist_items.numeric_min` / `numeric_max` (either or both nullable →
  one-sided or unbounded).
- At response time, the write RPC computes
  `out_of_range = response_numeric < numeric_min OR response_numeric >
  numeric_max` (null-safe).
- If `out_of_range`, the RPC opens an `operations.task_exceptions` row with
  `source='threshold'` and `severity = case when item.is_critical then
  'action_required' else 'warning' end` (D4).
- The evaluation is **stored** (as an exception row), not only computed on
  read, so Manager Attention and history are consistent and cheap to query.

**Chosen / alternatives / why:** alternative — evaluate range purely in a
read view. Rejected: the exception needs its own lifecycle (acknowledge /
resolve, §I) which a computed view cannot hold. Smallest correct = two
typed bound columns + evaluation at write time → exception row. Future
limitation: only a single continuous range per item (no "multiple
acceptable bands"); acceptable for MVP, extendable via a child table later.

---

## H. Minimal task lifecycle

```
(no row)  --first response via RPC-->  in_progress  --complete RPC (all required items answered)-->  completed
```

- No `cancelled`, no `skipped`, no reopen path in MVP (add later if a real
  need appears — scope §12 "choose a minimal lifecycle").
- A `completed` instance can still have `open` exceptions — completion and
  problem-resolution are independent (§I).

**Chosen / alternatives / why:** alternative — model the full
draft/active/blocked/void state machine. Rejected by §12 ("minimal
lifecycle", "not a universal Issues workflow"). Future limitation: a
genuine "could not perform this task" outcome has no first-class
representation yet — it would currently be recorded as an instance-level
exception (`source='reported'`); a dedicated status can be added without
migration pain.

---

## I. Operational-exception model — why it stays distinct from task state

Scope §12: *"Task execution state and operational exception / problem are
different concepts. A single task may carry an actionable exception without
turning the whole task lifecycle into a universal Issues workflow."*
D4: two severities. §8: Manager Attention receives **only** actionable
exceptions, never normal completions.

`operations.task_exceptions` (B6) is a separate table because:

1. **Different lifecycle.** A task is done or not done (§H, 2 transitions).
   An exception is open or resolved **by a different actor** (a Manager /
   verifier) **at a different time**, with its own `resolved_by` /
   `resolution_note`. Folding this into `task_instances` would block
   `completed` on exception resolution (or add exception columns to the
   instance that only sometimes apply) — coupling the two concepts §12
   forbids.
2. **Cardinality.** One instance → zero-to-many exceptions (a numeric
   breach on item 3 *and* a reported problem on item 7). Instance-level
   columns cannot hold that.
3. **Attention feed is a clean query.** "What needs a Manager" =
   `select … from operations.task_exceptions where status='open'` — no
   need to re-derive it from task + response + threshold joins on every
   dashboard load, and normal completions never appear (they never create a
   row).
4. **D4 severity lives on the problem, not the task.** `warning` vs
   `action_required` is a property of *this* exception.

**Sources** (`source` column) map the scope's conceptual "critical"
(D4) list:
- `threshold` — numeric out of range (§G).
- `critical_missed` — a past-due instance for a schedule that has a
  `is_critical` item and no `completed` instance (derived, §K; a row is
  written when the Manager dashboard/Attention query first observes it, or
  by the completion RPC if a required critical item was left unanswered —
  exact trigger is an implementation detail, scope D4).
- `reported` — Staff used the note/"report a problem" affordance
  (scope §5).
- `verification_required` — an item flagged as needing Manager sign-off
  was answered by Staff (Manager MVP §4 "perform verification where
  verification is required").

**Reviewer: challenge whether B6 can be collapsed into `item_responses` +
two instance columns.** Design position: no, because of points 1–2 above,
and because a `reported`/instance-level problem has no `item_id`. This is
the deliberate "one more table than the bare minimum" call, and it is the
minimum that keeps §12's separation real.

---

## J. Recurrence / instance-generation approach — **the load-bearing decision**

Scope §11 mandatory invariant: *"a task must exist / be considered expected
in its operational period regardless of whether any particular Staff member
opened the app."*

### Chosen approach: **derive expectation, materialize on interaction ("virtual instances")**

- **Expectation is a pure function** of `operations.task_schedules` × the
  calendar, computed by a SQL view
  `api.operations_expected_tasks` — for a given date range and the caller's
  permitted locations, it emits one row per
  `(schedule, business_date)` where the schedule is active
  (`is_active`, `effective_from <= d <= coalesce(effective_to, 'infinity')`)
  and the recurrence matches (`daily`, or `weekdays` contains
  `extract(isodow from d)`). It `LEFT JOIN`s `task_instances` on
  `(schedule_id, business_date)` to attach `status` / completion when a row
  exists, and computes a derived `state`:
  `completed` | `in_progress` | `not_started` | `overdue`
  (`overdue` = now (location-local) past `due_time`/`window_end_time` and no
  `completed` instance).
- **No stored row is required for a task to be "expected".** The expectation
  exists because the schedule + the date exist. This satisfies the §11
  invariant unconditionally — it holds even if the app is never opened, if
  every Staff phone is off, if no cron ever runs.
- A concrete `operations.task_instances` row is `INSERT`ed **only** when
  someone interacts (first response, or Manager action) — via an `api.*`
  RPC that computes `business_date` from `core.locations.timezone`
  server-side (client never supplies the date).
- **Overdue / missed detection** is the same view with a `where` on the
  derived `state` — it needs no job because "expected (from schedule) minus
  completed (from instances)" is computable at query time for any horizon.

### Alternatives considered

| Option | Why rejected for MVP |
|---|---|
| **Pure lazy generation on Staff page load** | Fails the §11 invariant explicitly — correctness would depend on a Staff user opening a page. The scope calls this out as *not acceptable*. |
| **`pg_cron` nightly materialization** | Requires enabling `pg_cron` (not in the current stack), a SECURITY DEFINER job function, monitoring, catch-up/backfill logic after downtime, and a timezone-correct "which locations rolled to a new day" query. Real moving part, real failure mode (job silently stops → no tasks), for zero MVP benefit over deriving expectation. |
| **Supabase scheduled Edge Function** | Same failure modes as cron + a deploy artifact + secret handling; scope §15 lists Edge/notification infra as out of scope. |
| **Materialize on *any* authenticated read (Manager or Staff)** | Still technically depends on *someone* loading a page within the period; and writing rows from a read path is a surprising side effect. The derived-view approach needs no such trick. |

### Why this is the smallest correct approach

The §11 invariant is fundamentally a statement about *expectation*, and
expectation is already fully determined by data we must store anyway (the
schedule). Storing instance rows ahead of time is redundant precision. The
view is ~30 lines of SQL with `generate_series`; there is no new extension,
no new deploy artifact, no new failure mode, nothing to monitor.

### P1-2 — operational-period definition (cross-midnight + DST), fixed here before slice 2

`business_date` is **the calendar date, in the location's timezone, of the
moment the operational window *opens*** — not the wall-clock date when a
late task is performed. Concretely:

- `task_schedules` gets an explicit rule: an instance's `business_date` is
  derived from `due_time` (the window open), not from `now()`. A Closing
  checklist with `due_time = '23:00'` and `window_end_time = '02:00'`
  performed at 01:30 is dated to the **day the window opened** (the 23:00
  side), so history attaches to the correct operating day and
  `unique(schedule_id, business_date)` stays stable across midnight.
- **Overdue** is computed against a full `timestamptz` built from
  `business_date` + `window_end_time` (or `due_time` when no window),
  rolled to the next calendar day when `window_end_time < due_time`, then
  localised to `core.locations.timezone` — never a naïve
  `now()::time > due_time` comparison.
- **DST**: when `due_time` names a wall-clock instant that does not exist
  on a spring-forward day at the location tz, the window open resolves to
  the following valid instant (Postgres `timestamptz` construction from a
  local timestamp already does this); when it is ambiguous (fall-back),
  the earlier instant is used. This is a one-line documented convention,
  not a deferred problem.
- The lazy-materialisation RPC computes `business_date` server-side by this
  rule from `schedule_id` + `now()`; the client never supplies it.

### P1-3 — horizon cap is part of the object contract, not prose

`api.operations_expected_tasks` (and/or the RPC that backs it) **clamps its
own date range inside the object**:
`d between greatest(p_start, current_date - 31) and least(p_end, current_date
+ 62)`. A caller cannot request a multi-year range and force a
tenant-controlled Cartesian blow-up of `generate_series × per-row RBAC`.
The clamp lives in the view/RPC body, is asserted by a slice-2 test, and is
not left to a caller-side or documentation-only guard.

### Future limitation (documented honestly)

- If Operations later needs to **notify** about a task *before anyone
  interacts* (LINE/email — scope §15, explicitly out of scope now), the
  notifier needs concrete rows to attach delivery state to → at that point
  add a small materializer (cron or Event Bus consumer). The schema does
  not change; `task_instances` simply gains a second creation path.
- If per-instance **assignment to a specific employee** is later added
  (scope §8 says optional, not now), same story.
- `generate_series` horizons should be bounded in the view/RPC (e.g. max
  ~62 days) to keep it cheap; documented as an implementation guard.

---

## K. How the design guarantees tasks are expected even when nobody opens the app

Because "expected today" = rows produced by `api.operations_expected_tasks`
for `business_date = today`, and that view reads **only**
`operations.task_schedules` + a date. A schedule row that a Manager created
last week keeps producing an expected task every matching day forever
(until `is_active=false` or `effective_to` passes), with **no code running
in between**. The first time anyone (Manager or Staff) looks — a minute
later or three days later — the view already shows today's task, and every
past due date it shows as `overdue`. Nothing was "lost" by the app being
closed; there was never a row that needed creating.

---

## L. Permissions / RBAC

New rows in `core.permissions` (all `module = 'operations'`):

| key | held by (role → permission seed) | purpose |
|---|---|---|
| `operations.template.manage` | owner, admin, manager | create/edit templates, items, schedules |
| `operations.task.read` | owner, admin, manager, employee | see expected tasks, instances, responses |
| `operations.task.execute` | owner, admin, manager, employee | record responses, complete a task, report a problem |
| `operations.exception.resolve` | owner, admin, manager | resolve exceptions / record verification |

- Seeded into `core.role_permissions` for the four system role ids in the
  foundation migration (same `do $$ … $$` pattern as `0089`).
- **P2-4 — `task_exceptions` write keys are split (slice 2):**
  `INSERT` with `source='reported'` and any `item_id` → requires
  `operations.task.execute` (Staff can report a problem);
  `INSERT` with `source in ('verification_required','threshold',
  'critical_missed')` and every `UPDATE` (`open → resolved`) → requires
  `operations.exception.resolve`. Encoded in the RLS `with check` /
  `using` per-command, not a single generic write predicate.
- Location scoping: `task_schedules` / `task_instances` / `item_responses` /
  `task_exceptions` always have a `location_id` → `core.has_permission(…,
  location_id)`. `checklist_templates` / `checklist_items` may be
  tenant-wide → `core.has_permission_in_tenant(tenant_id, key)` **OR**
  `core.has_permission(tenant_id, key, location_id)` for location-scoped
  templates (mirrors `workforce.recipes` in `0022`).

**Chosen / alternatives / why:** alternative — one coarse
`operations.manage` + `operations.use`. Rejected: Manager-verification (§4)
and Staff-execute are genuinely different authority levels, and §8's
Attention-only-actionable needs `exception.resolve` separable from
`task.execute`. Four keys is the minimum that expresses the scope's own
Manager/Staff split. Future limitation: no per-template ACLs (a
`template.manage` holder manages all templates in scope) — fine for SMB
MVP.

---

## M. RLS and tenant / location isolation

Every one of the 6 tables: `enable row level security`, no policy for
`anon`, and per-command policies of the form:

```sql
-- read
using (
  core.has_module_access(tenant_id, 'operations')
  and (
    core.has_permission_in_tenant(tenant_id, 'operations.task.read')
    or core.has_permission(tenant_id, 'operations.task.read', location_id)  -- omit for template tables (no location_id) / include for physical tables
  )
)
-- write: same shape with the write-tier key, plus domain rules
-- (item_responses.recorded_by = core.current_user_id(); instance status guards; etc.)
```

- `tenant_id` in every predicate comes from **the row being checked**, never
  a session GUC or client value (Operating Model / `0022` header rule).
- Child tables (`checklist_items`, `item_responses`, `task_exceptions`)
  additionally verify the parent belongs to the same `tenant_id` via the
  composite FK — a forged `template_id`/`instance_id` from another tenant
  cannot resolve.
- `task_instances` / `item_responses` writes also enforce that the
  referenced schedule/instance is itself in an `operations`-enabled,
  permitted location (re-derived, not trusted).

**Isolation tests** are the core of the foundation slice (§R).

---

## N. `core.has_module_access` integration

- Literally `core.has_module_access(tenant_id, 'operations')` as the **first
  conjunct** of every RLS `using` / `with check` on all 6 tables, and as an
  explicit early pre-check (`raise exception 'operations_module_disabled'`)
  in every `api.*` write RPC — exactly the pattern
  `0094_purchases_module_access_gate.sql` established.
- `api.*` `security_invoker` views inherit the gate automatically from the
  base-table RLS (no separate check in the view body needed — but
  `api.operations_expected_tasks` reads `task_schedules`, whose RLS carries
  the gate, so a module-OFF tenant's expected-tasks view goes empty too).
- **Module OFF** → all tenant-facing SELECT returns zero rows; all
  tenant-facing INSERT/UPDATE rejected by RLS; RPCs raise a distinguishable
  error; **no row is deleted** (no policy, no RPC, nothing in any migration
  deletes `operations` data on module toggle). **Module ON again** → prior
  rows visible/actionable exactly as before. Proven by the ON→OFF→ON pgTAP
  lifecycle test (§R), mirroring `supabase/tests/0041`.

**Chosen / alternatives / why:** the remediation mission already settled
this pattern; deviating would be the risk. No alternative considered worth
listing. Future limitation: none — a future Entitlement layer slots into
`core.has_module_access` centrally.

---

## O. Audit / business-history separation

- **Business operational history** (scope §13: what was required, done,
  when, by whom, values, exceptions, resolution) lives entirely in the
  `operations.*` tables:
  - "what was required" → `task_schedules` + `checklist_items`
  - "what was done / when / by whom" → `task_instances`
    (`started_by`/`completed_by`/timestamps) + `item_responses`
    (`recorded_by`/`recorded_at`)
  - "what values" → `item_responses.response_*`
  - "exceptions / resolution" → `task_exceptions`
  - `item_responses` and `task_exceptions` are **append-mostly**: responses
    allow a corrective UPDATE (one current value per item) with
    `updated_at`; exceptions transition open→resolved only. No hard
    DELETE path tenant-facing.
- **`audit.*`** (existing pattern, `0005`) is used **only** for genuinely
  audit-worthy *configuration / verification* actions: template
  created/edited/deactivated, schedule created/changed/deactivated, and a
  Manager verification decision. Wired in the **config-write slice**, not
  the foundation slice. The audit log is **not** written on every response
  or task completion — those are business events, captured by the tables
  above (scope §13: "Do not turn the audit log into a business event
  store").

**Reviewer: challenge whether any `operations` write is mistakenly routed to
`audit.*`.** Design position: only the four config/verification actions
above, and only in the later slice.

---

## P. Generic Operations vs Cafe HACCP presets — the boundary

| Layer | Contains | Where it lives |
|---|---|---|
| **Generic `operations` domain** | the 6 tables, 4 enums, 4 permissions, `core.has_module_access` gate, `api.*` facade, RPCs. **Zero** strings like "HACCP", "hygiene", "opening", "temperature" in schema objects. `category` is `text`. | `supabase/migrations/0099`–`0101` |
| **Cafe HACCP presets** | actual `checklist_templates` + `checklist_items` + `task_schedules` **rows** ("開店前チェック", temperature checks with `numeric_min/max`, `is_critical=true`, corrective-action guidance) for the `oruwa-cafe` reference tenant. | a **separate** Cafe migration (e.g. `0102_oruwa_cafe_operations_presets.sql`) **or** app-level tenant provisioning — **deferred**, not in WP1-A foundation (scope §14: prefer deferring presets). |

- D3: **no `haccp` `module_code`**, no `has_capability('haccp')`, no
  HACCP-specific column or table. Confirmed by the table/enum lists above.
- D5: the generic domain must work for a future Salon/other vertical with
  different preset rows and nothing else changing.

---

## Q. Migration strategy

| # | File | Contents | In first slice? |
|---|---|---|---|
| `0099` | `0099_core_module_code_add_operations.sql` | **only** `alter type core.module_code add value if not exists 'operations';` and a comment. Nothing else — a new enum value cannot be *used* in the same transaction it is added, so it gets its own migration file with no other statements. | **YES** |
| `0100` | `0100_operations_module_foundation.sql` | `operations` schema; the 4 enums; `checklist_templates` + `checklist_items` (`template_id` FK = **`on delete restrict`**, P1-1; `checklist_items.is_active`, P2-2); `updated_at` triggers; `enable RLS` + policies (module-gated); `core.permissions` + `core.role_permissions` seed rows; `api.operations_templates` / `api.operations_template_items` `security_invoker` read views; `grant usage on schema operations` + `grant select` on the two base tables + views to `authenticated`; `revoke all … from anon, public`. | **YES** |
| `0101` | `0101_operations_scheduling_execution.sql` | `task_schedules`, `task_instances`, `item_responses` (+ parent-consistency trigger, P2-1), `task_exceptions` (split write keys, P2-4); RLS; `api.operations_expected_tasks` view (the §J derivation, horizon-clamped P1-3); `api.operations_record_response`, `api.operations_complete_task`, `api.operations_open_exception`, `api.operations_resolve_exception` RPCs (SECURITY INVOKER); **P2-5: `grant insert, update on operations.{task_instances,item_responses,task_exceptions} to authenticated`** (the SECURITY INVOKER RPCs act as the caller — RLS stays the boundary); audit wiring for config/verification; grants. | no — later bounded slice |
| `0102` | `0102_oruwa_cafe_operations_presets.sql` (Cafe-specific) | Cafe HACCP preset rows for `oruwa-cafe`. | no — deferred |

- **No historical migration is edited or renumbered** (`AGENTS.md`).
- **No `supabase/config.toml` change** — `operations` stays unexposed;
  everything tenant-facing is `api.*`.
- **Fixture debt**: like the remediation mission (its §5), some existing
  pgTAP fixtures create tenants without an explicit `core.tenant_modules`
  row. `operations` RLS fails closed, but **existing tests never touch
  `operations`**, so no existing fixture needs an `operations` row — this
  is expected to be a **non-issue** for `operations` specifically (unlike
  the remediation mission, which retrofitted a gate onto tables existing
  tests already exercised). To be re-confirmed by a full `supabase test db`
  run, not assumed.
- **RED path**: every file under `supabase/migrations/**` → the foundation
  PR is RED per `scripts/ai-dev-merge.sh` / `.claude/settings.json`.
  Autonomous `dev` merge is **structurally forbidden**; the PR is built,
  reviewed, CI'd, and left for **Founder merge**. **No `supabase db push`,
  no Cloud write, no production** anywhere in this mission.

---

## R. Test strategy

`supabase/tests/0046_operations_module_foundation.sql` (pgTAP, run via
`pnpm exec supabase db reset && pnpm exec supabase test db`) — the
foundation slice's own suite, following the `0041`/`0044` structure
(`pg_temp.as_auth_*` role-hop helpers, in-transaction grants, `rollback`):

1. **Tenant isolation** — tenant A's `authenticated` caller cannot SELECT
   tenant B's templates/items; cannot INSERT a row claiming tenant B.
   **P2-6:** also the subtler forgery — `tenant_id = A` with a
   `template_id` belonging to tenant B — must be rejected (the composite
   `(tenant_id, id)` FK makes it unresolvable); explicit negative test.
2. **Location isolation** — a Manager assigned only to location L1 sees
   L1-scoped + tenant-wide templates, not L2-scoped ones.
3. **Module ON → OFF → ON lifecycle** — with `operations` ON, a permitted
   caller reads/writes normally; set `is_enabled=false` → tenant-facing
   SELECT returns 0 rows, INSERT/UPDATE rejected by RLS, the pre-existing
   row still present via a superuser read (**historical-data preservation**);
   set `is_enabled=true` → the same row visible/actionable again, unchanged.
4. **Fail-closed with no `tenant_modules` row** — a tenant that never had an
   `operations` row: all tenant-facing access denied.
5. **Permission enforcement** — `employee` (has `task.read`/`task.execute`,
   lacks `template.manage`) cannot INSERT/UPDATE a template; a tenant member
   with no operations permission at all sees nothing; a non-member sees
   nothing.
6. **`anon` fully denied** on schema, base tables, and `api.*` views.
7. **Catalog assertions** — the 4 permission keys exist with
   `module='operations'`; role→permission seed is exactly as designed
   (owner/admin/manager/employee sets).
8. **`api.operations_templates` view** — `security_invoker`, returns only
   RLS-permitted rows, no unintended columns.

Plus:
- **Full regression**: `pnpm exec supabase db reset && pnpm exec supabase
  test db` — must show **exactly the 11 known pre-existing failures** from
  the remediation report §6 and **zero new failures**. Any new failure is
  reported as NEW vs PRE-EXISTING, not hidden.
- `pnpm -w typecheck` / `lint` / `build` / `test` — foundation slice is
  SQL-only (no `apps/*` / `packages/*` change), so these must stay green,
  same as the remediation mission.

Slice-2+ tests (`0047…`): recurrence-derivation correctness (daily,
weekday-match, effective range, DST edge at the location tz), overdue
derivation without any instance row, lazy-instance uniqueness under
concurrent first-response, numeric threshold → exception + D4 severity,
exception lifecycle independent of task completion, Attention feed = open
exceptions only.

---

## S. UI / API consequences expected for later WP1 slices

- **Read API** (foundation): `api.operations_templates`,
  `api.operations_template_items`.
- **Read API** (slice 2): `api.operations_expected_tasks` (Staff "today"
  list + Manager completion view), `api.operations_instance_detail`,
  `api.operations_open_exceptions` (Manager Attention feed).
- **Write API** (slice 2): `api.operations_record_response`,
  `api.operations_complete_task`, `api.operations_open_exception`,
  `api.operations_resolve_exception`. Template/schedule **writes**: follow
  the `workforce` precedent — either `apps/api` service-role path or a
  small `api.*` RPC set in the config slice.
- **Frontend** (later slices, not now): a Manager "Operations
  configuration" surface (scope §4 — separate from the main dashboard); a
  Manager "today's operations" view; a Staff Operations entry point +
  checklist runner; Manager Attention integration consuming
  `api.operations_open_exceptions`. `apps/web/src/lib/tenant/modules.ts`
  already generic → the only frontend module-gate work is adding
  `'operations'` to whatever en//module allow-list the Staff/Manager
  dashboards use (to be located when that slice starts).
- **`api.my_tenant_modules`** already returns the `operations` row once a
  tenant has one — no change.

---

## T. Explicitly deferred (not in WP1-A, some not in WP1 at all)

- Cafe HACCP **preset content** (templates/items/schedules rows) — later
  bounded slice or provisioning (scope §14).
- **Manager & Staff UI** — later slices.
- `task_schedules` / `task_instances` / `item_responses` /
  `task_exceptions` tables, the expected-tasks view, and all write RPCs —
  **slice 2**, not the foundation PR.
- Photo / evidence capture, Operations Storage/media (D2, scope §15).
- LINE / email notifications, Event Bus, any scheduled job/cron (scope §15).
- Per-instance assignment to a specific employee (scope §8 — optional,
  not now).
- Point-in-time template/item wording snapshots for history (§D).
- Multiple acceptable numeric bands per item (§G).
- A first-class "could not perform" task outcome (§H).
- Reference link between an Operations item and a Recipe/Manual (scope §8 —
  acceptable later, not required).
- Capability framework, entitlement redesign (scope §10, §15).
- Remote/Cloud DB apply of any `operations` migration — separate explicit
  Founder approval, with the evidence package §9 of the mission prompt
  requires.

---

## First implementation slice — minimized (for §8 of the mission prompt)

**Scope of PR 1 ("Operations Foundation"):**

1. `0099_core_module_code_add_operations.sql` — enum value only.
2. `0100_operations_module_foundation.sql` — `operations` schema, 4 enums,
   `checklist_templates` + `checklist_items` only (`template_id` FK
   `on delete restrict`; `checklist_items.is_active`), `updated_at`
   triggers, module-gated RLS, 4 permissions + role seed, 2 `api` read
   views, grants, anon revokes.
3. `supabase/tests/0046_operations_module_foundation.sql` — the 8 test
   groups in §R + regression baseline confirmation.
4. No `apps/*` code. No presets. No schedules/instances/responses/
   exceptions. No write RPCs. No Cloud apply.

**Definition of Done for PR 1:** local `supabase db reset` + `supabase test
db` green except the 11 known pre-existing failures; `typecheck`/`lint`/
`build`/`test` green; independent fresh-context security review PASS with no
open P0/P1; PR opened against `dev`; CI green; **left for Founder merge**
(RED path).

**Why this is minimal and still a real foundation:** it proves — with
executable tests — that Operations is a backend-gated, permission-gated,
RLS-protected, tenant/location-isolated, reusable module whose data
survives a module-OFF toggle, *before* any scheduling/execution complexity
or any Cafe-specific content exists. Everything hard (recurrence, the
exception model) is designed here on paper and reviewed, but built on top
of a proven base.
