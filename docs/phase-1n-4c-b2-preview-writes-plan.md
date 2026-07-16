# Phase 1N-4C — Mame To Cha DB Preview: Slice B2 Preview-Safe Writes Plan (Documentation Only)

## Scope

This document is a **verified implementation plan** for Phase 1N-4C Slice B2:
adding preview-safe write (Server Action) capability to the Mame To Cha
DB-backed client preview, on top of the read-only shell shipped in Slice B1
(merged to `dev`; see
[phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md](phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md)
Sections D–H, W, and
[ADR 0010](adr/0010-modular-product-governance-and-client-request-classification.md)).

This is documentation only. No runtime code, migration, SQL, Supabase Cloud
command, Vercel/DNS change, or Auth-user creation is performed by producing
this document. Nothing here is implemented; nothing is marked done.

## 1. Current-state inventory

### 1.1 Existing Workforce Server Actions (dashboard, unchanged)

All three files are `'use server'` modules under
`apps/web/src/lib/workforce/`. Every exported action follows the same shape:
parse `FormData`/`unknown` input → `requireTenantContext()` **with no
`tenantId` argument** (lenient, cookie-hinted path, `apps/web/src/lib/tenant/context.ts:83-89`)
→ `createClient()` (RLS-scoped authenticated client) → delegate to a
service-layer function in the sibling module, passing the resolved
`tenantContext.data.activeTenant.tenantId`. RLS is the only role/capability
enforcement in every one of these actions today — none of them contains an
app-level role check.

**`apps/web/src/lib/workforce/staff-actions.ts`**

| Action | Input | Tenant resolution | Location source | Role assumption | Service call | Revalidation | Callers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `upsertEmployee` (staff-actions.ts:30) | `FormData` via `parseUpsertEmployeeInput` | `requireTenantContext()` (lenient) | `input.locationId` taken directly from `FormData`, **not verified against `listTenantLocations`** | RLS only (`wf_employees_staff_manage`, `workforce.staff.manage`) | `upsertWorkforceEmployee` (employees.ts:167) | None (`router.refresh()` client-side, `manager-dashboard-client.tsx`) | `StaffForm` in `manager-dashboard-client.tsx` |
| `setEmployeeActive` (staff-actions.ts:48) | `FormData` via `parseSetEmployeeActiveInput` | `requireTenantContext()` (lenient) | N/A (no location field) | RLS only | `setWorkforceEmployeeActive` (employees.ts:232) | None | `manager-dashboard-client.tsx` |
| `bindEmployeeLineUser` / `unbindEmployeeLineUser` | `FormData` | `requireTenantContext()` (lenient) | N/A | RLS only | `employee-line-links.ts` | None | `LineLinkForm` | **Out of scope (LINE binding excluded from Phase 1N-4C).** |

**`apps/web/src/lib/workforce/schedule-actions.ts`**

| Action | Input | Tenant resolution | Location source | Role assumption | Service call | Revalidation | Callers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `submitShiftPreference` (schedule-actions.ts:46) | `FormData` | `requireTenantContext()` (lenient) | Inferred from `getMyWorkforceStaffProfile(supabase, tenantId).data.locationId` — never from `FormData` | RLS only (`wf_shift_requests_self_insert`) | `submitShiftPreferenceWrite` (shift-requests.ts:132) | None | `ShiftPreferenceForm`, staff dashboard |
| `runAutoDistribution` (schedule-actions.ts:78) | `unknown` (JSON, not `FormData`) via `parseRunAutoDistributionInput` | `requireTenantContext()` (lenient) | `parsed.locationId` (client input) **verified**: `listTenantLocations(supabase)` filtered to `l.tenantId === tenantId && l.locationId === parsed.locationId`, `not_found` if absent | RLS only (`wf_shifts_manage`, `workforce.shift.write`) — "attempt, then map" convention, no pre-check | `insertDraftShiftAssignments` (shift-assignments.ts:126) | None | `manager-dashboard-client.tsx` |
| `updateShiftAssignment` (schedule-actions.ts:164) | `FormData` | `requireTenantContext()` (lenient) | `input.locationId` **verified** against `listTenantLocations` (same pattern) | RLS only | `updateShiftAssignmentWrite` (shift-assignments.ts:215) | None | `ShiftCellEditor` |
| `createShiftAssignment` (schedule-actions.ts:192) | `FormData` | `requireTenantContext()` (lenient) | `input.locationId` **verified** against `listTenantLocations` | RLS only | `createShiftAssignmentWrite` (shift-assignments.ts:163) | None | `ShiftCellEditor` |
| `publishSchedule` (schedule-actions.ts:218) | `FormData` | `requireTenantContext()` (lenient) | `input.locationId` **verified** against `listTenantLocations` | RLS only (`wf_shifts_manage`) | `publishShiftAssignments` (shift-assignments.ts:253) | None | `manager-dashboard-client.tsx` |

**`apps/web/src/lib/workforce/attendance-actions.ts`**

| Action | Input | Tenant resolution | Location source | Role assumption | Service call | Revalidation | Callers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `submitWorkReport` (attendance-actions.ts:29) | `FormData` | `requireTenantContext()` (lenient) | Inferred from own staff profile (`myProfile.data.locationId`) | RLS only | `submitWorkReportWrite` (attendance.ts:131) | None | `WorkReportForm` |
| `submitCorrectionRequest` (attendance-actions.ts:67) | `FormData` | `requireTenantContext()` (lenient) | Inferred from own staff profile | RLS only | `submitCorrectionRequestWrite` (shift-requests.ts:172) | None | `CorrectionRequestForm` |
| `decideCorrectionRequest` (attendance-actions.ts:90) | `FormData` | `requireTenantContext()` (lenient) | N/A | RLS only (`wf_shift_requests_write`, `workforce.request.manage`) | `decideCorrectionRequestWrite` (shift-requests.ts:212) | None | `manager-dashboard-client.tsx` |

**Mutation inventory required by the task, mapped to the table above:**

| Required mutation | Existing action | In B2 scope |
| --- | --- | --- |
| Employee create/edit | `upsertEmployee` | Manager |
| Employee activate/deactivate | `setEmployeeActive` | Manager |
| Shift create | `createShiftAssignment` | Manager |
| Shift update/unassign | `updateShiftAssignment` (unassign = `employeeId: null` patch) | Manager |
| Auto-distribution | `runAutoDistribution` | Manager |
| Schedule publish | `publishSchedule` | Manager |
| Shift preference submit | `submitShiftPreference` | Staff |
| Work report submit | `submitWorkReport` | Staff |
| Correction request submit | `submitCorrectionRequest` | Staff |
| Correction request approve/reject | `decideCorrectionRequest` | Manager |

**No `revalidatePath`/`redirect` calls exist in any of the three action
files or anywhere under `apps/web/src/app/(protected)/dashboard/workforce/`**
(confirmed by grep). Every dashboard mutation form calls the action inside
`useTransition`, then `router.refresh()` client-side on success
(`manager-dashboard-client.tsx`) — there is no server-side revalidation
convention to preserve or diverge from. This directly informs Section 10.

### 1.2 Role/capability model — no app-level role field

`TenantMembership` (`apps/web/src/lib/tenant/types.ts:22-30`) carries no
`role` field. Every dashboard action's only role/capability enforcement is
RLS (`core.has_permission(tenant_id, permission, location_id)`,
confirmed in `0009_workforce.sql:123-160`) — the existing codebase has no
independent "is this user a manager" check to reuse or imitate; the
established, working convention (explicitly documented in
`schedule-actions.ts:33-41`/`74-77` and `attendance-actions.ts:17-24`) is
"attempt the service-layer call, let RLS accept or reject it." **This
remains true and unchanged for every existing dashboard action** — B2 does
not touch `staff-actions.ts`/`schedule-actions.ts`/`attendance-actions.ts`.
The new preview wrapper layer (only) adds an explicit app-level
permission/binding pre-check on top of this, as defense-in-depth specific
to the preview surface — see Section 3.1.

## 2. Preview read context — what is reusable by Server Actions

