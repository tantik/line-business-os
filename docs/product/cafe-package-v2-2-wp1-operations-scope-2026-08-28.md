# Cafe Package v2.2 — WP1 Operations — Canonical Product Scope (2026-08-28)

Status: **Founder-authorized product scope. Source of truth for Cafe v2.2 WP1
Operations product scope.**

This document is a **product/governance scope decision**, not an
implementation spec. It is deliberately **not**:

- a SQL / schema design,
- a migration plan,
- an RLS policy design,
- an RPC contract,
- a test plan.

Implementation planning and technical design happen in a **separate WP1-A
implementation mission**, started only on its own explicit Founder prompt
(see D1). Nothing in this document authorizes writing application code, SQL,
migrations, RLS, or tests.

## 0. Placement / naming note

Preferred name in the originating mission prompt was
`CAFE_V2_2_WP1_OPERATIONS_SCOPE_2026-08-28.md`. Placed instead at
`docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` to match
the existing `docs/product/` convention (kebab-case, `cafe-package-v2-*`
family — this document is a peer of
`docs/product/cafe-package-v2-1-product-review.md`, a product-scope
document, not an AI mission handoff which would live in `docs/ai/`).
Content and authority are unchanged by the placement.

## 1. Background and why this document exists

Cafe v2.1 is Founder-accepted and closed
(`docs/ai/CAFE_V2_1_FOUNDER_ACCEPTANCE_CLOSURE_2026-08-26.md`). Until this
document, the governance state was explicitly *"no Cafe v2.2 work authorized
in this repo; v2.2 Product Research is being run externally with ChatGPT"*
(`docs/ai/current-task.md` §5 newest pointer at time of writing;
`docs/strategy/oruwa-master-roadmap.md` Phases 2–4).

A prior READ-ONLY mission produced an internal analysis
(`CAFE_V2_2_WP1_OPERATIONS_RECOVERY_REPORT`) whose accepted conclusion was:
the repository is *technically* ready to begin an Operations work package,
but implementation must not start until a Founder/Product-approved scope for
Cafe v2.2 WP1 is recorded in the repository.

This document closes exactly that governance gap and nothing else. It records
the Founder-approved product scope for WP1 Operations so that the previous
contradiction — *"v2.2 not authorized"* vs *"WP1 Operations should be the
next work package"* — no longer exists.

The Recovery Report is **analysis input only**. Its technical hypotheses are
**not** promoted to Founder-approved decisions by this document (see §17).

## 2. Founder-authorized product decisions

### D1 — WP1 authorization

Cafe v2.2 WP1 Operations is **authorized** as the next product work package.

After this scope document is merged to `dev`, a **separate WP1-A
implementation mission** may begin — but **only on a separate explicit
Founder prompt**. This document does **not** authorize starting
implementation code, SQL, migrations, RLS, or tests in the same mission that
produced it, and does **not** pre-approve WP1-A's technical design sight
unseen.

### D2 — Photo / evidence

Photo / evidence capture is **not** part of the initial WP1 MVP.

Initial response mechanisms are limited to:

- checkbox / pass–fail,
- structured numeric value,
- text / note.

The architecture must **not deliberately block** a future addition of
photo/evidence, but **no Storage/media infrastructure is built for
Operations now**.

### D3 — HACCP product model

HACCP is **not** a separate ORUWA module or capability in WP1.

Model:

- **Operations** = a reusable, generic ORUWA domain module.
- **Cafe HACCP workflows** = Cafe-specific presets / configuration / content
  built on the generic Operations primitives.

Do **not** create, as part of WP1:

- a `haccp` module code,
- `has_capability('haccp')` or any HACCP capability check,
- HACCP-specific structures in the generic Operations core schema.

### D4 — Attention severity

- A normal overdue operational task → **warning**.
- A critical operational condition → **action_required**.

"Critical" includes, at least conceptually:

- a critical check missed,
- a threshold violation that requires action,
- an explicitly reported problem that requires Manager action,
- a required verification waiting for a Manager.

The exact technical derivation of "critical" is an **implementation
decision** for the relevant implementation WP, not fixed here.

### D5 — Reusability

Operations is designed **reusable from day one**. The generic Operations
domain must contain **no Cafe/HACCP hardcoding**. Future vertical products
must be able to use the same Operations domain with different presets /
configuration.

