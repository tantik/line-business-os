# Cafe v2.2 — WP1 Operations — Final Bounded Acceptance (2026-09-08, closed 2026-09-10)

Status: **WP1 OPERATIONS — ACCEPTED WITH EXPLICIT MVP LIMITATIONS, READY TO
CLOSE.** The one substantive gap (G1) has been fixed (migration `0116`,
Founder-approved, applied to Cloud DEV) and independently re-verified; the
two disclosed limitations are Founder-accepted MVP deferrals. Production
untouched throughout.

> **2026-09-10 update — the original verdict below (§1–§18, "NOT READY TO
> CLOSE") is SUPERSEDED by §19.** §1–§18 are retained verbatim as the
> historical acceptance record that surfaced G1. §19 records the G1 fix,
> the Cloud DEV apply of `0116`, the Founder-approved MVP limitations, the
> A–J acceptance evidence, the independent re-review, and the closure.

This is the acceptance record for the mission "WP1 Operations — Final
Bounded Acceptance".

---

## 1. Executive summary

Cafe v2.2 WP1 Operations builds a **reusable, generic operational-execution
layer** ("what must be done at this location today, was it done, what was
the result, does a Manager need to act") plus **Cafe HACCP presets** as
pure product data on top of it.

- **Backend (migrations 0099–0115):** implemented, additive, multi-round
  independently reviewed. Module ON/OFF is **backend-enforced** (RLS =
  `core.has_module_access` AND permission AND tenant/location rule, in every
  policy and every RPC). Tenant + location isolation verified. Manager/Staff
  RBAC correct (employee role gets read+execute only). Operational history
  is structurally non-destructible.
- **Manager + Staff UI (7 PRs, merged to `dev`):** Templates/Items config,
  Scheduling, Staff task execution, Manager Today overview, Manager
  Attention feed — all as a dashboard popup matching every other Cafe
  module, bilingual JA/EN.
- **Cafe HACCP presets (PR #511/#512):** 4 templates / 12 items / 4 daily
  schedules, applied to the `oruwa-cafe` reference tenant on Cloud DEV.
  All numeric temperature items ship with **NULL thresholds** (Manager
  configures the acceptable range for their business) — no ORUWA-invented
  number, no compliance/certification claim.
- **Automated regression (this session):** `pnpm turbo run typecheck lint
  test build` → **31/31 PASS**.
- **Live Browser QA (this session, `preview.oruwa.jp`):** independently
  re-verified Cloud DEV state and ran FLOW A (normal completion, cross-role,
  reload-persisted) and FLOW D (NULL-threshold measurement, no false
  exception, reload-persisted) end-to-end. FLOW B (threshold violation) and
  FLOW C (staff-reported problem) were fully live-verified on 2026-09-05 and
  are relied on from that record (not re-run today to avoid mutating the
  reference configuration).
- **Independent fresh-context review (this session):** core requirements
  PASS; verdict **"REQUIRED FIXES / ACCEPTANCE GAPS"** for one narrow item
  (G1 below).

**One blocker for a Founder decision (G1):** the exception sources
`critical_missed` and `verification_required` are declared in the schema
but **never written by any code path**. Consequence: a critical check that
is simply never performed (window closes with no response) produces **no
`action_required` item in the Manager Attention feed** and is **not
visually escalated** in the Manager "Today" view — it appears only as a
generic "overdue" task, indistinguishable from a missed non-critical task.
This touches D4 ("a critical check missed" → `action_required`), which is a
Founder decision, so it is handed back rather than waived or built.

---

## 2. What problem WP1 solves for Cafe

A cafe running HACCP-style recordkeeping needs to know, every day, at each
location: which hygiene / cleaning / temperature checks are due, whether
staff actually did them, what the recorded values were, and whether
anything needs the manager to act (a temperature out of range, a problem
staff flagged). WP1 provides exactly that loop — reusable for future
verticals, with Cafe's specific checklist content layered on as
configuration, not code.

---

## 3. Requirement matrix

Legend: PASS / PARTIAL / FAIL / ACCEPTED-MVP-LIMITATION (AML) / OUT-OF-SCOPE
(OOS) / NOT-TESTED.

| Requirement | Status | Evidence | Notes / gaps |
|---|---|---|---|
| **D1** WP1 authorized as next work package | PASS | `docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` | — |
| **D2** Photo/evidence not in MVP, architecture not blocked | PASS | `response_type` enum `(boolean,numeric,text)`; adding `photo` = additive `ALTER TYPE` + child table | No Storage/media built for Operations |
| **D3** Operations generic; HACCP = presets; no `haccp` module/capability | PASS | `0100`/`0101` contain zero HACCP/hygiene/temperature references (grep-confirmed; only boundary comments); `cafe-haccp-presets.ts` is pure data; `0111` registers only `operations`; no `module_capabilities`/`has_capability` anywhere | Independently re-verified |
| **D4** overdue→warning; critical condition→action_required | **PARTIAL** | threshold: `0101` `record_response` `is_critical ? 'action_required' : 'warning'`; `report_problem` default `action_required`; `is_overdue_critical` flag in `operations_expected_tasks` | **G1:** `critical_missed` / `verification_required` never written; missed critical check → no persistent `action_required`, no Attention item, no visual escalation in Today. D4 defers "exact derivation" to implementation, so this is a Founder call, not an automatic fail. |
| **D5** Reusable from day one, no Cafe hardcoding in generic domain | PASS | Same as D3 | — |
| **§3** WP1 purpose = operational execution layer (not PM / issue tracker / form builder) | PASS | Minimal typed model; closed vocabularies | — |
| **§4** Manager: create templates/checks, schedule, apply to location, see today, see completion, see actionable exceptions, verify | PASS (verify: see G1) | `template-form.tsx` / `item-form.tsx` / `schedule-form.tsx`; `today-tasks-section.tsx`; `attention-section.tsx`; live-verified | "Perform verification where required" = resolve exception; no dedicated "awaiting Manager verification" element (G1, same root cause) |
| **§4** Config UI separate from main Manager dashboard | PASS | Operations opens as its own popup (`_ui/operations-manager-popup.tsx`), like Recipes/Inventory/Purchases | — |
| **§5** Staff: see tasks, open checklist, record boolean/numeric/text, save numeric as numeric, note/report a problem, complete, see result | PASS | `staff-operations-client.tsx` / `task-detail-modal.tsx`; live-verified FLOW A + FLOW D | — |
| **§5** Staff sees only their own location | PASS | `page.tsx` resolves the staff profile's active location; `operations_expected_tasks` RLS-scoped by `task_schedules`; client filters by `locationId` | — |
| **§5** Staff does not get Manager-only controls | PASS | Staff popup has no scheduling / template management / exception resolution; RBAC enforced server-side (`operations.template.manage` / `exception.resolve` not granted to employee role) | — |
| **§6** boolean / numeric / text; numeric stored structurally; definable threshold/range | PASS | `item_responses.response_numeric numeric` + `exactly_one_chk`; `checklist_items.numeric_min/max/unit` + `numeric_range_chk` / `numeric_only_chk`; threshold exception only when a bound is NOT NULL | — |
| **§7** HACCP presets at opening/closing/cleaning/temperature level | PASS | `cafe-haccp-presets.ts`: 4 templates, 12 items, JA/EN; applied to Cloud DEV `oruwa-cafe` | — |
| **§7** corrective-action record | PASS | `report_problem` → `resolve_exception` with `resolution_note` = the corrective-action record | — |
| **§7** recheck | **AML** | Disclosed in `cafe-haccp-presets.ts` as a real product gap: no ad-hoc same-day recheck task after a violation; next verification is the next scheduled occurrence | Desirable workflow / post-MVP. §4/§5/§6/§15 do not require it; §11 leaves instance generation undecided. Needs explicit Founder acknowledgment. See §11 of this report. |
| **§7** no HACCP compliance/certification claim | PASS | `cafe-haccp-presets.ts` header §2; no such copy in UI | — |
| **§8** Operations vs Recipes/Workforce/Inventory/Attention boundaries | PASS | No Recipes storage of tasks; zero Workforce dependency (all actor columns → `core.users`); separate from Inventory/Purchases; Attention receives only open exceptions, never normal completions | — |
| **§9** Full module with backend-enforced ON/OFF; OFF hides UI + blocks backend + keeps data; ON restores | PASS | `core.has_module_access(tenant_id,'operations')` first in every RLS policy (`0100`/`0101`/`0105`) and every RPC (early `operations_module_disabled` raise); `api.*` are `security_invoker`; no hard delete on OFF (all history FKs `ON DELETE RESTRICT`) | pgTAP `0046`/`0047`/`0055` + Cloud DEV module-ON smoke (2026-09-03) PASS. Not re-toggled live this session (deliberately — reference tenant). |
| **§9** frontend-only gating not permitted | PASS | `page.tsx` gate is additive to the RLS/RPC gate | — |
| **§10** No capability infrastructure built for HACCP | PASS | None added | — |
| **§11** Simple recurrence (daily / weekdays / time-window) | PASS | `task_schedules` typed columns; `recurrence_kind` enum `(daily, weekdays)`; no RRULE/cron/DSL | — |
| **§11** Task expected in its period regardless of whether Staff opened the app | PASS | `api.operations_expected_tasks` = pure `task_schedules × calendar` projection `UNION` materialised instances; no stored row required; live-verified (5 templates projected with no instances) | overdue is derived (`now() > window_close_at`), not persisted — matches §11 exactly |
| **§12** Task state vs exception = different concepts; minimal lifecycle | PASS | `task_instances.status` (in_progress→completed) distinct from `task_exceptions.status` (open→resolved); open exceptions do not block completion | — |
| **§13** Retain operational history (what/when/who/values/exceptions) | PASS | All history FKs `ON DELETE RESTRICT`; schedule versioning (`0102`), template `retired_on` (`0104`), `response_type`/`is_critical` freeze once operationalized (`0105`); only whole-tenant offboarding cascades | Multiple review rounds hardened this |
| **§14** Ships as small PRs, foundation-first | PASS | `0100` foundation; then engine, integrity fixes, config API, UI slices | — |
| **§15** Explicit out-of-scope items | PASS | No photo / IoT / LINE / email / event bus / workflow engine / form builder / SLA engine / signatures / gov integrations / accounting / POS / payroll | — |
| **§16** Technical non-decisions not silently promoted | PASS | Model chosen by implementation + review, not by the Recovery Report | — |

---

## 4. Manager acceptance

| Area | Result | Evidence |
|---|---|---|
| Templates: list / create / edit / retire | PASS | live 2026-09-05 + code (`template-form.tsx`, `retireTemplate`); template list + active/retired filter re-verified live 2026-09-08 |
| Items: add / edit / retire / replace; boolean / numeric / text; required / critical; numeric min/max/unit | PASS | `item-form.tsx`; `operations_replace_template_item` is the sanctioned response-type-change path; live 2026-09-05 |
| Scheduling: apply template to location; daily / weekday; due time/window; revise / deactivate / cancel; persistence; duplicate-confirm | PASS | `schedule-form.tsx`; `0102`/`0105` RPCs; duplicate-schedule `ConfirmDialog` (`template-detail-modal.tsx`); live 2026-09-05; schedule display re-verified live 2026-09-08 (温度管理チェック: 毎日 13:00–14:00 from 2026-09-08) |
| Today / Operations overview: current state, task visibility, overdue state | PASS | `today-tasks-section.tsx`; live 2026-09-08 (all 5 templates projected with 期限超過 / 未着手 / 完了) |
| Attention feed: threshold exception, staff-reported problem, resolve, persistence | PASS | `attention-section.tsx`; live FLOW B/C 2026-09-05 (exception → 要対応 → resolve → gone after reload); feed clean and correct 2026-09-08 |
| **Overdue *critical* check surfaced as action_required** | **PARTIAL — G1** | `is_overdue_critical` computed but not rendered distinctly in Today; never becomes an Attention row |
| Cafe presets: 4 templates / 12 items / 4 schedules / JA-EN / NULL temp thresholds / "しきい値未設定" / Manager can configure/change/remove threshold | PASS | live 2026-09-08: 4 templates present, correct bilingual items, all numeric items "しきい値未設定" + 重要, correct required/optional, correct daily schedules; `item-form.tsx` exposes editable min/max/unit for numeric items |

---

## 5. Staff acceptance

| Area | Result | Evidence |
|---|---|---|
| Operations reachable from Staff dashboard | PASS | live 2026-09-08 (オペレーション popup) |
| Only own location's tasks | PASS | `page.tsx` + RLS + client filter; live (staff = 田中 美咲 at Main Store, saw only that location) |
| Today's tasks, sorted actionable-first | PASS | `staff-operations-client.tsx`; live |
| boolean / numeric / text response; required validation; critical semantics | PASS | `task-detail-modal.tsx` (`errResponseRequiresExactlyOneValue` on empty numeric/text); live FLOW A |
| Report a problem (item / whole task) | PASS | `ReportProblemForm`; live FLOW C 2026-09-05 |
| Task completion; completed task read-only; persistence after reload | PASS | live 2026-09-08 FLOW A (完了 → "このタスクは完了済みのため変更できません。" → persisted after reload) |
| NULL threshold behavior: can enter measurement, persists, no false exception, no implied "normal" | PASS | live 2026-09-08 FLOW D (entered 4°C on NULL-threshold fridge item → saved → reload shows "4" → no exception; item shows "管理者による基準値の設定が必要です", not worded as staff fault) |
| Configured-threshold behavior (out-of-range → exception) | PASS | live FLOW B 2026-09-05 (12°C outside test 0–5°C range → task 進行中, 1 open exception) |
| JA / EN | PASS | live both roles 2026-09-05; JA strings confirmed 2026-09-08 |
| Staff does not get Manager-only controls | PASS | popup has no scheduling / templates / resolve; RBAC server-side |

---

## 6. Cross-role end-to-end workflows

| Flow | Result | Evidence |
|---|---|---|
| **A — normal completion** | PASS (live 2026-09-08) | Manager config → task expected → Staff records all required items → Staff completes → Manager "Today" shows 完了 → reload-persisted on both sides |
| **B — threshold violation** | PASS (live 2026-09-05, documented `current-task.md` §5) | Manager sets test 0–5°C → Staff enters 12°C → response persists → threshold exception opens → critical item ⇒ `action_required` (D4) → Manager Attention (要対応) → Manager resolves with note → resolution persists after reload → test threshold reverted to NULL |
| **C — staff-reported problem** | PASS (live 2026-09-05) | Staff reports problem → Manager Attention shows it → Manager resolves → state persists |
| **D — NULL threshold** | PASS (live 2026-09-08) | numeric item, NULL min/max → Staff enters measurement → persists → no false exception → system does not imply "normal" (shows "threshold requires manager configuration") |

---

## 7. Generic Operations / D3 verification

- **No Cafe/HACCP hardcode in the generic schema.** `grep -i` over
  `supabase/migrations/01*.sql` for `haccp|hygiene|hot-holding|fridge|
  freezer` returns only boundary-declaring comments in `0100`/`0102`/`0104`/
  `0111`. `category` on `checklist_templates` is free `text`, never an enum,
  never a code branch.
- **No Cafe/HACCP hardcode in the Operations app code.** `grep -i` over
  `apps/web/src` for `haccp|hygiene|fridge|freezer|温度管理|衛生` hits only
  `apps/web/src/lib/demo/cafe/data.ts` — the unauthenticated public
  marketing demo, unrelated to the real module.
- **HACCP is presets/data only** — `packages/db/scripts/cafe-haccp-presets.ts`
  is a pure manifest + pure plan builder; the executor writes through the
  same sanctioned `api.operations_*` RPCs a human Manager would use.
- **No separate haccp module / capability.** `0111` registers only
  `operations`. No `core.module_capabilities`, no `has_capability()`.
- **D3 = PASS**, independently confirmed.

---

## 8. D4 verification

- **Threshold violation:** `api.operations_record_response` sets severity
  `action_required` iff the item `is_critical`, else `warning`. Correct.
  Live-verified (FLOW B, 2026-09-05).
- **Reported problem:** `api.operations_report_problem` defaults to
  `action_required`; Staff may downgrade to `warning`. Reasonable.
- **Normal overdue task:** derived `state='overdue'` in
  `operations_expected_tasks`, shown with a `warning`-tone badge. Correct.
- **Missed *critical* check:** `is_overdue_critical` is computed in the
  projection but (a) is not rendered distinctly by `today-tasks-section.tsx`
  and (b) never produces a `task_exceptions` row → never appears in the
  Attention feed. The reserved sources `critical_missed` and
  `verification_required` are declared in the CHECK constraint and the RLS
  INSERT policy but **no migration or RPC ever inserts them**.
- **Net:** D4's "a critical check missed → action_required" is **not
  realized as a durable, Manager-visible actionable item**. D4 explicitly
  leaves "the exact technical derivation of critical" to the implementation
  WP, so this is not an automatic FAIL — it is **G1, a Founder decision**.

---

## 9. Module / access / isolation

- **Backend-enforced ON/OFF:** every RLS policy on the 6 `operations`
  tables begins with `core.has_module_access(tenant_id,'operations')`;
  every write RPC raises `operations_module_disabled` early; `api.*` views
  are `security_invoker` and inherit the base-table RLS. `operations` is
  not in the PostgREST exposed schemas.
- **Tenant isolation:** composite `(tenant_id, id)` FKs on every table;
  `tenant_id` in every predicate comes from the row, never a session GUC or
  client value.
- **Location isolation:** physical tables gate on
  `core.has_permission(tenant_id, key, location_id)`; `item_responses` and
  `task_exceptions` carry a denormalised `location_id` with a BEFORE
  trigger asserting it equals the parent instance's location (blocks
  within-tenant cross-location tampering).
- **Role boundary:** `0100` role seed + `0008` — employee role gets only
  `operations.task.read` + `operations.task.execute`; `template.manage` and
  `exception.resolve` are owner/admin/manager only.
- **Evidence:** pgTAP `0046`/`0047`/`0055` (module ON/OFF, cross-tenant,
  cross-location, role boundary, anon denial) + the Founder-run Cloud DEV
  module-ON smoke 2026-09-03 (all scenarios PASS, transaction rolled back).
  **Not re-toggled live this session** — deliberately, per mission §8, to
  avoid disturbing the reference tenant's acceptance configuration.
- **Minor (non-blocking):** `operations.location_timezone` (SECURITY
  DEFINER) lets an authenticated user probe whether an arbitrary
  tenant/location pair exists (returns a timezone or NULL). Metadata leak,
  not a data leak. Recorded, not a blocker.

---

## 10. HACCP presets acceptance

Independently re-verified against current Cloud DEV state (`oruwa-cafe`,
2026-09-08, live):

- **Canonical manifest:** 4 templates (`オープニング衛生チェック` /
  `クロージング衛生チェック` / `日次清掃チェック` /
  `温度管理チェック`), 12 items, 4 daily schedules — matches
  `cafe-haccp-presets.ts` exactly (categories, due/window times, JA/EN
  labels, critical/required flags, hot-holding item optional).
- **Installed state:** all 4 present and active, location-scoped to the
  single `oruwa-cafe` location; the pre-existing QA-residue "Opening
  checklist" template is untouched alongside them.
- **No invented temperature thresholds:** all 5 numeric items show
  "しきい値未設定" for the Manager and "管理者による基準値の設定が
  必要です" for Staff; `numeric_min` / `numeric_max` both NULL,
  `numeric_unit` = `°C`.
- **Idempotency:** proven at the plan-builder unit-test level
  (`cafe-haccp-presets.test.ts`, in the green `@line-os/db` suite) and by a
  live post-apply dry-run on 2026-09-08 (0/0/0 to create) recorded in
  `current-task.md` §5.
- **Generic Operations contains no HACCP hardcode** — see §7.
- **Presets are product content/config**, installed through the sanctioned
  RPC boundary.
- **No new legal/compliance claims made.**

---

## 11. Recheck decision

**Exact requirement (scope §7):** lists "recheck" as one of the
preset-level use cases Cafe should receive, alongside "corrective-action
record" and "operational history". §7 is a boundary/scope statement, not a
lifecycle spec. §4, §5, §6, §12 and §15 do **not** require an ad-hoc
same-day recheck *task*; §11 explicitly leaves the mechanism for creating
task instances undecided.

**Current capability:** threshold violation / staff problem → `task_exception`
(open) → Manager resolves with a resolution note (the corrective-action
record) → resolution persists. The **next** verification of that check is
its next regularly scheduled occurrence (e.g. the next day, or a later
same-day scheduled check in another template). There is no way to spawn an
unscheduled "recheck this now" task instance the same business day.

**Product recommendation: B — ACCEPTED MVP LIMITATION, defer.**
Rationale, strictly on scope + actual product behavior:

- No approved WP1 requirement mandates an ad-hoc recheck task. §7 names
  "recheck" as a use-case area, not a required lifecycle primitive.
- The corrective-action loop (report → resolve + note) is present and
  covers the recordkeeping obligation.
- Adding same-day ad-hoc task instances is a genuine new capability
  (instance generation outside a schedule) — it belongs to a future
  Operations capability decision, not a WP1 bug fix.
- The gap is already disclosed in code (`cafe-haccp-presets.ts` §3).

**Do not implement.** Requires explicit Founder acknowledgment as a
deferred limitation.

---

## 12. Multi-location threshold decision

**Current model:** a numeric threshold lives on `checklist_items`, which
belongs to exactly one `checklist_template`. A template is either
tenant-wide (`location_id IS NULL`, identical everywhere) or scoped to
exactly one location. Different thresholds per location today require
separate location-scoped template copies. True per-location overrides on a
shared template do not exist.

**Assessment: does not block approved WP1.** The approved scope (§4, §6,
§11) requires "apply templates to a location" and "define an acceptable
threshold/range" — both satisfied. It does **not** require per-location
overrides on a shared template. For the single-location `oruwa-cafe`
reference tenant the distinction has zero practical effect; it first
matters when a second location is provisioned under one tenant.

**Classification: ACCEPTED MVP LIMITATION / future capability.** A
location-override table/RPC/RLS/UI is a separate architecture decision,
explicitly **not** authorized and **not** built here.

---

## 13. Automated regression (this session)

| Check | Result |
|---|---|
| `pnpm turbo run typecheck lint test build` (whole monorepo) | **31/31 tasks PASS** (~67s) |
| — includes `@line-os/web` unit tests (`operations-i18n.test.ts`) | PASS |
| — includes `@line-os/db` unit tests (`cafe-haccp-presets.test.ts`, idempotency) | PASS |
| pgTAP `supabase test db` (0046–0055 Operations) | **NOT re-run this session** (needs local Supabase stack). Documented baseline at each merge: 0046–0055 green; "11 known pre-existing failures, zero new". Relied on from that record. |
| Web `apps/web` operations-i18n test | PASS (in turbo) |

No unrelated pre-existing debt was touched.

---

## 14. Browser QA (this session)

Real Preview environment (`preview.oruwa.jp`), real logins via the
Founder-classified PUBLIC DEMO / QA accounts, chrome-devtools MCP,
isolated browser contexts for Manager and Staff.

- **Manager:** Operations popup; 4 HACCP templates + items + NULL
  thresholds + schedules verified against the manifest; "Today" tab (5
  templates projected, derived states); "Attention" tab (clean).
- **Staff (田中 美咲):** Operations popup; own location only; task detail
  with correct threshold-not-configured copy.
- **FLOW A (live, fresh):** Staff answered all 3 required items of
  `オープニング衛生チェック` → completed → task read-only → **reload:
  still 完了** → **Manager "Today": 完了** (cross-role). No false
  exception.
- **FLOW D (live, fresh):** Staff entered 4 °C on the NULL-threshold
  fridge item → saved → **reload: value "4" persisted**, no exception,
  Manager Attention still clean.
- **FLOW B / FLOW C:** relied on the 2026-09-05 live PASS record (not
  re-run today to avoid introducing a test threshold / mutating reference
  config).
- **Module OFF:** not re-toggled live (mission §8); covered by pgTAP +
  the 2026-09-03 Cloud DEV smoke.

**QA residue created this session (acceptable per mission, not cleaned
up):** `oruwa-cafe` now has one completed `task_instance` for
`オープニング衛生チェック` dated 2026-09-08 with 3 responses (fridge = 4
°C), completed by 田中 美咲, plus the in-progress `温度管理チェック`
instance already there. Non-destructive. **No HACCP configuration was
changed** — no test threshold was introduced at all this session.

---

## 15. Independent reviewer verdict

Fresh-context code/schema review (read the scope doc and all Operations
migrations + web layer independently, did not trust this report's
conclusions).

- **Core requirements PASS:** D3/D5 generic model, backend-enforced ON/OFF,
  tenant + location isolation, Manager/Staff RBAC, expected-task semantics
  (§11), non-destructible history (§13), structural numeric responses (§6).
  "Implementation is strong and has been reviewed multiple times."
- **Overall verdict: "REQUIRED FIXES / ACCEPTANCE GAPS"** — driven by one
  substantive item:
  - **G1:** `critical_missed` / `verification_required` are never
    materialized by any code path → "critical check missed →
    action_required in Attention" and "awaiting Manager verification" do
    not produce a durable actionable element (only a transient derived
    flag). Consistent with the letter of the scope (§11 derived-overdue,
    D4 defers derivation, Attention UI is a later slice) but means the
    signal does not reach the Manager's feed. **Needs a Founder yes/no.**
- **Disclosed and acceptable-for-MVP (need acknowledgment, no fix):** ad-hoc
  same-day recheck (§7), per-location thresholds on a shared template.
- **Minor:** `operations.location_timezone` metadata probe (non-blocking).

---

## 16. Remaining known limitations / debt

| Item | Class | Disposition |
|---|---|---|
| **G1** — missed critical check produces no durable `action_required` / Attention item; `is_overdue_critical` not rendered distinctly in "Today" | P2, D4-related | **Founder decision required** — accept as WP1 MVP limitation, or a small slice (render `is_overdue_critical` in Today; optionally write a `critical_missed` exception when the window closes) |
| Ad-hoc same-day recheck task | AML (§7) | Defer; needs Founder acknowledgment |
| Per-location threshold overrides on a shared template | AML (§12) | Defer; needs Founder acknowledgment; not authorized to build |
| `operations.location_timezone` lets an authed user probe tenant/location existence | Minor | Metadata-only; record, fix opportunistically |
| Operations "Attention" not unified with the Workforce `attention-panel.tsx` | Future idea | Deliberately out of scope; needs design |
| Staff-facing history / past-days view | Future | Today-only by design so far |
| pgTAP `0046`–`0055` not re-run this session | Evidence gap | Relied on merge-time record; a future session with a local stack can re-confirm |
| QA residue on `oruwa-cafe` (completed/in-progress task instances dated 2026-09-05 / 2026-09-08) | Harmless | Leave, or delete via UI before a demo |

---

## 17. Production impact

**NONE.** Every operation this mission performed was read-only, an
automated local test, or a Preview/Cloud-DEV browser action structurally
pinned to the Cloud DEV project ref and the `oruwa-cafe` tenant. No
migration, no schema/RLS/auth change, no `main` merge, no production
deploy, no billing, no real customer data. `dev` HEAD unchanged (`4d38029`).

---

## 18. Final recommendation

**WP1 OPERATIONS — NOT READY TO CLOSE.**

The core WP1 capability is implemented, independently reviewed, and
live-verified. It is **close** — one narrow, D4-related gap (G1) and two
already-disclosed limitations stand between it and a clean acceptance, and
all three are Founder decisions, not engineering unknowns.

**Minimal next mission (one of):**

1. **Founder decision only (fastest):** the Founder rules that G1, the
   ad-hoc recheck gap, and the per-location threshold limitation are all
   ACCEPTED MVP LIMITATIONS for WP1. A doc-only PR then records WP1 as
   closed with those three explicit limitations, and the verdict becomes
   "WP1 OPERATIONS — ACCEPTED WITH EXPLICIT MVP LIMITATIONS, READY TO
   CLOSE". No code.

2. **Founder approves a bounded G1 fix:** a single small slice that (a)
   renders `is_overdue_critical` distinctly in the Manager "Today" view and
   (b) writes a `critical_missed` `action_required` exception when a
   critical task's window closes with no completion — additive, no
   migration if the write is done in the existing projection/refresh path,
   or one additive migration if a lazy sweep is needed. Then re-run the
   FLOW-B-adjacent acceptance and close.

Recheck implementation, per-location overrides, WP2, and any production /
`main` work remain **not authorized**.

---

# §19 — G1 fix, Cloud DEV apply, and closure (2026-09-10)

**This section supersedes §18. Verdict: WP1 OPERATIONS — ACCEPTED WITH
EXPLICIT MVP LIMITATIONS, READY TO CLOSE → CLOSED.**

## 19.1 Founder decisions taken since §18

| Item | §18 status | Founder decision (recorded) |
|---|---|---|
| **G1** — missed critical check produced no durable `action_required` / Attention item, not visually escalated in "Today" | Founder decision required | **MUST FIX before WP1 close** — treated as an unfinished bounded slice of existing WP1, not a new capability. Fix built inside existing architecture; a schema change was permitted via a Founder Gate. |
| Ad-hoc same-day recheck task (§7 / §16) | Needs acknowledgment | **ACCEPTED MVP LIMITATION — DEFER.** |
| Per-location threshold overrides on a shared template (§12 / §16) | Needs acknowledgment | **ACCEPTED MVP LIMITATION — DEFER.** |
| Read-time (not worker) materialization of `critical_missed` | — | **ACCEPTED WP1 MVP IMPLEMENTATION DETAIL.** The writer is worker-ready; a scheduled sweep needs only a trusted entry point, no schema change. |

## 19.2 The G1 fix — migration `0116_operations_missed_critical.sql`

Additive migration (merged via **PR #513**, squash `536993a`; now part of
`dev`). Model: an **instance-less** `critical_missed` exception on
`operations.task_exceptions`, keyed by `(tenant_id, schedule_id,
business_date)` — a missed check by definition has no `task_instance`.

- `task_exceptions.instance_id` made nullable; `schedule_id uuid` +
  `business_date date` added; two guarded CHECK constraints
  (`…_attach_chk` — exactly one of instance-attached / schedule+date
  attached; `…_missed_shape_chk` — `critical_missed` must be schedule+date
  attached); FK `(tenant_id, schedule_id) → task_schedules … ON DELETE
  RESTRICT`.
- Partial unique index `operations_task_exceptions_missed_critical_uniq
  (tenant_id, schedule_id, business_date) WHERE source = 'critical_missed'`
  — **no status predicate**, so a resolved row still blocks re-creation
  (historical idempotency).
- `operations.flag_missed_critical(p_tenant_id, p_start, p_end)` —
  `SECURITY DEFINER`, self-authorising: only materialises rows for
  locations where the JWT-resolved caller holds
  `operations.exception.resolve`; clamps to `[current_date-31,
  current_date+62]`; flags `(schedule, business_date)` only when the
  window has closed (timezone- and cross-midnight-aware), the template
  still has an active critical item, there is no completed instance, and
  no `critical_missed` row already exists. `severity = 'action_required'`
  (D4).
- `api.operations_flag_missed_critical(...)` — `SECURITY INVOKER` wrapper
  (auth + module ON + `operations.exception.resolve` in tenant), then
  delegates. Called best-effort from the Manager Operations server-load
  (`manager/page.tsx` → `flagMissedCriticalExceptions`).
- `operations.close_missed_critical_on_completion(p_tenant_id,
  p_schedule_id, p_business_date)` — `SECURITY DEFINER`, self-authorising
  (module ON + schedule belongs to tenant + caller holds
  `operations.task.execute` at the schedule's location; every check is a
  `WHERE` predicate → non-holder / cross-tenant call is a silent no-op;
  `resolved_by = core.current_user_id()`). Resolves an OPEN
  `critical_missed` for that `(schedule, business_date)` on **LATE
  COMPLETION only** — invoked from `api.operations_complete_task`, **not**
  on a mere response. Resolution note contains "late completion".
- `api.operations_expected_tasks` v4 and `api.operations_open_exceptions`
  updated to surface instance-less exceptions (subquery matches
  `schedule_id + business_date` as well as `instance_id`; view exposes
  `schedule_id`, `business_date`).
- RLS **unchanged** — the `operations_exceptions_insert` policy already
  (0101) allowed `critical_missed` / `verification_required` with
  `operations.exception.resolve`. No `api`-schema SECURITY DEFINER (ADR
  0008 preserved). No destructive SQL.
- Web: 3 new i18n keys (`taskCriticalMissedBadge`,
  `attentionSourceCriticalMissed`, `attentionCriticalMissedHint`, JA/EN);
  `重要チェック未実施` badge rendered next to `期限超過` in Manager +
  Staff "Today"; `critical_missed` source label + hint line in the Manager
  Attention feed.

## 19.3 Cloud DEV apply of `0116` (Founder Gate — approved)

Target proven: linked project ref `pehcoenozjtsjdvjietj`
(`line-business-os-dev`, `ACTIVE_HEALTHY`, the only linked project; PROD
inactive and unlinked). Pre-apply anomaly found and resolved: the remote
ledger showed **both** `0115` and `0116` pending, but `0115`'s schema was
already on Cloud DEV (applied via Studio 2026-09-05, ledger never
repaired). Handled per a Founder Gate → variant A:

1. Read-only `supabase db dump --schema api` proved `0115`'s
   `api.operations_schedules` on Cloud DEV is byte-equivalent to the
   migration contract (view definition, `security_invoker=true`, column
   list/order, comment, `GRANT SELECT … TO authenticated`, no
   anon/public grant). Schema = "0115 applied"; only the ledger row was
   missing.
2. Founder ran `supabase migration repair --status applied 0115`
   (ledger-only; SQL not re-executed) — the RED-operation guardrail
   blocks the session from running `migration repair` / `db push`, so the
   Founder executed both.
3. Founder ran `supabase db push` → applied **exactly**
   `0116_operations_missed_critical.sql`.

**Post-apply verification (read-only `db dump`, this session):**

| Object | Cloud DEV state |
|---|---|
| Ledger | `0114 / 0115 / 0116` all Local + Remote |
| `task_exceptions.instance_id` | nullable |
| `task_exceptions.schedule_id`, `.business_date` | present |
| `…_attach_chk`, `…_missed_shape_chk` | present, correct predicates |
| `…_missed_critical_uniq` partial unique index | present, `WHERE source = 'critical_missed'`, **no status predicate** |
| `…_schedule_fkey` | present, `ON DELETE RESTRICT` |
| `operations.flag_missed_critical` | present, `SECURITY DEFINER`, self-auth body verified |
| `operations.close_missed_critical_on_completion` | present, `SECURITY DEFINER`, self-auth WHERE-predicate body verified |
| `api.operations_flag_missed_critical` | present, `SECURITY INVOKER` |
| `api.operations_complete_task` | contains `perform operations.close_missed_critical_on_completion(...)` |
| `api.operations_open_exceptions` | exposes `schedule_id`, `business_date` |
| `api`-schema SECURITY DEFINER functions | **0** (ADR 0008 preserved) |
| Existing Operations / HACCP data | intact — 4 HACCP preset templates + `Opening checklist` QA template still present, items/schedules unchanged, prior responses untouched |

## 19.4 Acceptance scenarios A–J

DB-contract evidence: pgTAP `supabase/tests/0058_operations_missed_critical.sql`
(≈47 assertions) — clean isolated `db reset; test db` run this session:
**0058 ok, 0057 ok, exactly the 11 known pre-existing failures, zero new.**
Live evidence: `preview.oruwa.jp`, real Manager (`manager@oruwa-cafe.test`)
and Staff (`田中 美咲`) logins, isolated browser contexts, 2026-09-10.

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| **A** | non-critical overdue → not `action_required`, no `critical_missed` | PASS | pgTAP 0058 (scenario A). Live: non-critical items on overdue templates carry no `重要チェック未実施` badge. |
| **B** | critical check still within its window → not flagged | PASS | Live: `温度管理チェック` (13:00 まで 14:00), state `未着手`, no badge, not in Attention. pgTAP 0058 (before-window). |
| **C** | critical completed on time → not flagged | PASS | pgTAP 0058 (scenario C — complete before any sweep, 0 rows). |
| **D** | critical missed after window → exactly one `critical_missed` / `action_required`; Manager "Today" visually distinct; Manager Attention shows it; persists after reload | PASS | Live: read-time sweep on Manager Operations load materialised `critical_missed` rows; Attention feed shows each as `要対応` + `重要チェック未実施` + hint line "重要な定期チェックが実施期限までに完了されませんでした。" + business-date; Manager & Staff "Today" show `重要チェック未実施` badge beside `期限超過`; survived 3 reloads. pgTAP 0058 (scenario D). |
| **E** | repeated evaluation → no duplicate | PASS | Live: count held at 14 across two Manager reloads (each a fresh read-time sweep). pgTAP 0058 (repeat sweep; raw duplicate INSERT rejected by the partial unique index). |
| **F** | late start / partial response → `critical_missed` stays open | PASS | Live: saved a response on a flagged task → task went `進行中` but kept the `重要チェック未実施` badge and its open exception. pgTAP 0058 (LATE-RESPONSE stays open). |
| **G** | late completion → existing `critical_missed` correctly resolved, not recreated | PASS | Live: Staff completed `Opening checklist` (fridge 4 °C, door checked) after its window → task read `完了`, badge and open-exception cleared; Manager Attention count 13 → 12; a subsequent Manager reload (fresh sweep) did **not** recreate it. pgTAP 0058 (LATE-COMPLETION → auto-resolved, `resolution_note LIKE '%late completion%'`, not recreated, gone from feed). |
| **H** | tenant / location isolation | PASS | pgTAP 0058: L1-only manager sweep flags only L1; tenant-wide sweep in tenant M leaves tenant N untouched; employee direct call = 0 rows; wrapper rejects non-holder / non-member; cross-tenant + L1-only direct `close_missed_critical_on_completion` = no-op. |
| **I** | threshold-violation regression | PASS | pgTAP 0047 / 0051 / 0058 (threshold exception still instance-attached, unaffected by 0116). Live threshold→exception→resolve verified 2026-09-05 on this tenant (current-task.md §5); not re-mutated today. |
| **J** | staff-reported-problem regression | PASS | pgTAP 0047 / 0058 (reported exception still instance-attached). Live report-problem→resolve verified 2026-09-05 on this tenant; not re-mutated today. |

**Manager resolve flow (D, completion):** resolved one past-dated
`critical_missed` via the Manager Attention UI with a note → row left the
open feed (count 14 → 13); after reload the re-sweep did **not** recreate
it (partial unique index has no status predicate). PASS.

## 19.5 #514 (Phase 0 design tokens) regression

PR #514 (`@line-os/tokens`, `dev` baseline) re-wired `lib/ui/theme.ts` and
`lib/demo/cafe/theme.ts` onto the token package. Verified **byte-identical**
palette (bg `#FAF3E7`, surface-elevated `#F6EEDF`, border `#E7D9C1`,
text-muted `#8B7C64`, text-primary `#362B1F`, accent/success `#4F7A52`,
accent-muted `rgba(79,122,82,0.12)`, danger `#C1503F`, danger-muted
`rgba(193,80,63,0.12)`, danger-text `#A6402F`, warning `#B8863B`). Only
intentional deltas: new `accentText` `#3B5C3E` (not consumed by Operations
UI) and JP-first body font (`"Noto Sans JP", system-ui`). `packages/ui`
`Button`/`Card` restyle: not consumed by the Operations surface (inline
`badgeStyle`/`card` only). Live: Operations Manager/Staff/Attention screens
render correctly — badges, modal layout, tabs, JP font, no overflow, no
layout break. `pnpm turbo run typecheck lint build test` → **34/34 tasks
PASS** (includes `@line-os/tokens`, `@line-os/web`, `packages/ui`).

## 19.6 Independent re-review (fresh context, 2026-09-10)

Fresh-context reviewer re-derived from source (scope doc, `0116`, `0101`,
`0104`, pgTAP `0058`, web layer) — did not trust this report. Scope:
G1-close semantics (A–J), SECURITY DEFINER self-authorisation and
cross-tenant safety, additive/no-RLS-weakening, ADR 0008, scope
discipline, any P0/P1 blocker.

**Verdict: PASS — WP1 may close.** No P0/P1 correctness or security
defect. Confirmed independently: (D–H) 0116 closes G1 per the required
semantics — read-time writer wired into `manager/page.tsx` before the
Attention read; instance-less row surfaced through
`api.operations_open_exceptions` and rendered distinctly in Manager +
Staff "Today"; historical unique index (no status predicate) +
`NOT EXISTS (any status)` + `ON CONFLICT DO NOTHING` block duplicates and
re-creation after resolve; `close_…on_completion` fires only from
`api.operations_complete_task`, not from a response; per-location JWT
authorisation on both SECURITY DEFINER functions with no caller-supplied
tenant/actor trust; `operations` schema is not PostgREST-exposed so there
is no direct-abuse path; ADR 0008 intact; additive only, no RLS
weakening, no destructive SQL; within "unfinished bounded slice" scope
(no worker/cron, no recheck, no per-location thresholds, no new severity,
`verification_required` still reserved). Non-blocking notes: N1
read-time-only materialisation (Founder-accepted, §19.1); N2
`generate_series` per Manager dashboard load is negligible at Cafe scale
(worker/cache candidate if it grows); N3 canonical-doc update required
(done — see §19 / the closure PR); N4 pre-existing
`operations.location_timezone` metadata probe (untouched by 0116).

## 19.7 Production impact

**NONE.** The `0116` apply was to Cloud DEV `pehcoenozjtsjdvjietj` only,
via the standard Supabase migration workflow, Founder-run under an explicit
Founder Gate. No `main`, no production deploy, no billing, no real customer
data. All this session's other operations were read-only `db dump`,
local automated tests, or Preview browser actions on the `oruwa-cafe`
reference tenant.

## 19.8 QA residue (left in place per Founder instruction — no destructive cleanup)

On `oruwa-cafe` (Cloud DEV):

- `critical_missed` exceptions materialised by the read-time sweep for the
  HACCP daily critical schedules across 2026-09-05…2026-09-10 (accumulated
  because those checks were never performed on the reference tenant). This
  is **correct system behaviour**, not corruption — G1's whole point.
- One `critical_missed` exception resolved via the Manager UI (QA note).
- One `Opening checklist` `task_instance` completed 2026-09-10 by 田中 美咲
  (fridge 4 °C) as the scenario-G late-completion test; its `critical_missed`
  exception auto-resolved with the system "late completion" note.
- No HACCP configuration changed; no threshold introduced.

## 19.9 Final verdict

**WP1 OPERATIONS — ACCEPTED WITH EXPLICIT MVP LIMITATIONS, READY TO
CLOSE.** Explicit limitations (Founder-accepted, deferred, not defects):

1. No ad-hoc same-day recheck task after a violation (§7).
2. No true per-location threshold override on a shared template — needs
   separate location-scoped template copies (§12).
3. `critical_missed` is materialised at Manager-Operations read time, not
   by a scheduled worker (writer is worker-ready).

WP1 is **CLOSED** on this basis. WP2, the Product Quality Foundation
implementation, recheck implementation, per-location overrides, and any
`main` / production work remain **not authorized**.