| Helper | File | Redirects? | Reusable by a Server Action as-is |
| --- | --- | --- | --- |
| `resolvePreviewTenantContext()` | `apps/web/src/lib/preview/tenant.ts:37-56` | **No.** Returns a typed `PreviewTenantResult` (`not_authenticated \| no_access \| config_error \| unexpected_error \| success`); never calls `redirect()`. | **Yes, unchanged.** Already the strict, membership-driven, cookie-independent resolver Section G2 of the architecture plan anticipated — it takes no arguments (the tenant slug is the fixed `PREVIEW_TENANT_SLUG` constant), so no client-supplied slug/tenant value is ever accepted. |
| `resolvePreviewWorkforceModule(supabase, tenantId)` | `apps/web/src/lib/preview/module-guard.ts:30-38` | No — pure result, no I/O side effect beyond the `listTenantModules` read. | **Yes, unchanged.** Reads `api.my_tenant_modules` fresh; never trusts a client flag. |
| `resolveManagerLocation(locations)` | `apps/web/src/lib/preview/location.ts:16-21` | No — pure function, no I/O. | **Yes, unchanged.** Caller still owns fetching `listTenantLocations` + filtering to the resolved tenant, same as the read path. |
| `resolveStaffLocation(profile, tenantLocations)` | `apps/web/src/lib/preview/location.ts:38-46` | No — pure function. | **Yes, unchanged.** |
| `selectPreviewMembership(memberships, slug?)` | `apps/web/src/lib/preview/tenant-select.ts:15-20` | No — pure, no I/O. | Yes, but already called internally by `resolvePreviewTenantContext`; a write wrapper does not need to call it directly. |
| `requirePreviewUser(publicPath)` | `apps/web/src/lib/preview/auth.ts:17-19` | **Yes.** Wraps `requireUser()`, which calls `redirect()` on no session (`apps/web/src/lib/auth/require-user.ts`). | **No — must not be used by a Server Action.** A `redirect()` thrown inside a Server Action is a page-only pattern; the write path needs a typed `not_authenticated` result instead, which `resolvePreviewTenantContext` already returns without redirecting (it calls `getUserFromClient` directly, not `requireUser`). |

**Conclusion for the write path's non-redirecting result contract:** no new
resolver needs to be built. `resolvePreviewTenantContext()`,
`resolvePreviewWorkforceModule()`, `resolveManagerLocation()`, and
`resolveStaffLocation()` are already redirect-free, already implement
exactly the strict/fail-closed contract the architecture plan's Section G2
anticipated, and can be called from a Server Action unchanged. The only
page-only helper is `requirePreviewUser`, which a write wrapper must not
call — it must check `resolvePreviewTenantContext()`'s `not_authenticated`
status itself and return a neutral error result (Section 11).

## 3. Write security contract (as it maps onto existing helpers)

Every preview mutation wrapper performs, in order:

1. Parse and validate mutation-specific input (reuse the existing
   `parse*Input` functions in `employees-input.ts`/`schedule-input.ts`/
   `attendance-input.ts` — unchanged, already tenant-oblivious pure parsers).
2. No server-owned "preview context identifier" needs to be invented — the
   preview tenant slug is already the fixed `PREVIEW_TENANT_SLUG` constant
   compiled into `resolvePreviewTenantContext`, never read from any request
   input (Section D.6 of the architecture plan).
3–6. `resolvePreviewTenantContext()` performs steps 3–6 (authenticate,
   resolve membership, obtain tenant UUID, call
   `requireTenantContext({ tenantId })` strictly) as a single call.
7. `resolvePreviewWorkforceModule(supabase, tenantId)`.
8. `resolveManagerLocation`/`resolveStaffLocation`, or (for the three
   self-scoped staff actions) infer location from
   `getMyWorkforceStaffProfile`, exactly as the dashboard actions already do
   — never from `FormData`.
9. Role/capability: **B2 revises this from the dashboard's RLS-only
   convention.** Every B2a manager wrapper adds an explicit, app-level
   permission pre-check (Section 3.1) before delegating to the service
   layer — RLS remains the final boundary, but the preview surface no
   longer relies on "attempt, then let RLS reject" alone, because a
   preview mutation's neutral error contract (Section 11) must fail
   *before* a staff/employee-role caller's request ever reaches a
   manager-only service-layer call, not merely be rejected by the database
   after reaching it. This does not change the dashboard's existing
   convention (Section 1.2, unchanged, still RLS-only) — it is additive
   defense-in-depth scoped to the new preview wrappers only.
10. Call the existing service-layer function unchanged, with the resolved
    tenant/location.
11. RLS remains final enforcement — unchanged.
12. No wrapper redirects and no wrapper calls `revalidatePath` (Section
    10) — current B2 uses no `revalidatePath` at all, matching the
    existing dashboard action convention (Section 1.1: none of the
    dashboard actions call it either). The preview client island that
    invoked the wrapper calls `router.refresh()` on the current **public**
    preview page (`/mame-to-cha/manager` or `/mame-to-cha/staff`) after a
    successful result — the wrapper itself never touches
    `/_client-preview/*` or `/dashboard/workforce/*` in any form, because
    it performs no navigation or path revalidation at all.

The write path must never trust tenant UUID, location UUID (without tenant
validation), the active-tenant cookie, a query parameter, browser state, a
module-enabled flag, or a role name supplied by the client. Every wrapper
below is written to this contract, as detailed per-role in Section 3.0/3.1.

### 3.0 Fields forbidden in every preview form vs. legitimate target identifiers

This section distinguishes **authority** fields (which decide *who can act,
on which tenant/location, under which capability* — always server-resolved,
never client-supplied) from **target-record identifier** fields (which
identify *which existing business object* a manager operation acts on —
legitimately client-supplied, but never trusted on their own; every one is
re-verified server-side before the service-layer call). Collapsing these two
categories into one blanket rule is wrong for B2a: a manager cannot edit an
employee, assign a shift, or decide a correction request without naming
*which* employee/shift/request — but naming one is not the same as granting
tenant, location, role, or module authority over it.

**Fields forbidden in every preview form (B2a and B2b alike) — authority,
never a target identifier:**

- `tenantId`
- `tenantSlug`
- `locationId` **as authority** (i.e. as a value that selects or overrides
  which tenant/location the mutation targets — see Section 8.1; this is
  distinct from a location being *implied* by an already-validated target
  record, which is never itself a submitted field)
- `role`
- permission name (e.g. a submitted `workforce.staff.manage`-shaped value)
- module-enabled flag

Tenant, location, role/capability, and module entitlement are always
resolved server-side (`resolvePreviewTenantContext`,
`resolveManagerLocation`/`resolveStaffLocation`, the Section 3.1 step 6
`api.has_permission` check, `resolvePreviewWorkforceModule`) — never read
from `FormData`, a hidden field, a query parameter, or a cookie, for either
B2a or B2b.

**B2b staff forms — additionally forbidden (identity authority, not just
tenant/location/role authority):**

- `employeeId`
- `staffId`
- any field that would let the form assert **another user's identity**
- any field that would let the form assert **another location**

The employee ID and location must be derived server-side from the
authenticated caller's own `workforce.employees` binding
(`getMyWorkforceStaffProfile` → `profile.staffId`/`profile.locationId`,
Section 3.1 steps 5–7) for all three B2b wrappers —
`previewSubmitShiftPreference`, `previewSubmitWorkReport`,
`previewSubmitCorrectionRequest`. A B2b form has no legitimate reason to
name *any* employee, including the caller's own — the binding is looked
up, never submitted.

**B2a manager forms — may submit target business-object identifiers that
are necessary for the operation:**