## 3. Approved WP1 product purpose

WP1 creates a **reusable operational execution layer** for ORUWA.

It answers the question:

> "What needs to be done at this location today / at this operational moment,
> was it actually done, what was the result, and does the situation need a
> Manager's attention?"

WP1 Operations is explicitly **not**:

- project management,
- an enterprise task manager,
- a workflow-automation platform,
- a generic form builder,
- employee chat,
- a recipe system,
- an inventory system,
- a general-purpose issue tracker.

## 4. Approved Manager MVP

The Manager must be able to:

- create reusable operational templates / checklists,
- create Opening / Closing / Cleaning / Daily checks,
- define checklist items,
- set a simple operational schedule / recurrence,
- apply templates to a location,
- see today's operational tasks,
- see completion state,
- see actionable exceptions,
- perform verification where verification is required.

Template / configuration UI must **not** overload the main Manager
dashboard. A **separate Operations configuration surface** is acceptable and
expected.

## 5. Approved Staff MVP

The Staff member must be able to:

- see the current Operations tasks,
- open a task / checklist,
- complete the required items,
- record structured responses,
- save numeric measurements as numeric data,
- add a note / report a problem,
- complete the task,
- see a clear completion / result state.

Initial WP1 does **not** require photo upload (see D2).

## 6. Approved response model

Minimum response categories:

1. boolean / pass–fail,
2. numeric,
3. text / note.

Numeric measurements must be stored **structurally** (as numeric data, not
free text). Operations must allow defining an **acceptable threshold /
range** for numeric checks so the system can determine an exception.

Exact SQL columns / data types are **not** approved here — that is an
implementation decision.

## 7. Approved HACCP boundary

Cafe should receive Operations presets / use cases at the level of:

- opening hygiene checks,
- closing hygiene checks,
- cleaning checks,
- temperature checks,
- corrective-action record,
- recheck,
- operational history.

But this document states explicitly:

> ORUWA supports operational workflow and recordkeeping. WP1 does **not**
> grant the right to make a marketing or legal claim that ORUWA guarantees
> HACCP certification or a business's legal compliance.

## 8. Module boundaries

### Operations vs Recipes / Manuals

- **Recipes / Instructions** = *how* to prepare or perform a specific
  instruction.
- **Operations** = *what* must be done in a specific operational
  context/time, and recording the fact/result that it was done.

Do **not** use Recipes as storage for Operations tasks. A future
reference-link between an Operations item and a Recipe/Manual is acceptable
but is **not required** for initial WP1.

### Operations vs Workforce

Operations has **no hard product dependency** on Workforce. Operations must
remain usable when the Workforce module is OFF. If assignment of a task to a
specific employee is implemented, it must be **optional**. Do **not** build a
dependency engine.

### Operations vs Inventory / Purchases

Separate domains. Operations must **not** become a second Inventory/Purchases
workflow.

### Operations vs Manager Attention

Manager Attention is **not** a task manager. Operations sends it **only
actionable exceptions**. Normal successful completions do **not** appear in
Attention.

## 9. Module access / security product requirement

This is a **mandatory architectural requirement**, stated at product level
(not as a SQL spec).

Operations must be a **full ORUWA module** with a **backend-enforced ON/OFF
boundary**.

Security contract:

```
module access
AND
permission
AND
tenant / location / domain rules
```

- Operations OFF must: hide tenant-facing UI, block tenant-facing backend
  access, and **not delete historical data**.
- Operations ON after having been OFF must restore access to the prior data
  according to permissions.
- Use the existing module-access foundation — the `core.has_module_access`
  pattern established by the Module Access Security Remediation mission
  (`docs/ai/MODULE_ACCESS_SECURITY_REMEDIATION_COMPLETION_REPORT_2026-08-26.md`;
  primitive in `supabase/migrations/0093_core_has_module_access.sql`).
- **Frontend-only module gating is not permitted.**

This matches the completed module-access remediation exactly: module access
is ANDed alongside permission checks, never replacing them; data is preserved
when a module is OFF and access is restored unchanged when it is turned back
ON.

## 10. Capability decision

For initial WP1, **do not build capability infrastructure**.

