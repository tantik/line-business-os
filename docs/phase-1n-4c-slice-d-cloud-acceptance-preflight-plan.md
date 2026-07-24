# Phase 1N-4C Slice D - Mame To Cha Cloud Acceptance Preflight

Status: preparation only. No Cloud write is authorized by this document.

## 1. Outcome

Prepare a reviewed, evidence-backed go/no-go package for onboarding the
`mame-to-cha` acceptance tenant into the existing Cloud dev/acceptance
environment.

Slice D execution starts only after this preflight is complete and the owner
approves the first specific write. Every later write requires its own scoped
approval.

## 2. Confirmed starting point

- Slice C2 merged into `dev` through PR #110 (`f24385a`).
- Local Auth users, tenant fixture, memberships, roles, employee binding,
  acceptance data, and audit behavior were exercised locally.
- Local read-only verification passed.
- Manager and staff authenticated browser paths passed.
- Staff access to the manager page fails closed.
- Full local typecheck/test/build/lint gate passed.
- No Supabase Cloud write, Cloud Auth change, DNS change, or production
  action occurred in Slice C.

The version-controlled manifest source is
`packages/db/scripts/mame-to-cha-fixture.ts`. Credentials and PII values are
never part of this manifest.

## 3. Preflight sequence (read-only)

Run each check separately and record only redacted evidence:

1. Confirm local `dev` equals `origin/dev` at the PR #110 merge or a reviewed
   later commit.
2. Identify the exact Supabase Cloud dev/acceptance project by safe metadata;
   do not infer it from a secret or from a locally linked project.
3. Confirm the project is not production.
4. Inspect migration parity read-only. Stop if Cloud is behind, ahead, or
   contains an unexpected migration; migration work is a separate phase and
   approval.
5. Confirm required schemas, facade views, functions, roles, and permissions
   exist using metadata/read-only checks.
6. Check whether `mame-to-cha` already exists. Any partial or duplicate state
   is a stop condition, not permission to repair it.
7. Check whether the intended manager/staff identities already exist using a
   redacted existence result only. Never print addresses or credentials.
8. Confirm the intended Vercel acceptance deployment and its environment
   class. Do not read or display secret values.
9. Confirm `preview.oruwa.jp` ownership/routing status without changing DNS or
   Vercel domains.
10. Produce a go/no-go report containing findings, unresolved decisions,
    exact proposed write scope, rollback/compensation, and the next approval
    request.

## 4. Decisions required before the first write

- Exact Cloud dev/acceptance project and named owner.
- Confirmation that the target is non-production.
- Acceptance domain strategy for `preview.oruwa.jp`.
- Synthetic versus client-provided acceptance content.
- Exact Auth creation mechanism.
- Credential delivery/rotation owner; no credentials in Git or chat output.
- Whether the client additions are required before acceptance onboarding or
  can be delivered as a following acceptance iteration.

## 5. Client additions register

Record each client request before implementation. Do not combine unrelated
requests in one row.

| ID | Business problem / requested outcome | Affected users and location | Classification | Reusable platform result | Security/RLS/PII impact | Acceptance test | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MTC-ADD-01 | Replace live break start/end with a lunch-duration choice during clock-out, followed by confirmation | Staff at the active cafe location | Reusable capability inside Workforce | Shared safe clock-out flow with actual break duration | Self-scoped attendance write; actual break duration is operational employee data; audit required | 0/30/60 selection, cancel at either modal makes no write, confirm records clock-out and selected break once | **Now, before Slice D Cloud writes** |
| MTC-ADD-02 | Add an instruction marker to the recipe/knowledge catalog and show instruction content first to staff | Staff and managers at enabled locations | Reusable capability inside Workforce | Shared operational knowledge library for recipes, rules, equipment procedures, and troubleshooting | Tenant/location-scoped managed content; manager write permission and audit required; avoid sensitive data in instruction bodies | Manager marks/unmarks instruction, staff sees icon and deterministic instruction-first ordering, tenant isolation holds | **Now, before Slice D Cloud writes** |

Allowed classifications (ADR 0010):

- tenant/location configuration;
- branding or managed content;
- reusable capability inside Workforce;
- reusable top-level product module;
- exceptional tenant-specific behavior (last resort, requires explicit
  architectural justification).

For each significant request, also record data model, permissions, module
entitlement, UI, migration, cost, risks, rollout, and a now/later/reject
decision before implementation.