- `employeeId`/`staffId` — for employee edit
  (`previewUpsertEmployee`'s `id`), activate/deactivate
  (`previewSetEmployeeActive`), or shift assignment
  (`previewCreateShiftAssignment`/`previewUpdateShiftAssignment`'s
  `employeeId`).
- `assignmentId` — for `previewUpdateShiftAssignment` (update/unassign).
- `shiftTypeId` — for `previewCreateShiftAssignment`/
  `previewUpdateShiftAssignment`.
- `correctionRequestId` — for `previewDecideCorrectionRequest`'s
  `requestId`.

These are identifiers of **target records**, not tenant/location authority.
A manager form submitting `employeeId` to say "edit this employee" is not
the same as a form submitting `tenantId`/`locationId` to say "act on this
tenant/location instead" — the former names a record inside an
already-server-resolved tenant/location, the latter would attempt to
override the server-resolved scope itself.

**Before the service-layer call, every B2a wrapper must verify that each
submitted target object:**

1. exists;
2. belongs to the strict `mame-to-cha` tenant;
3. belongs to the server-resolved active location — this applies to
   every B2a target-record identifier, including a correction-request
   decision (`wf_shift_requests_write` is location-scoped exactly like
   every other workforce write policy, Section 3.1a/8.1; a target's
   `locationId` must equal `resolvedLocationId`, verified via an existing
   read before the service-layer call, never assumed from the tenant
   filter alone);
4. is accessible under the exact permission checked through
   `api.has_permission` (Section 3.1 step 6 — the same permission gate
   that determines the caller is a **manager-capable caller** for this
   mutation in the first place).

A syntactically valid UUID alone is insufficient for any of the four target
identifiers above — see Section 8.1 for the concrete, per-mutation
verification mechanism (existing, already-imported read helpers; no new
service-layer function, no migration).

### 3.1 Explicit role and employee-binding enforcement (per-wrapper sequence)

**No migration is required.** `api.has_permission(p_tenant_id, p_permission, p_location_id)`
already exists (`supabase/migrations/0019_api_has_permission_facade.sql`) as
a plain-invoker RPC delegating to the already-hardened
`core.has_permission()` — it is `EXECUTE`-granted to `authenticated`, exposes
no role/permission/membership row (a boolean only), and is already the
mechanism the architecture plan's Section W3/W4 analysis assumes is safe to
call from the app layer. B2 wrappers call this RPC as an explicit app-level
pre-check; it duplicates zero authorization logic (it is the exact same
`core.has_permission()` predicate RLS itself evaluates), so it cannot
diverge from what the database would ultimately decide — it only moves the
"no" earlier, before any service-layer call, network round trip to a
mutating statement, or partial side effect.

There is no exposed `role` string to read directly — `TenantMembership`
(`apps/web/src/lib/tenant/types.ts:22-30`) carries no `role` field, and
none is added by this plan; **no wrapper ever compares a role string.**
"Verify the caller is manager-capable" is operationalized entirely as a
**capability check**: "the caller holds the exact permission key this
mutation's own RLS policy already requires," evaluated via the
`api.has_permission` RPC (never a literal `role === 'manager'` comparison,
since no such value is ever read) — confirmed directly from the RBAC seed
(`supabase/migrations/0008_rbac_seed.sql`, `0020_workforce_staff_profile_extension.sql`):
the `manager` system role holds `workforce.staff.manage`,
`workforce.shift.write`, and `workforce.request.manage`; the `employee`
system role holds none of them (only `workforce.shift.read` and
`workforce.attendance.manage`). A caller whose only membership role is
`employee` is therefore not manager-capable for any B2a mutation, and fails
every one of these checks deterministically, before any manager
service-layer call runs.

**Every B2a manager wrapper, in order:**

1. Authenticate (inside `resolvePreviewTenantContext()`, via
   `getUserFromClient` — no redirect, Section 2).
2. Resolve the caller's active `mame-to-cha` membership (inside
   `resolvePreviewTenantContext()`, via `selectPreviewMembership`).
3. Establish strict, explicit tenant context: `requireTenantContext({ tenantId })`
   (inside `resolvePreviewTenantContext()`) — the active-tenant cookie is
   never read.
4. Recheck Workforce entitlement: `resolvePreviewWorkforceModule(supabase, tenantId)`
   → must be `enabled`.
5. Load tenant locations and resolve exactly one active location:
   `resolveManagerLocation(tenantLocations)` → must be `kind: 'ok'`; `none`/
   `ambiguous` both fail closed to `location_blocked` (Section 8) — **this
   step must run before step 6**, because step 6's permission check needs
   `resolvedLocationId` as an input for every location-scoped B2a
   permission (Section 3.1a below); calling `api.has_permission` before a
   location has been resolved would leave `p_location_id` undefined for a
   mutation whose own RLS policy requires it.
6. **Verify the caller is a manager-capable caller for this specific
   mutation, using the location scope the mutation's own RLS policy
   requires** — a capability check, not a literal role-string comparison
   (`TenantMembership` exposes no `role` field to compare against, Section
   1.2/3.0):
   `supabase.schema('api').rpc('has_permission', { p_tenant_id: tenantId, p_permission: <mutation's own RLS permission key>, p_location_id: <per Section 3.1a> })` → must be `true`. See Section 3.1a for the exact
   per-wrapper permission key and location-scope argument, confirmed
   against each mutation's actual RLS policy.

   A `false` result maps to the neutral `no_access` error (Section 11) and
   stops the wrapper here — **a staff/employee membership (i.e. a caller
   who is not manager-capable) fails at this step, before step 7's
   target-record validation or the manager service-layer call in step 8.**
7. Verify every submitted **target-record identifier** (`employeeId`/
   `staffId`, `assignmentId`, `shiftTypeId`, `correctionRequestId` —
   Section 3.0) exists, belongs to the strict `mame-to-cha` tenant, and
   (where applicable) belongs to the server-resolved active location, per
   Section 8.1's concrete per-mutation mechanism. This step verifies
   *which record* the already-authorized manager-capable caller may act
   on — it never re-derives or accepts `locationId`/`tenantId` as
   authority (Section 3.0); those remain server-resolved from steps 3 and
   5 only.
8. Only then call the existing service-layer mutation, passing the
   server-resolved `tenantId`/`locationId` and the now-verified target
   identifier(s) — never a client-supplied `tenantId`/`locationId`.
9. RLS remains the final enforcement layer: every `workforce.*` write
   policy's own `using`/`with check` clause (Section 3.1a) evaluates
   independently of steps 6–7 above, so an app-level bug in this wrapper
   can narrow access (an over-strict false rejection) but can never widen
   it past what RLS itself would allow.

### 3.1a Permission-to-location-scope matrix (per B2a wrapper, confirmed against actual RLS)

Every workforce write/manage RLS policy call site in the schema passes the
target row's own `location_id` column as `core.has_permission`'s third
argument — confirmed by inspecting every `core.has_permission(tenant_id, 'workforce.*', location_id)`
call site across the migrations (`0009_workforce.sql:126-127/135-136/144-145/153-154/159-160`,
`0022_workforce_staff_recipes_rls_policies.sql:96-97`,
`0026_workforce_cafe_shifts_extension.sql:61-62`): none omits the
location argument and none passes a literal `null`. **No workforce
mutation permission in this schema is tenant-wide-only by policy
design** — every one is location-scoped, keyed to the specific row being
written. The app-level pre-check therefore always mirrors this: it never
assumes a permission is tenant-wide without checking the actual policy
first.

| Wrapper | RLS policy (table) | Permission key | `p_location_id` argument |
| --- | --- | --- | --- |
| `previewUpsertEmployee` | `wf_employees_staff_manage` (`workforce.employees`, `0022_workforce_staff_recipes_rls_policies.sql:94-97`) | `workforce.staff.manage` | `resolvedLocationId` — the policy checks `location_id` (the employee row's own column) |
| `previewSetEmployeeActive` | `wf_employees_staff_manage` (same policy/table) | `workforce.staff.manage` | `resolvedLocationId` |
| `previewCreateShiftAssignment` | `wf_shifts_manage` (`workforce.shifts`, `0026_workforce_cafe_shifts_extension.sql:59-62`) | `workforce.shift.write` | `resolvedLocationId` — `workforce.shifts.location_id` is `not null`, always the row's own location |
| `previewUpdateShiftAssignment` | `wf_shifts_manage` (same policy/table) | `workforce.shift.write` | `resolvedLocationId` |
| `previewRunAutoDistribution` | `wf_shifts_manage` (bulk insert, same policy/table) | `workforce.shift.write` | `resolvedLocationId` |
| `previewPublishSchedule` | `wf_shifts_manage` (bulk update, same policy/table) | `workforce.shift.write` | `resolvedLocationId` |
| `previewDecideCorrectionRequest` | `wf_shift_requests_write` (`workforce.shift_requests`, `0009_workforce.sql:142-145`) | `workforce.request.manage` | `resolvedLocationId` — `wf_shift_requests_write` passes the row's own `location_id` exactly like every other workforce write policy; this is location-scoped, not tenant-scoped-only, and the target request's `locationId` must also be independently verified against `resolvedLocationId` before the service-layer call (Section 8.1) |

**Result: all seven B2a wrappers pass `p_location_id: resolvedLocationId`
— none passes `p_location_id: null`.** This is a confirmed finding from
reading the policies, not an assumption: the matrix above was built by
checking each policy individually rather than generalizing from one
example, per the requirement not to assume location-scoping.

**Every B2b staff wrapper, in order:**

1. Authenticate (inside `resolvePreviewTenantContext()`).
2. Resolve the caller's active `mame-to-cha` membership (inside
   `resolvePreviewTenantContext()`).
3. Use strict, explicit tenant context (inside
   `resolvePreviewTenantContext()`).
4. Verify Workforce entitlement: `resolvePreviewWorkforceModule(supabase, tenantId)`
   → must be `enabled`.
5. Resolve the current user's own `workforce.employees` binding:
   `getMyWorkforceStaffProfile(supabase, tenantId)` → `data` must be
   non-`null` (a `null` result — no bound employee row — fails to
   `no_profile`, Section 11).
6. Verify employee tenant/location/user invariants hold:
   `getMyWorkforceStaffProfile`'s own `tenant_id` filter already guarantees
   tenant match; `wf_employees_self_read`'s `user_id = core.current_user_id()`
   predicate already guarantees the binding is the caller's own row (not
   RLS-bypassable); `resolveStaffLocation(profile, tenantLocations)` must
   resolve to a non-`null`, active location, or the wrapper fails to
   `no_profile` (never falling back to another location, Section 8).