Do **not** create, within WP1 and solely for the sake of HACCP:

- `core.module_capabilities`,
- `has_capability()`,
- a HACCP capability,
- a dependency engine,
- an entitlement redesign.

The existing Operations module ON/OFF mechanism is **sufficient** for the
initial WP1 product scope. This decision does **not** forbid a future
capability layer if it becomes commercially necessary.

## 11. Recurrence decision boundary

Scope requires **simple** recurrence / scheduling:

- daily,
- selected weekdays,
- an operational time / window.

The **exact mechanism** for creating task instances is **not** fixed as
Founder-approved here. In particular the following are **not** approved
automatically:

- lazy generation,
- cron,
- a scheduled job,
- manual generation.

That is a technical implementation decision for a future WP.

**Mandatory product behavior:** a task must exist / be considered expected in
its operational period **regardless of whether any particular Staff member
opened the app**. The architecture must guarantee this behavior.

## 12. Task / exception model boundary

Stated conceptually:

- **Task execution state** and **operational exception / problem** are
  **different concepts**.
- A single task may carry an actionable exception **without** turning the
  whole task lifecycle into a universal Issues workflow.

Exact enum / status names are **not** fixed as a Founder decision. The
implementation must choose a **minimal** lifecycle.

## 13. Audit / history requirement

Operations must retain **business operational history**:

- what was required,
- what was done,
- when,
- by whom,
- what structured values were recorded,
- what exceptions occurred,
- corrective / recheck result where applicable.

Security/admin audit must use the **existing ORUWA audit pattern** and only
for genuinely audit-worthy configuration / verification actions. Do **not**
turn the audit log into a business event store.

## 14. WP1 delivery principle

WP1 ships as **small PRs**.

The **first** implementation PR must be **foundation-oriented**:

- module registration / access,
- minimum data foundation,
- RBAC,
- RLS,
- security tests.

Its exact schema scope must be **minimized again before coding**. Do **not**
create the entire future Operations model just because it was proposed in the
Recovery Report.

## 15. Explicit out of scope for initial WP1

- photo / media evidence,
- IoT temperature sensors,
- LINE notifications,
- email notifications,
- Event Bus,
- a universal workflow engine,
- a generic form builder,
- enterprise task management,
- an arbitrary custom-field builder,
- a complex escalation / SLA engine,
- electronic signatures,
- government integrations,
- a HACCP certification guarantee,
- accounting,
- POS,
- payroll,
- a capability-framework redesign.

## 16. Important technical non-decisions

The prior Recovery Report proposed technical hypotheses. They are **not**
Founder-approved and must be verified during implementation planning /
technical design. In particular, the following are **not** settled:

- exactly 5 Operations tables,
- exact table names,
- a `template_snapshot` jsonb,
- a separate `task_exceptions` table,
- a `recurrence` jsonb,
- exact status enums,
- exact RPC names,
- the exact number of RLS policies,
- the exact number of migrations,
- lazy instance generation,
- the exact PostgreSQL enum-migration strategy (e.g. adding an `operations`
  value to `core.module_code`).

## 17. Relationship to the master roadmap

`docs/strategy/oruwa-master-roadmap.md` sequences Cafe v2.2 as Phase 2
(Product Research, run externally) → Phase 3 (Implementation) → Phase 4
(Acceptance). This document is a **Founder decision to authorize one
concrete, bounded work package (WP1 Operations) as the first piece of Phase 3
Cafe v2.2 implementation**, ahead of a completed full Phase 2 Top-5 research
cycle. It does **not**:

- invalidate or replace the broader Phase 2 research for further v2.2 scope,
- authorize any v2.2 work beyond WP1 Operations,
- change any other phase ordering.

## 18. History note (governance truth preserved)

Earlier, Cafe v2.2 was explicitly **not** authorized without a Founder gate.
That was correct and remains a true historical record. As of 2026-08-28, the
Founder has explicitly provided that gate **for WP1 Operations only**,
through the decisions recorded above. No historical record is deleted or
rewritten to reflect this change.

## 19. Implementation authorization state

**AUTHORIZED** — but only for a **separate** WP1-A implementation mission
started on its **own explicit Founder prompt**. WP1 implementation has **not**
started. No application code, SQL, migration, RLS, or test change is made by
this document.
