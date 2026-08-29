# Cafe v2.2 WP1-A — Operations — Configuration API — Handoff (2026-08-29)

Status: **PR OPEN on branch `fix/operations-configuration-api` (RED path —
migration — autonomous `dev` merge forbidden, left for Founder merge). No
Cloud apply. `main` untouched.**

Read first: `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`,
`docs/ai/current-task.md` §5, the scope
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` §4,
the design `docs/ai/CAFE_V2_2_WP1_A_OPERATIONS_TECHNICAL_DESIGN_2026-08-28.md`
§D, and the prior handoffs (PR #462/#463 schedule versioning, PR #464
template retirement).

## 1. Truthful history

- **PR #459** foundation, **#460** execution engine, **#462/#463** schedule
  effective-dated versioning (`0102`/`0103`), **#464** template retirement
  dating (`0104`) — all merged into `dev`.
- **This PR** — migration `0105`: the tenant-facing **Configuration API**
  (templates → items → schedules), plus closure of the three mandatory
  invariants prior reviews recorded.

## 2. Goal

Establish the controlled write boundary so a future Manager configuration UI
never writes the internal `operations` tables directly. No UI, no presets, no
Attention, no notifications, no form builder.

## 3. Architecture

Identical posture to `0101`/`0102`: every tenant-facing write is an explicit
`api.*` business RPC — `SECURITY INVOKER`, fixed `search_path`,
`#variable_conflict use_column`, early distinguishable raise on
module-OFF / permission / lifecycle. **RLS write policies + BEFORE triggers
are the real boundary.** ADR 0008 (no `SECURITY DEFINER` object in the `api`
schema — asserted by tests 0005/0006/0009/0012) is preserved: the only new
`SECURITY DEFINER` helper, `operations.item_is_operationalized`, is a factual
check (not authorization), lives in the `operations` schema, same posture as
`operations.schedule_business_date`. `operations` stays out of the PostgREST
exposed schemas (`config.toml` untouched).

## 4. API added

All `SECURITY INVOKER`, `api` schema, `operations.template.manage` +
`core.has_module_access` gated, actor server-side.

| RPC | Purpose |
|---|---|
| `api.operations_create_template(tenant, name, location?, category?, description?)` → uuid | create a template (location NULL = tenant-wide). |
| `api.operations_update_template(tenant, template, name, category, description)` → void | **metadata only** — never `is_active` / `retired_on` / `location_id`. |
| `api.operations_retire_template(tenant, template, retired_on? = today)` → date | **atomic** `is_active=false` + `retired_on` (the §8 coherence fix). Retroactive / already-retired rejected. |
| `api.operations_add_template_item(tenant, template, label, response_type, is_critical?, is_required?, numeric_min?, numeric_max?, numeric_unit?, sort_order?)` → uuid | add an item to a non-retired template. |
| `api.operations_update_template_item(tenant, item, label, is_critical, is_required, numeric_min, numeric_max, numeric_unit, sort_order)` → void | safe fields only. **No `response_type` parameter.** `is_critical` change rejected once operational (trigger). |
| `api.operations_retire_template_item(tenant, item)` → void | `is_active=false`; history preserved (0104 handoff §7). |
| `api.operations_replace_template_item(tenant, old_item, label, response_type, …)` → uuid | retire old + create new on the same template — **the sanctioned response_type-change path**. |
| `api.operations_create_schedule(tenant, location, template, recurrence_kind, due_time, weekdays?, window_end_time?, effective_from? = today)` → uuid | new **logical** schedule (fresh `schedule_group_id`). `effective_from < current_date` rejected. Non-retired template; a location-scoped template can only be scheduled at its own location. |
| `api.operations_cancel_scheduled_revision(tenant, schedule)` → (cancelled, reopened) | physically DELETE a version that is genuinely not-yet-effective (`effective_from > current_date`, zero `task_instances`) and re-open the predecessor a revision closed. |

## 5. API reused unchanged (0102) — already correct

- `api.operations_revise_schedule(...)` — atomic close-current + new future version.
- `api.operations_deactivate_schedule(...)` — retire a schedule at a boundary.

No duplication.

## 6. Permissions