7. Derive the employee ID and location server-side:
   `profile.staffId`/`profile.locationId` — **never** a client-supplied
   `employeeId`/`staffId`/`locationId` field, and never a field that would
   let the form assert another user's identity or another location
   (Section 3.0). No B2b wrapper's `FormData` schema may include an
   `employeeId`, `staffId`, `tenantId`, `tenantSlug`, `role`, or
   `locationId` field; input parsers (`parse*Input`) for the three B2b
   wrappers must reject (or simply never define) any such field, so a
   submitted value of that shape is either ignored by construction or
   fails `invalid_input` before step 1 even runs. Unlike B2a (Section
   3.0), a B2b form has no legitimate target-record identifier to submit
   at all — the caller's own binding is always looked up, never named.
8. Only then call the existing service-layer mutation
   (`submitShiftPreferenceWrite`/`submitWorkReportWrite`/
   `submitCorrectionRequestWrite`), passing `employeeId: profile.staffId`
   and `locationId: profile.locationId` — both server-derived, never from
   `FormData` (unchanged from the existing dashboard actions' own
   convention, Section 1.1).

RLS remains the final security boundary in both sequences (`with check`
clauses on every `workforce.*` write policy, restated as B2a step 9 above)
— steps 6–7 (B2a) / 5–7 (B2b) are required app-level defense-in-depth that
also make every negative case a neutral, predictable failure (Section 11)
instead of an opaque Postgres/PostgREST error reaching the wrapper's
caller.

## 4. Action architecture decision

**Recommended: Option A — preview-specific Server Action wrappers**, one per
mutation, in new files under `apps/web/src/lib/preview/actions/`.