### MTC-ADD-01 analysis - safe clock-out with lunch duration

**Business outcome:** make end-of-shift recording fast while preventing an
accidental clock-out. The client does not want staff to run a live
start-break/end-break timer.

**Required interaction:**

1. While clocked in, show one primary `退勤` action. Remove `休憩開始` and the
   `on_break` interaction from this surface.
2. First modal: large, one-tap choices `0分`, `30分`, and `60分`, plus
   `キャンセル`. Choosing cancel closes the modal and changes nothing.
3. After a duration is selected, show a compact confirmation modal containing
   the current clock-out time and selected lunch duration.
4. Confirmation performs one clock-out operation using the selected duration.
   Cancel returns without writing and leaves the user clocked in.
5. Disable repeated submission while the operation is pending. A retry must
   not create a second attendance row or apply clock-out twice.

**UX recommendation:** use a bottom sheet on narrow/mobile layouts, with three
equal large duration buttons in the thumb zone. Keep `60分` visually neutral
rather than preselected so the interface does not silently bias payroll data.
The final destructive-looking action should say `退勤を確定`, while cancel is
always visible and never represented only by a small close icon. Preserve
JA/EN labels and keyboard/focus behavior.

**Data model impact:** the demo `WorkReport` already has `breakMinutes`, but
the DB-backed `workforce.attendance` record currently stores clock-in/out and
work-report fields without an actual break-duration column. Planned
`workforce.shifts.break_minutes` is not a substitute: planned break and actual
break are different facts. Implement this as an additive, tenant-scoped
attendance extension with a non-negative bounded actual-break value, exposed
through the existing narrow `api.workforce_attendance` facade.

**Security and audit:** derive tenant, location, employee, and work date from
the authenticated/self-scoped context. The client may submit only the allowed
duration value, never an employee or tenant identifier. Existing attendance
RLS remains the boundary. The clock-out mutation must be audited and must not
log unnecessary PII.

**Implementation scope:** shared demo UI, DB-backed staff UI, input parser,
staff action/service, attendance facade, additive migration, correction/report
display, manager display, JA/EN copy, help/guide copy, and focused regression
tests. The public demo and authenticated preview must not drift into two
different clock-out contracts.

**Acceptance tests:**

- `0`, `30`, and `60` minutes are each recorded exactly as selected;
- cancel on the selection modal writes nothing;
- cancel on the confirmation modal writes nothing;
- confirmed clock-out records the current time and selected duration once;
- double-click/retry cannot duplicate or overwrite a completed clock-out;
- staff cannot write another employee's attendance;
- manager sees the actual lunch duration and net worked time;
- correction flow can request a changed lunch duration;
- mobile layout is usable with one hand in JA and EN.

**Recommendation:** implement before Slice D Cloud writes. This request changes
the acceptance data contract and requires an additive migration/facade update;
onboarding first would force immediate Cloud schema change and a repeated
acceptance smoke.

### MTC-ADD-02 analysis - instruction-first operational knowledge

**Business outcome:** let managers publish operational rules, equipment
procedures, and troubleshooting guidance in the same quick-access catalog
employees already use for recipes. Instruction content must be immediately
recognizable and appear before ordinary recipe content.

**Product classification:** reusable capability inside Workforce. This is not
a Mame To Cha-only fork and does not justify a separate top-level module. It
evolves the existing recipe catalog into a small operational knowledge
library while preserving recipe-specific detail where applicable.

**Recommended content model:** add an explicit managed content kind such as
`recipe` or `instruction`; do not infer the kind from title/category text.
Keep `is_popular` as an independent flag, because popularity and instruction
are different facts. An instruction may also be popular, but its instruction
priority wins in employee ordering.

**Required interaction:**

1. Manager create/edit UI exposes a clear `インストラクション` /
   `Instruction` content-kind choice beside the existing popularity control.
2. Employee cards and details show a distinct instruction icon with accessible
   text/tooltip; do not rely on icon or color alone.
3. Employee ordering is deterministic:
   instructions first, then popular ordinary recipes, then remaining content;
   use the existing stable title/id tie-break inside each group.
4. Removing the instruction designation returns the item to normal ordering
   without deleting its content.
5. Instruction detail supports rules, ordered procedures, safety notes, and
   troubleshooting text without requiring fake ingredients.