Existing model, no new keys. `operations.template.manage` gates **all**
configuration (0100 named it for exactly this: "Create and edit operational
templates, checklist items, and schedules"). Owner/admin/manager hold it;
employee holds only `task.read` + `task.execute` → cannot configure (test B).
Tenant-wide template → `core.has_permission_in_tenant`; location-scoped →
`core.has_permission(..., location_id)` — same split as 0100's RLS.

## 7. Tenant / location security

`p_tenant_id` is an explicit argument (established pattern — `core.has_permission`
verifies the caller actually holds the permission in that tenant, so it is not
"trusted"). Cross-tenant `p_template_id` / `p_item_id` resolve to `not_found`
(tenant+id-keyed lookups + composite FKs). A location-scoped Manager cannot
create templates/schedules at another location, nor add items to another
location's template (`operations.can_manage_template`). Tests C, D.

## 8. Module gating

Every RPC calls `core.has_module_access(p_tenant_id, 'operations')` first →
module OFF raises `operations_module_disabled` (test E); a tenant with no
`core.tenant_modules` row fails closed (test F). The RLS write policies also
carry the module gate as defence-in-depth.

## 9. `response_type` decision (mandatory invariant)

**"Operationalized"** = a response has been recorded against the item
(`operations.item_responses`), **OR** its template is bound to ≥1
`operations.task_schedules` row (any version). `operations.item_is_operationalized(tenant, item)`.

Once operationalized, `response_type` **and `is_critical`** are **immutable** —
enforced by `operations.checklist_items_definition_guard()` (BEFORE UPDATE,
every role). `api.operations_update_template_item` has no `response_type`
parameter at all. To change a type: `api.operations_replace_template_item` —
retire the old item (its `item_responses` keep `item_id` + value), create a
fresh one on the same template. **No item-definition versioning table.**
Before operationalization both fields are still freely editable (matches the
scope's preferred minimal model). Tests G, H.

## 10. Schedule raw-insert F2 — FIXED

**CONFIRMED** against merged `dev` before the change (reproduction script):
an authenticated L1 Manager could raw-`INSERT` a backdated non-overlapping
`task_schedules` version (1 fabricated overdue row 15 days ago) **and**
raw-`UPDATE` a not-yet-started future version's `effective_from` into the
past (1 fabricated overdue row 5 days ago).

**Fixed:** `operations_schedules_write` (`for all`) split into explicit
policies. `operations_schedules_insert` `WITH CHECK` now requires
`effective_from >= current_date AND effective_to IS NULL AND is_active` — a
raw INSERT can never create a backdated or pre-closed version. The history
guard gains: a not-yet-started version's `effective_from` may never move to
`<= current_date` (`operations_schedule_future_version_cannot_be_backdated`).
The sanctioned RPCs (`revise` inserts `effective_from = boundary >=
current_date+1`; `create_schedule` rejects a past date) are unaffected.
Tests I, J.

## 11. `effective_to` historical decision (mandatory invariant)

**CONFIRMED asymmetry** (PR #464 review P3): an already-**elapsed**
`task_schedules.effective_to` could be pushed forward (`0` → `1` fabricated
overdue row for a gap date). The `checklist_templates.retired_on` guard was
fixed for this in 0104; the schedule guard was not.

**Fixed:** the schedule history guard now freezes an elapsed `effective_to`
entirely — `if old.effective_to is not null and old.effective_to <
current_date` → **any** change rejected
(`operations_schedule_retirement_elapsed_frozen`, mirrors 0104). A
**not-yet-elapsed** `effective_to` may still be cleared (un-retire) — that
only affects today/future expectations and is what
`api.operations_cancel_scheduled_revision` relies on; once elapsed it cannot.
The sanctioned RPCs never move an elapsed `effective_to`. Tests K, N.

## 12. Template state coherence (mandatory invariant)

`api.operations_retire_template` is the **only** sanctioned path and sets
`is_active` + `retired_on` **atomically**. No RPC offers a bare `is_active`
toggle. The 0104 `CHECK (is_active or retired_on is not null)` + guard make an
independent raw toggle into `is_active=false, retired_on=null` impossible, and
a retroactive/elapsed rewrite impossible. An incoherent
`is_active=true` + elapsed `retired_on` is still *reachable* by a privileged
raw write but the projection ignores `is_active`, so behaviour stays correct
— cosmetic, owned by any future edit UI.

## 13. Future-version cancellation (scope §9)

`api.operations_cancel_scheduled_revision(tenant, schedule)`:
1. verify the target version is genuinely not yet effective
   (`effective_from > current_date`);
2. find the predecessor a revision closed (`effective_to = target.effective_from - 1`
   in the same `schedule_group_id`), if any;
3. physically `DELETE` the target — gated by the new narrow
   `operations_schedules_delete` RLS policy (`effective_from > current_date`
   AND **no `task_instances`**); safe because a `task_instance` can only ever
   materialise for the current business date, never a future one;
4. re-open the predecessor (`effective_to = null, is_active = true`) — allowed
   because its boundary (`= target.effective_from - 1 >= current_date`) has
   not elapsed.

Non-destructive to elapsed history; fabricates nothing; no workflow engine.
Test N. Cannot cancel an already-effective version.

## 14. Item mutation classification

| Field | Class | Enforcement |
|---|---|---|
| `label` | **SAFE TO MUTATE** | `update_template_item` / `replace_template_item`. Recorded value + `item_id` are the durable facts; exact historical wording deferred (design §D). |
| `is_active` | **SAFE TO MUTATE** (retire pattern) | `retire_template_item`. Obligation is template/schedule-level; past `item_responses` keep `item_id` + value. |
| `is_required` | **SAFE TO MUTATE** | `update_template_item`. Only affects the completion gate of a not-yet-completed instance. |
| `is_critical` | **MUST FREEZE AFTER OPERATIONALIZATION** | `checklist_items_definition_guard` — a raw or RPC change is rejected once operational. Before that, editable. |
| `response_type` | **REQUIRES REPLACEMENT** once operational | not a parameter anywhere; guard rejects a raw change; `replace_template_item` is the path. |
| `numeric_min` / `numeric_max` | **SAFE TO MUTATE** | `update_template_item`. A threshold *violation* is a persisted `task_exceptions` row written at record time (0101) — a later range change never rewrites it (0048 §20). Managers legitimately retune thresholds. |

**`is_overdue_critical` (PR #464 review P3):** `api.operations_expected_tasks`
still computes it live from `checklist_items.is_active AND is_critical`. This
is an **intentional live Manager-attention signal**, not frozen history — the
durable record of a critical failure is a `task_exceptions` row, not this
derived flag, and a past overdue-critical occurrence is not operationally
actionable retroactively. Freezing `is_critical` after operationalization
(above) removes the *silent-reclassification* path; retiring the whole item
is a deliberate act with its own semantics. **Documented as intentional; not
"fixed" because there is nothing broken — no obligation and no exception row
is rewritten.**

## 15. Tests

`supabase/tests/0051_operations_configuration_api.sql` — 45 assertions,
covering mission A–O: authorized create/update/retire (A); Staff denied (B);
cross-tenant (C); cross-location (D); module OFF (E); missing module row (F);
`response_type` / `is_critical` frozen after operationalization + `update`
has no such param (G); replacement path + old-item history (H); F2 raw
backdated INSERT + future-version backdate blocked (I); sanctioned forward
create + revise (J); elapsed `effective_to` cannot fabricate history (K);
template retirement via API preserves past overdue (L) and stops the future
(M); future-version cancellation reopens predecessor + already-effective
rejected (N); 0046–0050 unaffected (O — verified by the full suite).

## 16. Verification (VERIFIED, local, this session)

- `pnpm exec supabase db reset` — `0099`–`0105` apply clean.
- `pnpm exec supabase test db supabase/tests/` — `0046`–`0051` pass; full
  suite = **exactly the 11 known pre-existing failures** (`0002`×3, `0006`×1,
  `0008`×1, `0012`×2, `0023`×4), **zero new**. ADR 0008 (`0005`/`0006`/`0009`/
  `0012` "no SECURITY DEFINER in api") intact.
- `pnpm exec turbo run typecheck lint build test` — **30/30** (no app code
  changed).
- F2 / F2b / `effective_to` asymmetry all reproduced against merged `dev`
  before the fix, all closed after (scratch scripts).

## 17. Known / deferred (NOT authorized here)

- Editing a not-yet-effective future schedule version's recurrence in place —
  `revise` targets the current version only; the path is cancel + recreate.
  Acceptable for MVP.
- The cosmetic `is_active=true` + elapsed `retired_on` incoherence (§12) —
  a future template-edit UI concern.
- Manager/Staff Operations UI, Cafe HACCP presets, Manager Attention
  integration, LINE/email notifications — later bounded slices, each on its
  own Founder prompt.
- Cloud/remote apply of `0099`–`0105` — separate explicit Founder-approved
  mission with the full evidence package.

## 18. Independent review

Fresh-context reviewer must challenge: tenant isolation; module-OFF
enforcement; permission boundaries; raw-DML bypass (INSERT/UPDATE/DELETE on
all three tables); `response_type` historical integrity + the
"operationalized" definition; schedule history fabrication (forward and
backward); template state coherence; future-version cancellation safety
(especially the physical DELETE + predecessor re-open); over-engineering.
Resolve P0/P1/P2 before the PR is presented as ready; fix trivial/safe P3 or
route explicitly.

## 19. Boundaries honoured

No edit to `0099`–`0104`. `0105` additive; no historical row deleted by the
migration. No UI, no presets, no Attention, no notifications, no Event Bus,
no workflow engine, no form builder, no item-versioning table. RED path —
no autonomous `dev` merge. No `supabase db push`, no Cloud `tenant_modules`
change, no Preview, no production. `main` untouched.