| Criterion | A: preview wrappers | B: optional preview param on existing actions | C: shared core + two entry points |
| --- | --- | --- | --- |
| Risk of dashboard regression | **Lowest** — zero lines changed in `staff-actions.ts`/`schedule-actions.ts`/`attendance-actions.ts` | Medium — every dashboard action's signature and control flow changes, even if additively | Medium — requires extracting an "action core" out of 10 existing functions, touching all of them |
| Possibility of client-supplied selector abuse | **None** — wrapper never accepts a tenant/slug argument from `FormData`; it is hardcoded to call `resolvePreviewTenantContext()` | Real, must be carefully guarded — an added `tenantSlug` form field is exactly the kind of client input Section 3 says must never be trusted; would need its own re-validation discipline on every call site | Low if the split is done correctly, but the refactor itself is the highest-risk change here |
| Duplication | Some — 10 small wrapper functions, each ~15–25 lines of resolve-then-delegate boilerplate | None — logic lives once | Low — shared core avoids duplicating service-layer call, but resolver boilerplate still appears at each of the two entry points |
| Testability | **High** — each wrapper is a small, independently unit-testable function with a fixed, fully-mocked dependency graph | Medium — existing action tests must now cover both branches (with/without preview param) for every action | Medium — depends on how cleanly the core/wrapper boundary is drawn |
| Server Action manifest exposure | Wrappers are new, separately-named exports (e.g. `previewUpsertEmployee`) — trivially allowlistable by name in the verifier (Section 5) | The exact same exported function name (`upsertEmployee`) is now reachable from both dashboard and preview routes — the manifest-based verifier can no longer distinguish "preview registered `upsertEmployee`" (bad) from "preview registered `previewUpsertEmployee`" (expected), weakening Section 5's allowlist check | Depends on entry-point naming, but requires care to keep the same distinguishability property Option A gets for free |
| Ease of removing/evolving preview-specific code | **Highest** — delete the wrapper file, nothing else changes | Low — removing the preview branch means editing every one of the 10 existing actions again | Medium |
| Compatibility with future `app.oruwa.jp` | Production shell can reuse the *same* service-layer functions the dashboard already uses (no `mame-to-cha`-slug-specific code path needed in production, satisfying ADR 0010 Section C's prohibition on tenant-slug-literal branching) — the preview wrapper pattern is not itself reused for production, since production resolves tenant context the same way the dashboard already does | Same production compatibility, but the added `tenantSlug` param becomes permanent surface on every dashboard action forever, even once preview is retired | Same production compatibility; higher one-time refactor cost for the same eventual state |

**Rationale:** Option A matches the task's stated preference, matches the
architecture plan's own G2/G3 framing ("a shared helper... used by every
preview Server Action" delegating to "the existing service-layer function
unchanged"), and — critically — is the only option that keeps the Section 5
manifest-based verifier's allowlist check meaningful by construction: a
preview wrapper has its own exported name, distinct from the dashboard
action, so "does this preview route's manifest entry point at a
preview-specific function" is a simple, robust string check. Option B's
shared exported-function-name surface defeats that check outright (the
verifier would see `upsertEmployee` registered as a worker for both a
dashboard route and a preview route and have no way to tell whether that
`upsertEmployee` call resolved tenant context strictly or leniently, without
executing it). Option A is recommended.

## 5. Action registration boundary — verifier evolution

**Current state:** `apps/web/scripts/verify-preview-no-server-actions.mjs`
is a **B1-mode, zero-tolerance** verifier: it fails if *any* Server Action
worker is registered for any `app/%5Fclient-preview/mame-to-cha*` route, and
positively confirms the two dashboard mutation routes still register at
least one Workforce mutation action (the "positive control" in
`verify-preview-no-server-actions.mjs:41-49`/`111-121`).

**Plan for B2:** replace the zero-tolerance check with a **role-aware
allowlist verifier** (rename to `verify-preview-server-actions.mjs`,
`verify:preview-actions` package script — the `-no-` in the current name
becomes actively misleading once B2 ships actions on purpose). Two modes,
selected by route:

- `app/%5Fclient-preview/mame-to-cha/manager/page` (**B2a**) — workers must
  be an exact subset of:

  ```text
  previewUpsertEmployee
  previewSetEmployeeActive
  previewCreateShiftAssignment
  previewUpdateShiftAssignment
  previewRunAutoDistribution
  previewPublishSchedule
  previewDecideCorrectionRequest
  ```

  Any other action — including any dashboard action (e.g. `upsertEmployee`
  without the `preview` prefix), any LINE-binding action
  (`bindEmployeeLineUser`/`unbindEmployeeLineUser`), or any exported name
  not in this exact list — registered as a worker for this route is a
  build failure.

- `app/%5Fclient-preview/mame-to-cha/staff/page` (**B2b**) — workers must
  be an exact subset of:

  ```text
  previewSubmitShiftPreference
  previewSubmitWorkReport
  previewSubmitCorrectionRequest
  ```

  Same failure rule: any manager-only wrapper, any dashboard action, any
  LINE action, or any unlisted name registered as a worker for this route
  is a build failure.

- `app/%5Fclient-preview/mame-to-cha/page`,
  `app/%5Fclient-preview/mame-to-cha/recipes/page`,
  `app/%5Fclient-preview/mame-to-cha/recipes/[recipeId]/page`: **zero**
  Server Actions allowed — same as B1, unchanged (root and recipes routes
  stay read-only for the entire B2 scope, both B2a and B2b).
- The existing positive-control check (dashboard routes must still register
  a dashboard mutation action) is preserved unchanged.
- New negative check, applied to **every** preview route regardless of its
  allowlist: no `filename` matching any of
  `staff-actions.ts`/`schedule-actions.ts`/`attendance-actions.ts`
  (dashboard modules) or `employee-line-links.ts`
  (`bindEmployeeLineUser`/`unbindEmployeeLineUser`) may appear as a worker
  — this is what makes "no raw dashboard action module is registered as a
  worker for preview routes" and "no LINE actions registered for preview"
  build-verified facts, not just naming-convention hopes, independent of
  and in addition to the exact-name allowlist check above.
- New negative check: any worker `exportedName` registered for a preview
  route that is not literally one of the two allowlists above (for that
  route) or already covered by the "dashboard module"/"LINE action"
  negative checks is itself a failure — i.e. the allowlists above are
  closed sets, not "at least these," so a typo'd or newly-added,
  not-yet-allowlisted wrapper name fails loud rather than silently passing.

This keeps a B1-equivalent mode reachable (an allowlist of length zero for
every preview route is exactly B1's check), so nothing about the B1
guarantee is lost — it becomes a special case of the more general B2
verifier rather than a separate script to maintain.

## 6. Manager preview write scope — recommend splitting B2a / B2b

Candidate manager scope (7 wrappers): employee create/edit, employee
activate/deactivate, shift create/update/unassign, auto-distribution,
publish schedule, correction approve/reject.

**Recommend B2a = manager writes only, B2b = staff writes only**, shipped as
two separately-approved slices, for reasons specific to *this* codebase:

- The manager preview UI (`PreviewManagerView`,
  `apps/web/src/lib/preview/manager-view.tsx`) is the larger of the two
  action-free display components (383 lines: staff table, weekly grid,
  shift-type table, preferences table, correction-request table with
  pending/decided sub-sections) and needs the most new interactive surface
  (staff form, shift-cell editor, auto-distribution trigger, publish
  control, correction decision buttons) — the highest UI-refactor risk in
  the whole B2 scope (task Section 6's explicit smaller-slice trigger).
- The manager scope also contains the two highest-blast-radius mutations:
  `runAutoDistribution` (bulk insert across every staff member/shift type in
  a period) and `publishSchedule` (bulk update across a date range) — both
  already documented in `schedule-actions.ts` as relying entirely on
  "attempt, then map" RLS enforcement with no pre-check, which is
  acceptable in the existing, already-shipped, cookie-scoped dashboard
  context but deserves its own isolated acceptance/rollback window when
  newly exposed through the preview boundary for the first time.
- The staff scope (Section 7) is three simple, self-scoped, INSERT-mostly
  mutations against a materially smaller, already-simpler
  `PreviewStaffView` (298 lines, no bulk operations) — a naturally smaller,
  lower-risk slice that can ship and be verified independently.

Recommended order: **B2a (manager) first**, since client acceptance
walkthroughs typically start with the manager persona reviewing/publishing a
schedule before staff start submitting against it; B2b (staff) follows once
B2a's verifier/UI pattern is proven.

## 7. Staff preview write scope

Candidate scope (3 wrappers): `previewSubmitShiftPreference`,
`previewSubmitWorkReport`, `previewSubmitCorrectionRequest`.

Required checks, all already structurally available from existing helpers:

- Staff Auth user bound to exactly one employee: `getMyWorkforceStaffProfile`
  already restates the `wf_employees_self_read` RLS predicate
  (`user_id = core.current_user_id()`) — `profile.staffId` is never
  client-suppliable, and none of the three service-layer calls
  (`submitShiftPreferenceWrite`, `submitWorkReportWrite`,
  `submitCorrectionRequestWrite`) accept an `employeeId` from `FormData`
  today; the existing dashboard actions already only pass
  `myProfile.data.staffId`. The preview wrappers must preserve this exactly
  — an employee id must never be added as an accepted form field.
- Employee tenant matches preview tenant: guaranteed by
  `getMyWorkforceStaffProfile(supabase, tenantId)`'s own `tenant_id` filter,
  called with the strictly-resolved preview `tenantId`.
- Employee location active + belongs to tenant: `resolveStaffLocation`
  (Section 2) — reused unchanged, called before delegating to the service
  layer, exactly like the read path.
- Staff cannot select another employee ID: enforced by construction (no
  wrapper accepts an `employeeId` field at all).
- Manager-only actions unreachable by staff: enforced structurally by
  Section 5's route-scoped allowlist (the staff route's worker allowlist
  never includes `previewDecideCorrectionRequest`,
  `previewUpsertEmployee`, etc.) plus RLS as the final backstop.

## 8. Location integrity — confirmed gap, no migration proposed

Every `core.locations`-referencing FK in `0009_workforce.sql` is a bare
`references core.locations(id)` (lines 23, 39, 55, 70, 86) — **not** a
composite `(tenant_id, location_id)` foreign key. `core.has_permission(p_tenant_id, p_permission, p_location_id)`
(`0006_helpers.sql`, quoted in the architecture plan Section W3) only checks
that the caller's `role_assignments` row for `p_tenant_id` has a matching
`location_id` (or `null`, meaning tenant-wide) — it does **not** verify that
`p_location_id` itself belongs to `p_tenant_id`'s `core.locations` rows.

**Consequence:** at the database level, nothing prevents an INSERT/UPDATE
whose `tenant_id` is correctly `mame-to-cha` but whose `location_id` is a
valid UUID belonging to a *different* tenant's `core.locations` row, as long
as the caller's role assignment for `mame-to-cha` grants a tenant-wide
(`location_id is null`) permission. This is a genuine schema-level gap
(documented here per task Section 14's instruction; **no migration is
proposed or implemented by this document**).

**Current app-level mitigation, mutation by mutation:**

| Mutation | App-level location check today |
| --- | --- |
| `createShiftAssignment`, `updateShiftAssignment`, `publishSchedule`, `runAutoDistribution` | **Present** — `schedule-actions.ts` calls `listTenantLocations(supabase)` and requires `l.tenantId === tenantId && l.locationId === input.locationId`, `not_found` otherwise, before calling the service layer |
| `submitShiftPreference`, `submitWorkReport`, `submitCorrectionRequest` | **Not applicable / stronger** — location is never client-supplied; it is inferred from `getMyWorkforceStaffProfile`, itself tenant-filtered |
| `upsertEmployee` | **Absent** — `staff-actions.ts:38-45` passes `input.locationId` (raw `FormData`) straight to `upsertWorkforceEmployee` with no tenant-ownership check. This is a **pre-existing gap in the dashboard action itself**, not introduced by preview. |

**B2 plan — single, current rule (Section 8.1 is the sole authority below;
no earlier draft of this paragraph remains in force):** no B2 wrapper reads
or trusts a `locationId` value from `FormData`, for any mutation, including
`previewUpsertEmployee`. B2a wrappers use the single server-resolved active
location (`resolveManagerLocation`); B2b wrappers use the authenticated
employee profile's already-validated location (`resolveStaffLocation`). An
earlier draft of this paragraph suggested `previewUpsertEmployee` should
validate a client-supplied `input.locationId` against `listTenantLocations`
— that would still be trusting a client-supplied value (just a validated
one) and is superseded; Section 8.1 below is correct and is the only rule
this document specifies: the wrapper never reads `input.locationId` at all,
it substitutes the server-resolved location unconditionally. See Section
8.1 for the exact mechanism.

### 8.1 Server-owned location contract (referenced from Section 3.1 step 7; supersedes the pre-Section-8.1 paragraph above, which is corrected below)

For the `mame-to-cha` acceptance tenant, every B2a manager wrapper requires
**exactly one active `core.locations` row** — `resolveManagerLocation`
(Section 2) already fails closed (`none`/`ambiguous`) rather than guessing.
Given that invariant, **no B2 wrapper accepts or trusts a `locationId` value
from `FormData` at all** — this is stricter than the existing dashboard
actions (which do accept and re-validate a client-supplied `locationId`,
Section 1.1), and is possible only because a single-location acceptance
tenant makes "the location" a server-derivable fact, not a client choice.
If a `locationId` field is present in a submitted `FormData` for any B2
wrapper, it is **ignored**, never read, never passed to `parse*Input`, and
never reaches the service-layer call — the wrapper always substitutes
`resolveManagerLocation(...).location.locationId` (B2a) or
`resolveStaffLocation(profile, ...).locationId` (B2b, already true today,
Section 7) instead.

**Employee create/edit (`previewUpsertEmployee`):**

- Use the server-resolved active location
  (`resolveManagerLocation(tenantLocations).location.locationId`) as
  `UpsertWorkforceEmployeeInput.locationId` — never `input.locationId` from
  `FormData`.
- This closes the pre-existing dashboard gap identified above (Section
  1.1: `staff-actions.ts:38-45` passes raw `FormData.locationId` unchecked)
  *for the preview wrapper only* — the dashboard action itself is
  unchanged, per this plan's Option A decision.
- No migration or `upsertWorkforceEmployee` signature change is required:
  the wrapper simply never forwards a client value for this field.
- **Target-identifier verification (Section 3.0):** when `id` (the target
  employee to edit) is present, it is a legitimate submitted field — but
  before calling `upsertWorkforceEmployee(supabase, tenantId, { id, ... })`,
  the wrapper must confirm the target employee exists, belongs to
  `mame-to-cha`, and belongs to the server-resolved active location, via
  `listWorkforceStaffDirectory(supabase, tenantId)` filtered to
  `staffId === input.id && locationId === resolvedLocationId`; no match →
  `not_found`, before the service-layer call (a valid UUID alone is
  insufficient). `previewSetEmployeeActive`'s target `staffId` requires the
  identical check before calling `setWorkforceEmployeeActive`.

**Schedule mutations (`previewCreateShiftAssignment`, `previewUpdateShiftAssignment`, `previewRunAutoDistribution`, `previewPublishSchedule`):**

- `locationId` is always the server-resolved active location, exactly as
  above — never `input.locationId`. (`updateShiftAssignmentWrite`'s own
  signature takes no `locationId` at all today — the dashboard action only
  used the submitted `locationId` to resolve a timezone for local→UTC
  conversion, not as a security check; the wrapper resolves the same
  timezone from the server-resolved location instead, so no behavior is
  lost.)
- "A valid UUID alone is insufficient" — `employeeId` and `shiftTypeId`
  must be independently verified to belong to the strict preview tenant
  (and, for `employeeId`, to the server-resolved active location) before
  the service-layer call, not merely be well-formed UUIDs relying on a
  `23503` foreign-key rejection after the fact. **This is cleanly
  implementable with existing, already-imported service-layer reads — no
  new service-layer function or migration is required:**
  - `employeeId` → `listWorkforceStaffDirectory(supabase, tenantId)` (no
    PII decryption needed, already imported by `schedule-actions.ts`
    today), filtered to `staffId === input.employeeId && locationId === resolvedLocationId`;
    no match → `not_found`.
  - `shiftTypeId` (when non-null) → `listWorkforceShiftTypes(supabase, tenantId)`
    (already imported by `schedule-actions.ts` today), filtered to
    `shiftTypeId === input.shiftTypeId`; no match → `not_found`.
  - For `previewUpdateShiftAssignment` specifically: the *target*
    `assignmentId`'s tenant scoping is already enforced by
    `updateShiftAssignmentWrite`'s own `.eq('tenant_id', tenantId)` filter
    (Section 1.1) plus RLS — a foreign-tenant assignment id is already
    unreachable. **Its location scoping is a required, independent check —
    not an inference from "the tenant currently has exactly one active
    location."** A tenant's `core.locations` table can still contain
    inactive or historical location rows (`resolveManagerLocation`,
    Section 8, only requires exactly one *active* row; it says nothing
    about rows that are `is_active = false`), and an existing assignment
    could belong to one of those, or a historically-different active
    location, without exists-as-a-second-*active*-location ever being
    true. The single-active-location invariant bounds `location_id`
    *going forward* on inserts (Section 8.1's "server-owned location
    contract" for `previewCreateShiftAssignment`), but says nothing about
    the location of a *pre-existing* row being targeted by an update — so
    it must be checked, not assumed. Before calling
    `updateShiftAssignmentWrite`, the wrapper fetches
    `listShiftAssignments(supabase, tenantId, {})` (no date bounds — the
    existing `ListShiftAssignmentsOptions.fromIso`/`toIsoExclusive` are
    both optional, `shift-assignments.ts:62-67`/`74-83`, so omitting them
    returns every assignment row for the tenant, unbounded by date) and
    finds the row with `assignmentId === input.assignmentId`; no match →
    `not_found`. If found, the wrapper additionally requires
    `locationId === resolvedLocationId`; a mismatch (an assignment that
    exists, belongs to the tenant, but sits at an inactive/historical/
    different location) also → `not_found`, never silently allowed
    through. **This is verifiable with the existing read contract** —
    `WorkforceShiftAssignment` already exposes both `assignmentId` and
    `locationId` (`shift-assignments.ts:25-39`) — no new service-layer
    function or migration is required; the only cost is an unbounded read
    per update call, acceptable at acceptance-tenant scale and not a
    reason to skip the check.

**Correction request decision (`previewDecideCorrectionRequest`):**

- `correctionRequestId` (the service layer's `requestId` parameter) is a
  legitimate target-record identifier (Section 3.0) — the manager must
  name which pending request is being approved/rejected.
- **This mutation is location-scoped, not tenant-scoped only — both the
  permission check and the target-record check.** `wf_shift_requests_write`
  (`0009_workforce.sql:142-145`) is
  `using (core.has_permission(tenant_id, 'workforce.request.manage', location_id))` —
  it passes the target row's own `location_id` column, identical
  semantics to every other workforce write policy (Section 3.1a). The
  Section 3.1 step 6 `api.has_permission` pre-check for this wrapper
  therefore passes `p_location_id: resolvedLocationId` (Section 3.1a).
  Independently, the target-record check (Section 3.0 items 2–3) also
  requires location verification, not tenant verification alone:
  `decideCorrectionRequestWrite`'s own `.eq('tenant_id', tenantId).eq('request_id', requestId)`
  filter (`shift-requests.ts:212-230`) enforces "exists and belongs to the
  strict `mame-to-cha` tenant" as a property of the query itself — a
  foreign-tenant or nonexistent `requestId` returns `not_found` — **but
  this filter alone does not check the request's `location_id`, and must
  not be relied on as if it did.**
- Before calling `decideCorrectionRequestWrite`, the wrapper fetches
  `listShiftRequestsForManager(supabase, tenantId, { kind: 'correction' })`
  (already the manager-facing read used by the preview manager page for
  the same queue, `shift-requests.ts:88-112`) and finds the row with
  `requestId === input.correctionRequestId`; no match → `not_found`
  (covers exists + tenant, restating what the update filter already
  guarantees, but resolved *before* the mutating call rather than only
  discovered by its zero-row result). If found, the wrapper additionally
  requires `locationId === resolvedLocationId`; a mismatch → `not_found`,
  never silently allowed through — this is the check the update filter by
  itself cannot provide. **This is verifiable with the existing read
  contract** — `WorkforceShiftRequest` already exposes both `requestId`
  and `locationId` (`shift-requests.ts:24-39`) — no new service-layer
  function or migration is required.

**Staff mutations (`previewSubmitShiftPreference`, `previewSubmitWorkReport`, `previewSubmitCorrectionRequest`):**

- Location is derived exclusively from the authenticated employee profile
  (`getMyWorkforceStaffProfile(supabase, tenantId).data.locationId`,
  already resolved/verified via `resolveStaffLocation`, Section 3.1 step
  6) — never from `FormData`. This is unchanged from the existing
  dashboard staff actions' own convention (Section 1.1), which already
  never accepts a location field for these three mutations.
- The staff form must never expose an employee-selector or
  location-selector control at all (not merely validate against one) —
  Section 12's preview-specific form components must be built without such
  a field, so there is no client-side affordance that could even attempt
  to submit another employee's or location's id.

**Conclusion — no B2a no-go on this item:** every location/employee/
shift-type/assignment/correction-request validation required above
(including the assignment-location and correction-request-location checks,
both now required unconditionally, not deferred as a future-multi-location
concern) is achievable by composing existing, already-imported
service-layer read functions
(`listTenantLocations`/`listWorkforceStaffDirectory`/`listWorkforceShiftTypes`/
`listShiftAssignments`/`listShiftRequestsForManager`) inside the new
wrapper files — no new exported service-layer function, no signature
change to any existing service-layer function, and no migration is
required for B2a as scoped. Both `WorkforceShiftAssignment` and
`WorkforceShiftRequest` already expose the `locationId` field the checks
need; the only cost of composing them this way is an unbounded (not
date/kind-narrowed to the minimum) read per mutation call, which is an
efficiency note, not a correctness or scope gap.

## 9. Module entitlement integrity

Every preview wrapper calls `resolvePreviewWorkforceModule(supabase, tenantId)`
(Section 2) immediately after tenant resolution and before any location
resolution or service-layer call — never relying on the page having loaded
successfully earlier, a hidden field, or cached browser state, matching
architecture plan Section W4's already-decided contract. A `disabled` or
non-`enabled` result short-circuits to the neutral module-unavailable error
(Section 11) before any service-layer function runs.

## 10. Revalidation and redirect paths

Confirmed (Section 1.1): **no existing Workforce action calls
`revalidatePath`** — the entire dashboard mutation UI relies on client-side
`router.refresh()` after a successful `useTransition`-wrapped action call.
There is therefore no existing `revalidatePath`-over-rewrite behavior to
reconcile.

**Plan:** preview write wrappers follow the same convention — **no
`revalidatePath` call**, no `redirect()` call. The preview manager/staff
client components (Section 12) call the wrapper inside `useTransition` and
call `router.refresh()` on success, exactly like the dashboard pattern. This
sidesteps the open question of whether `revalidatePath('/mame-to-cha/manager')`
(the public, rewritten path) would correctly invalidate the
`/_client-preview/mame-to-cha/manager` route's render cache under Next.js
15's `beforeFiles` rewrite — since the existing convention needs no
`revalidatePath` at all, B2 does not need to resolve that question
speculatively. If a future slice wants server-driven revalidation, it must
target the **public** path only (`/mame-to-cha/manager`, `/mame-to-cha/staff`)
per the task's constraint, and must be verified empirically against a real
`beforeFiles`-rewritten request before being relied upon — not assumed.

## 11. Error contract

New shared preview write result type (e.g.
`apps/web/src/lib/preview/write-result.ts`), extending the existing
`PreviewTenantResult`/`WorkforceWriteResult` pattern with the same
"deliberately coarser than a raw RLS/Postgres error" philosophy already used
by `PreviewTenantResult` (`tenant.ts:12-23`):

| Status | Japanese message (neutral, no UUIDs/paths/policy names) | Maps from |
| --- | --- | --- |
| `not_authenticated` | サインインが必要です。 | `resolvePreviewTenantContext` → `not_authenticated` |
| `no_access` | この操作を行う権限がありません。 | `resolvePreviewTenantContext` → `no_access` (covers no membership / wrong role at the RLS layer, indistinguishable by design) |
| `module_disabled` | ワークフォース機能はこのワークスペースで有効になっていません。 | `resolvePreviewWorkforceModule` → `disabled` |
| `location_blocked` | 店舗の設定を確認できません。担当者にお問い合わせください。 | `resolveManagerLocation` → `none`/`ambiguous`, or `resolveStaffLocation` → `null` |
| `no_profile` | このアカウントに紐づくスタッフ情報がありません。 | `getMyWorkforceStaffProfile` → `null` |
| `invalid_input` | 入力内容を確認してください。 | `parse*Input` → `null`/falsy |
| `not_found` | 対象の情報が見つかりません。 | Service-layer `not_found` |
| `duplicate` | すでに同じ内容が登録されています。 | Service-layer `duplicate` (23505) |
| `unexpected_error` | 一時的な問題が発生しました。しばらくしてからもう一度お試しください。 | Any `config_error`/`unexpected_error`/uncaught Postgres error |

No status ever includes a tenant UUID, employee UUID, internal path
(`/_client-preview/...`, `/dashboard/...`), RLS policy name, or raw
Postgres/PostgREST error text — every wrapper maps the existing
`WorkforceWriteResult`/`TenantAccessResult` statuses to this fixed table,
the same discipline `apps/web/src/lib/preview/states.tsx` already applies to
read-side errors.

## 12. UI integration

`PreviewManagerView`/`PreviewStaffView` stay as the **read-only display**
layer (unchanged file contents for the parts of the UI Section 6/7 do not
touch). New, preview-specific interactive pieces are added *alongside* them,
never by importing the dashboard's `ManagerDashboardClient`/
`StaffDashboardClient` wholesale (preserving the B1 "shared
UI/domain/data-loader level only" principle, architecture plan Decision 2).

**Files expected to be created (B2a, manager):**

- `apps/web/src/lib/preview/actions/staff-actions.ts` — `previewUpsertEmployee`, `previewSetEmployeeActive`
- `apps/web/src/lib/preview/actions/schedule-actions.ts` — `previewCreateShiftAssignment`, `previewUpdateShiftAssignment`, `previewRunAutoDistribution`, `previewPublishSchedule`
- `apps/web/src/lib/preview/actions/attendance-actions.ts` — `previewDecideCorrectionRequest`
- `apps/web/src/lib/preview/write-result.ts` — shared error-mapping (Section 11)
- `apps/web/src/lib/preview/actions/authorize.ts` — shared Section 3.1
  helper(s): `requirePreviewManagerPermission(supabase, tenantId, locationId, permission)`
  (wraps the `api.has_permission` RPC call + `no_access` mapping, called
  after location resolution per Section 3.1 step 6/3.1a, one call site
  per B2a wrapper) and
  `requirePreviewStaffBinding(supabase, tenantId, tenantLocations)` (wraps
  `getMyWorkforceStaffProfile` + `resolveStaffLocation` + the `no_profile`
  mapping, Section 3.1 steps 5–6 for B2b) — kept as one shared file so the
  permission-key mapping table (Section 3.1) and the binding-resolution
  sequence each exist in exactly one place, not duplicated across 10
  wrapper functions
- `apps/web/src/lib/preview/manager-view-interactive.tsx` (or a small set of
  `'use client'` islands, e.g. `preview-staff-form.tsx`,
  `preview-shift-cell-editor.tsx`, `preview-correction-decision-buttons.tsx`)
  — new preview-specific client components, modeled on but not importing
  `StaffForm`/`ShiftCellEditor`
- `apps/web/src/app/%5Fclient-preview/mame-to-cha/manager/page.tsx` — updated
  to pass write-capable props into the new interactive components

**Files expected to be created (B2b, staff):**

- `apps/web/src/lib/preview/actions/schedule-actions.ts` (extended) —
  `previewSubmitShiftPreference`
- `apps/web/src/lib/preview/actions/attendance-actions.ts` (extended) —
  `previewSubmitWorkReport`, `previewSubmitCorrectionRequest`
- `apps/web/src/lib/preview/staff-view-interactive.tsx` or per-form
  `'use client'` islands (`preview-shift-preference-form.tsx`,
  `preview-work-report-form.tsx`, `preview-correction-request-form.tsx`)
- `apps/web/src/app/%5Fclient-preview/mame-to-cha/staff/page.tsx` — updated

**Files expected to be modified (both slices):**

- `apps/web/scripts/verify-preview-no-server-actions.mjs` → renamed/rewritten
  per Section 5, plus its `package.json` script name
- `apps/web/src/lib/preview/preview-action-free.test.ts` → renamed/rewritten
  to a role-aware allowlist test (it currently asserts zero mutation
  imports for every preview file, which must change to "only the
  allowlisted preview wrapper imports")

**Not modified:** `staff-actions.ts`, `schedule-actions.ts`,
`attendance-actions.ts`, `manager-dashboard-client.tsx`,
`staff-dashboard-client.tsx`, any dashboard form component, any service-layer
file in `apps/web/src/lib/workforce/` (Option A requires zero changes to any
of these — Section 4).

## 13. Tests required

All tests follow this repo's existing `node:test` conventions (see
`tenant.test.ts`, `module-guard.test.ts`, `location.test.ts`,
`preview-action-free.test.ts`) — pure-function/result-mapping tests run
under plain `node:test`; the manifest-based registration check runs
post-build via the verifier script, not `node:test`.

**Tenant isolation** (extends architecture plan Section O rows, applied to
writes): active-tenant cookie pointing at another own tenant does not change
which tenant a preview write targets; no `mame-to-cha` membership blocks
every preview wrapper with `no_access`; `mame-to-cha-tokyo` (seeded sales
demo) membership alone does not satisfy `selectPreviewMembership`; an
arbitrary tenant slug/UUID cannot be supplied to any wrapper (wrappers
accept no such parameter, by construction — assert this via the same
source-text import/signature check pattern as
`preview-action-free.test.ts`).

**Module entitlement:** Workforce enabled → wrapper proceeds past the module
check; disabled → `module_disabled` before any service-layer call; missing
row → same (`isModuleEnabled` treats missing/disabled as equivalent,
`module-guard.ts:11-17`); another tenant's enabled Workforce module does not
satisfy the check for `mame-to-cha` (scoped `tenantId` equality in
`isModuleEnabled`).

**Location:** manager with exactly one active location succeeds; zero
blocks (`location_blocked`); 2+ blocks (`location_blocked`, no selector in
B2); a `locationId` field present in submitted `FormData` for any B2
wrapper is proven to be ignored (assert the service-layer call always
receives the server-resolved location, never the submitted one — Section
8.1); a foreign-tenant or wrong-location `employeeId`/`shiftTypeId`
supplied to a schedule wrapper blocks with `not_found` before the
service-layer call (Section 8.1); an `assignmentId` that exists, belongs
to the strict tenant, but whose `locationId` is an inactive or otherwise
non-resolved location blocks `previewUpdateShiftAssignment` with
`not_found` before the service-layer call — do not construct this test
by relying on "the tenant only has one active location," seed a second,
inactive `core.locations` row with its own assignment to prove the check
is real (Section 8.1); a `correctionRequestId` that exists, belongs to the
strict tenant, but whose `locationId` does not match the resolved active
location blocks `previewDecideCorrectionRequest` with `not_found` before
the service-layer call, independent of and in addition to the
`api.has_permission` location-scoped check (Section 8.1); staff cannot
submit for another employee/location (no such parameter exists to
supply).

**Role/capability:** a staff/employee-role membership calling any B2a
wrapper is rejected **at Section 3.1 step 6** (the `api.has_permission` RPC
pre-check returns `false`, mapped to `no_access`) — assert this happens
*before* the service-layer function is invoked (e.g. via a spy/mock on the
service-layer import), not merely that the eventual result is a failure;
also assert step 6 always runs *after* step 5 (location resolution) so
`p_location_id` is never `undefined` when the RPC is called (Section 3.1a);
staff wrapper cannot reach a manager-only mutation (no staff-route wrapper
exists for it, Section 5's exact allowlist); `previewDecideCorrectionRequest`
requires `workforce.request.manage` with a location-scoped `p_location_id`
(Section 3.1a's mapping table — corrected from an earlier tenant-scoped-only
claim); every
staff submission requires the caller's own employee binding (Section 7);
RLS is also asserted as a second, independent line of defense (a stubbed
`api.has_permission` RPC returning `true` for a caller whose real RLS grant
would reject the write must still fail at the service-layer call — the
app-level check must never be treated as sufficient on its own).

**Action registration:** manager preview route registers only the B2a
allowlist; staff preview route registers only the B2b allowlist; recipes
route registers none; no dashboard action file (`staff-actions.ts`/
`schedule-actions.ts`/`attendance-actions.ts`/`employee-line-links.ts`) is a
worker for any preview route; no LINE action is a worker for any preview
route. Both the static source-text test (extended
`preview-action-free.test.ts`) and the post-build manifest verifier
(Section 5) must pass.

**Regression:** existing dashboard action `node:test` coverage (if any)
remains green, unmodified; `/mame-to-cha` and `/demo/cafe` public demo
pages unchanged; `sanitizePreviewReturnTo` behavior unchanged
(`return-to.test.ts`); B1 strict-read behavior (`tenant.test.ts`,
`module-guard.test.ts`, `location.test.ts`) unchanged.

## 14. Migration requirement — none

**No migration is proposed.** Section 8 documents one confirmed, pre-existing
schema-level gap (no composite `(tenant_id, location_id)` FK on any
`workforce.*` table referencing `core.locations`), but:

- it already exists on the dashboard write path today, unmodified by this
  plan;
- it is mitigated at the app layer for every mutation except
  `upsertEmployee`, and B2 closes that one remaining case at the preview
  wrapper level (Section 8), not via schema change;
- closing it at the schema/RLS level (e.g. a composite FK, or extending
  `core.has_permission`/a new `core.is_module_enabled`-style helper per
  architecture plan Section W5) is explicitly flagged there as a separate,
  later, platform-wide hardening track requiring its own design and
  approval — bundling it into this preview-writes slice would mix an
  unrelated, larger-blast-radius change into a client-acceptance-scoped
  slice.

This finding should be tracked as a follow-up item (its own migration plan
and approval gate), separate from B2.

## 15. Verification

### Local verification (after implementation, not run by this document)

```powershell
pnpm --filter @line-os/web test
pnpm --filter @line-os/web typecheck
pnpm --filter @line-os/web lint
pnpm --filter @line-os/web build
pnpm --filter @line-os/web verify:preview-actions   # renamed script, Section 5

git diff --check
git status --short
git diff --stat
```

### Security checks

```powershell
git grep -n -I -E "service_role|SUPABASE_SERVICE_ROLE_KEY" -- apps/web
git grep -n -I -E "NEXT_PUBLIC_.*SERVICE|serviceRole" -- apps/web
git status --short -- supabase packages/db
```

### Browser smoke (against a local/dev environment once B2 is implemented)

- Sign in as a manager-role Auth user with a `mame-to-cha` membership; reach
  `/mame-to-cha/manager`; perform one of each B2a mutation; confirm the UI
  updates via `router.refresh()` and no navigation to `/_client-preview/...`
  or `/dashboard/...` ever occurs.
- Set `lbo_active_tenant_id` to a different, valid, own tenant; repeat the
  above; confirm the write still lands against `mame-to-cha`, never the
  cookie tenant.
- Sign in as a staff-role Auth user bound to a `workforce.employees` row;
  reach `/mame-to-cha/staff`; perform one of each B2b mutation; confirm no
  manager-only control is present or reachable.
- Attempt a direct `Next-Action` POST to a preview route for a
  non-allowlisted action name (e.g. the raw dashboard `upsertEmployee`
  action id) and confirm it is not a registered worker for that route
  (this is the manifest verifier's exact guarantee, exercised manually as a
  spot check).

### Rollback

Because Option A adds new files and does not modify any existing
dashboard action/service-layer file, rollback is a revert of the B2 commits
(new preview action/view files, the verifier rewrite, and the two
`page.tsx` updates) with zero risk to `/dashboard/workforce/*` behavior —
there is nothing to "undo" in shared code, since none was changed.

### No-go conditions

- The manifest verifier (Section 5) cannot be made to reliably distinguish
  preview wrapper workers from dashboard action workers for any route, or
  cannot enforce the exact-name allowlists (Section 5) as closed sets.
- The Section 3.1 step 6 permission pre-check (`api.has_permission` RPC)
  cannot be wired to run *after* step 5's location resolution and *before*
  every B2a service-layer call for some mutation (Section 3.1a requires
  every B2a wrapper to resolve its active location before calling
  `api.has_permission`, since all seven B2a permissions are location-scoped
  by their actual RLS policy — Section 3.1a), or a staff/employee-role
  membership is found to reach a manager-only service-layer call in any
  code path.
- `previewUpsertEmployee`'s added location-ownership check, or any of the
  Section 8.1 employee/shift-type/assignment-location/correction-request-
  location validations (including the `previewUpdateShiftAssignment` and
  `previewDecideCorrectionRequest` target-location checks required above),
  turn out to require a new exported service-layer function or a
  signature change to an existing one (Section 8.1's current analysis
  concludes this is not the case for B2a as scoped — this condition
  exists only to catch a future finding that contradicts that analysis
  during implementation).
- Any B2a/B2b UI island turns out to require importing
  `ManagerDashboardClient`/`StaffDashboardClient` (or their exported
  sub-components) directly to avoid unacceptable duplication — this would
  reopen the exact structural risk B1's action-free design was built to
  close, and must stop the slice for a redesign rather than proceed.
- Any B2a or B2b form is found to expose (even if currently unused) a
  `tenantId`, `tenantSlug`, `role`, permission-name, or module-enabled-flag
  field, or a `locationId` field used **as authority** (i.e. capable of
  overriding the server-resolved tenant/location) — Section 3.0 requires
  this surface not to exist, not merely to be validated away, for both
  B2a and B2b.
- Any B2b staff form is found to expose an `employeeId`, `staffId`, or any
  field that would let the caller assert another user's identity or
  another location — Section 3.0/3.1 (B2b step 7) require this surface not
  to exist at all for B2b; there is no legitimate target-record identifier
  for a B2b form to submit.
- Any B2a manager form's target-record identifier (`employeeId`/`staffId`,
  `assignmentId`, `shiftTypeId`, `correctionRequestId`) is found to reach
  its service-layer call **without** the Section 3.0/8.1 exists +
  tenant-membership + location-membership (where applicable) + permission
  verification first — i.e. B2a target IDs are permitted fields, but only
  with strict server-side tenant/location validation attached; an
  unvalidated target ID reaching the service layer is the failure, not the
  field's presence.
- Local `verify:preview-actions` / `test` / `typecheck` / `lint` / `build`
  do not all pass before requesting Cloud/production follow-up work.

### B2a / B2b split — recommendation

**Split.** B2a (manager writes: `previewUpsertEmployee`,
`previewSetEmployeeActive`, `previewCreateShiftAssignment`,
`previewUpdateShiftAssignment`, `previewRunAutoDistribution`,
`previewPublishSchedule`, `previewDecideCorrectionRequest`) ships first;
B2b (staff writes: `previewSubmitShiftPreference`, `previewSubmitWorkReport`,
`previewSubmitCorrectionRequest`) ships second. Rationale in Section 6.

`docs/product/mvp-roadmap.md` should be updated, when B2 is actually
scheduled, to reflect the B2a/B2b split — not by this document, which
proposes but does not schedule the split.

## 16. Scope protection — deferred client requests

Recorded explicitly, per ADR 0010's mandatory classification process
(Section D) and its "relationship to Mame To Cha" guidance (Section I):

- Any additional client request beyond the mutation set already enumerated
  in Sections 1, 6, and 7 of this document (the ten Section 1 mutations,
  split B2a/B2b) — including any request raised during or after the B2a/B2b
  acceptance walkthrough — is **deferred until after the current release**.
- It is **not part of B2a, B2b, C, D, E, or F** (the implementation slices
  defined in the architecture plan's Section P) as currently scoped by this
  document or the architecture plan.
- It will be **classified later under ADR 0010's mandatory process**
  (tenant configuration / location configuration / module configuration /
  reusable capability / reusable module / temporary experiment / rejected
  fork — ADR 0010 Section B) before any implementation work on it begins,
  exactly as ADR 0010 Section D requires for every future request,
  regardless of source.
- **No current release scope expands because of it.** This document's B2a/
  B2b mutation matrix, allowlists (Section 5), and file-change list (Section
  12) are the complete B2 scope; a later, separately classified and
  separately approved request does not retroactively add mutations,
  wrappers, or UI surface to B2a or B2b.

This section exists so that a client request surfacing during acceptance
testing is never treated as an implicit amendment to this plan — it always
starts a new ADR 0010 classification, on its own timeline, independent of
whether B2a/B2b/C/D/E/F are in flight.