**UX recommendation:** use a simple book/manual or information-document icon,
visually distinct from the popularity star. Add a compact first group or
label such as `重要なインストラクション` when one or more instructions
exist, rather than relying only on reordered cards. Preserve the current fast
horizontal scan and JA/EN behavior.

**Data model impact:** the current DB recipe row has `is_popular` but no
instruction/content-kind field, and the read layer sorts by Japanese title.
Use an additive constrained content-kind column (default `recipe`) and expose
it through `api.workforce_recipes`. Existing ingredient/step/note children can
remain optional for instructions; the UI must render only applicable
sections. If a future knowledge system needs attachments, revisions, search,
or acknowledgement tracking, that is a later separately designed capability,
not part of this request.

**Security and audit:** reuse recipe read RLS and manager recipe-management
permission boundaries. All writes remain tenant/location scoped, go through
the existing app-facing write path, and are audited. Instruction bodies must
not be treated as a place for secrets, credentials, personal data, or
unreviewed safety-critical claims.

**Implementation scope:** additive migration and facade update, shared recipe
types/read ordering, manager create/edit control, employee card/detail icon
and grouping, public demo parity, preview/DB-backed rendering, JA/EN copy,
help/guide updates, fixture content, and tenant-isolation/order regression
tests.

**Acceptance tests:**

- a manager can mark and unmark an item as instruction;
- employees see an accessible instruction marker;
- all instructions appear before popular and ordinary recipes;
- popular ordinary recipes remain ahead of other ordinary recipes;
- order is stable when multiple items share the same kind/popularity;
- instructions render correctly without ingredients;
- another tenant's instructions are never visible or editable;
- unauthorized staff cannot change content kind;
- unmarking does not delete or corrupt the item;
- demo and authenticated preview use the same visible ordering contract.

**Recommendation:** implement before Slice D Cloud writes. The request changes
the catalog schema, facade projection, acceptance fixture, and employee
ordering contract. Applying it first avoids onboarding Cloud data into a
schema that would immediately need migration and repeated acceptance smoke.

## 6. Approval-gated execution map

The following is a future sequence, not current authorization:

| Gate | Proposed operation | Required approval |
| --- | --- | --- |
| D0 | Accept the preflight report and exact target | Owner review |
| D1 | Create or verify tenant and location rows | Explicit Cloud DB write approval |
| D2 | Enable the Workforce tenant module | Explicit module/write approval |
| D3 | Create manager and staff Cloud Auth identities | Explicit Auth/credential approval |
| D4 | Create user mirrors, memberships, and role assignments | Explicit identity/RBAC write approval |
| D5 | Create the staff employee binding and encrypted PII | Separate explicit PII/binding approval |
| D6 | Apply approved deterministic acceptance content and audit rows | Explicit fixture write approval |
| D7 | Run read-only verification | No write approval; target must still be confirmed |

Approval for one gate never carries forward to another gate. Apply,
auth-provision, repair, cleanup, migration, and production commands remain
forbidden unless the corresponding gate is explicitly approved.

## 7. Stop conditions

Stop and report before any write when:

- the Cloud target is ambiguous or production-like;
- migration parity is not exact;
- required relations/functions/roles are missing;
- existing tenant/Auth state is partial, duplicate, or conflicts with the
  manifest;
- a command would expose a secret, credential, real email, UUID, or PII;
- rollback/compensation is undefined;
- the requested change expands beyond the approved gate;
- client additions would require an unreviewed migration, permission, module,
  or tenant-specific fork.

## 8. Relationship to client additions

Do not restart the completed migration. Keep PR #110 as the stable baseline.

The default sequence is:

1. classify the additions;
2. keep onboarding and new product scope separately reviewable;
3. complete the read-only Slice D preflight;
4. decide which additions are acceptance blockers;
5. implement approved reusable additions in separate branches;
6. onboard and test the resulting reviewed baseline.

Only a confirmed acceptance-blocking requirement should delay Cloud
onboarding. Cosmetic or follow-up improvements can proceed as a later
acceptance iteration.

## 9. Exit criteria

Slice D preparation is complete when:

- the roadmap and current-task handoff reflect completion of Slice C2;
- the typed manifest is confirmed as the source of truth;
- client additions are entered and classified;
- the exact non-production target is identified;
- every read-only check has redacted evidence;
- all unresolved decisions and stop conditions are listed;
- the first proposed Cloud write has an exact scope, compensation plan, and
  a separate owner approval request.
