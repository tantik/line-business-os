# Phase 1J-1 — Workforce MVP Architecture Plan

Status: **Plan only. Not implementation approval.**
Branch: `plan/phase-1j-1-workforce-mvp-architecture`
Scope of this document: architecture and design only. No SQL, no migrations, no
app code, no Supabase Cloud commands were run to produce this document.

Read with: [`architecture/overview.md`](./architecture/overview.md),
[`architecture/multi-tenancy.md`](./architecture/multi-tenancy.md),
[`architecture/rbac.md`](./architecture/rbac.md),
[`security/security-requirements.md`](./security/security-requirements.md),
[`adr/0003-pii-encryption-and-blind-index.md`](./adr/0003-pii-encryption-and-blind-index.md),
[`adr/0005-data-access-model.md`](./adr/0005-data-access-model.md),
[`adr/0008-api-facade-schema.md`](./adr/0008-api-facade-schema.md),
[`product/mvp-roadmap.md`](./product/mvp-roadmap.md).

---

## 1. Executive summary

Workforce is the first candidate vertical module for MVP (per
`product/mvp-roadmap.md`, "Phase 1J-1 — Workforce MVP architecture plan").
The schema foundation already exists (`supabase/migrations/0009_workforce.sql`):
employees, shifts, shift_requests, leave_requests, attendance, all tenant- and
location-scoped with RLS enabled.

This review found the existing schema is a solid **scaffold** but is **not**
MVP-complete: it lacks employee self-service write access, lacks draft/published
schedule visibility separation, and has no defined path for decrypting the
encrypted employee name column for display. Those three gaps block a usable
MVP and are detailed in §5.

This document proposes a scope-limited MVP design that closes those three gaps
plus a small set of adjacent decisions (staff identity model, permissions,
RLS strategy, API boundary, PII display strategy, UI routes, Japanese labels,
audit plan, staged rollout). It does not propose or perform any schema change.

## 2. CTO decision: accepted with corrections

**Accepted as a design baseline**, with the following corrections applied
throughout this document. These corrections are binding for any future
implementation work that cites this plan:

1. The PII display mechanism must **not** be described or implemented as a
   generic "decrypt endpoint." It must be an **authorized server-side
   Workforce service/API route** that, in order: (a) authenticates the caller,
   (b) resolves and verifies tenant membership, (c) verifies location scope,
   (d) verifies the specific permission required for the field being read, and
   only then (e) returns the **minimum necessary decrypted display data**
   (e.g. a name string for a roster row) — never a raw decrypt-by-id primitive
   callable with just a record id.
2. `apps/api` is confirmed as the **target backend boundary** for this
   mechanism and for Workforce write operations generally, but implementation
   must **start with a short `apps/api` deployment/environment readiness
   review** (see §14) before any Workforce endpoint is coded. `apps/api`
   today only hosts a health check and the LINE webhook controller — it has
   no auth middleware, tenant-context wiring, or deployed-environment
   confirmation yet.
3. `service_role` is allowed **only** in backend runtime code (`apps/api`,
   `apps/worker`, `packages/db` scripts) — **never** in `apps/web` or any
   browser-executed code — and only after the request has already passed
   explicit tenant membership and permission checks (`resolveTenantContext` /
   `requirePermission`). `service_role` bypassing RLS is not a substitute for
   those checks; it runs after them, not instead of them.
4. Self-read RLS for an employee accessing their own Workforce rows (e.g. "an
   employee reads their own shifts") must **not** be gated on `user_id`
   linkage alone. It must also require the acting user to hold the relevant
   Workforce module permission/scope in that tenant/location (i.e. still an
   active, permissioned member of the tenant — not just "any row where
   `employees.user_id = auth.uid()`"). Linkage identifies *whose* row it is;
   permission/module access still decides *whether* the read is allowed.
5. **This document is a design baseline, not implementation approval.** No
   migration, RLS policy, `apps/api` endpoint, or `apps/web` UI may be built
   from this document without a separate, explicit human go-ahead.
6. **Migrations and RLS implementation require separate human approval**,
   distinct from acceptance of this plan, per `CLAUDE.md` and
   `.cursor/rules/*`.

## 3. Current repository findings

- Schema: `supabase/migrations/0009_workforce.sql` creates schema `workforce`
  with tables `employees`, `shifts`, `shift_requests`, `leave_requests`,
  `attendance`. RLS is enabled on all five tables.
- Domain contracts: `packages/workforce/src/index.ts` defines Zod schemas
  (`Employee`, `CreateShiftInput`, `LeaveRequestInput`) and route constants
  (`WORKFORCE_ROUTES`). It is contracts only — no service implementation, no
  decrypt/display logic, no data access functions.
- Web UI: `apps/web/src/app/workforce/page.tsx` is a placeholder page linking
  to `/workforce/shifts` and `/workforce/manager`; **neither sub-route exists
  yet** in the repository.
- Backend: `apps/api/src/` contains only `app.module.ts`, `health.controller.ts`,
  and `line/line-webhook.controller.ts`. There is no Workforce controller, no
  auth guard, and no confirmed deployed environment for `apps/api` in this
  repo's docs (deployment checklist and env inventory focus on `apps/web` /
  Vercel + Supabase; `apps/api`'s own deploy target is not documented).
- RBAC seed: `supabase/migrations/0008_rbac_seed.sql` registers
  `workforce.shift.read`, `workforce.shift.write`,
  `workforce.attendance.manage`, `workforce.request.manage`, and assigns them
  to Manager (all four) and Employee (`shift.read`, `attendance.manage` only —
  **not** `request.manage`).
- PII pattern already exists and is reusable: `packages/db/src/crypto.ts`
  (`encryptPII` / `decryptPII` / `blindIndex`, AES-256-GCM,
  server-only key handling) — the same pattern used for booking customer PII.
  Workforce should reuse it, not invent a new one.
- Facade pattern already exists and is reusable: `api.*` security-invoker
  views (`supabase/migrations/0015_api_facade.sql`,
  `0017_api_tenant_dashboard_facade.sql`) — non-PII, self-scoped,
  `security_invoker`, no `SECURITY DEFINER` objects exposed to the Data API.

## 4. Existing Workforce schema assessment

The schema is directionally correct and should be **kept, not rewritten**:

- Every table carries `tenant_id`; physical-assignment tables also carry
  `location_id` — consistent with `architecture/multi-tenancy.md`.
- `employees.name_encrypted` (`bytea`) + `employees.name_hash` (`text`) already
  follow the blind-index PII pattern from ADR 0003 — this is correct and
  should not change.
- RLS is enabled on all five tables and every policy routes through
  `core.has_permission(tenant_id, key, location_id)` — consistent with the
  two-layer enforcement model in `architecture/rbac.md`.
- `shifts.published boolean not null default false` already exists in the
  schema — the column needed for draft/publish separation is present but
  **unused by any RLS policy** (see §5).
- `employees.user_id uuid references core.users(id)` already exists — the
  linkage needed for "an employee views their own data" is present but **no
  policy currently uses it** (see §5).

Nothing here requires a schema change for the MVP scope in §6. The MVP-blocking
issues are all **missing permissions/policies/service logic**, not missing
columns.

## 5. MVP-blocking issues found

### 5.1 Employee self-service permission gap

`workforce.shift_requests` and `workforce.leave_requests` both gate **all**
writes behind `workforce.request.manage`
(`supabase/migrations/0009_workforce.sql` policies `wf_shift_requests_write`,
`wf_leave_requests_write`). The Employee role is **not** granted
`request.manage` (`0008_rbac_seed.sql`). Net effect: **no employee can create
their own shift-swap/pickup request or leave request** — only a Manager can
write these rows, which defeats the purpose of the tables (they exist to let
staff request things, and managers approve/decide). This is a blocking gap for
any usable MVP: "employee submits a leave request" is a baseline Workforce
scenario.

### 5.2 Draft schedule visibility gap

`workforce.shifts` has a `published` column, but the read policy
(`wf_shifts_read`) grants read access to anyone with `workforce.shift.read` —
which Employee holds — **regardless of `published`**. There is no policy
predicate on `published`. Net effect: **employees can currently see
unpublished/draft shift schedules**, including shifts a manager is still
drafting, swapping, or has not yet finalized. This is a blocking privacy/UX
gap: draft schedules routinely contain names, times, and role assignments
that should not be visible to staff until a manager publishes them.

### 5.3 Encrypted staff names / PII boundary

`employees.name_encrypted` is stored correctly per ADR 0003, but **no code in
this repository decrypts it**. `packages/workforce/src/index.ts` comments that
`name` is "decrypted at the service boundary," but no such service boundary
exists yet — no `apps/api` controller, no server action, nothing. Net effect:
**there is currently no way to display a staff member's name anywhere in the
product** without inventing that boundary. Per the CTO correction in §2.1,
this must be built as a scoped, permission-checked Workforce service route —
not a generic decrypt endpoint.

## 6. Proposed Workforce MVP scope

The smallest useful, end-to-end Workforce slice:

- Manager creates/edits shifts for a location (draft, i.e. `published = false`
  by default).
- Manager publishes shifts (flips `published = true`) so employees can see
  them.
- Employee views their own **published** shifts only.
- Employee submits a leave request (`leave_requests`) and a shift
  swap/pickup/drop request (`shift_requests`) for themselves.
- Manager views pending requests for their location(s) and approves/rejects.
- Manager views a roster (active employees at their location) with display
  names resolved through the authorized Workforce name-display route (§13).
- Every write above is audit-logged (§17).

## 7. Explicit out-of-scope list

Not in MVP scope, regardless of what exists in the schema already:

- Attendance clock-in/clock-out UI (the `attendance` table exists but building
  a time-clock UX is a separate, later effort).
- Shift-swap negotiation UI beyond raw approve/reject (no counter-offers, no
  chat).
- Employee self-onboarding / self-registration (`employees.user_id` linkage
  creation stays an admin/manager action for MVP).
- Payroll, wage, or hours-worked calculations.
- Cross-location scheduling or multi-location shift transfer.
- Any AI proposal/automation touching schedules (out of scope until AI
  human-in-the-loop patterns are proven elsewhere, per
  `security/security-requirements.md` §7).
- Mobile app / native clients.
- Bulk import of employees or shifts.

## 8. Staff identity model

Two kinds of `workforce.employees` rows, distinguished by whether `user_id` is
set:

### 8.1 Roster-only staff

`user_id IS NULL`. A staff member who exists in the roster (name, position,
employment type) for scheduling purposes but has **no login** and cannot use
the app themselves. All actions on their behalf (viewing their schedule,
filing leave on their behalf) are performed by a Manager/Admin. This is the
common case for many small Japanese SMB tenants at MVP time (not every staff
member will have or want an account).

### 8.2 Linked user staff

`user_id` set to a `core.users.id` that also has an **active**
`core.tenant_memberships` row in the same tenant (and, where relevant, the
same location) with the Employee role. Only linked-user staff can sign in and
use employee self-service (view own published shifts, submit own requests).
Per the CTO correction in §2.4, "is this my own row" is necessary but not
sufficient — the acting user must also carry current Workforce read
permission in that tenant/location; a stale or revoked membership must not
retain self-read access merely because `employees.user_id` still points at
them.

## 9. Proposed data model

No new tables and no column changes are proposed. The MVP scope in §6 is
achievable using the existing `supabase/migrations/0009_workforce.sql` shape:

| Table | Reused as-is for MVP |
| --- | --- |
| `workforce.employees` | roster + optional `user_id` link (§8) |
| `workforce.shifts` | `published` flag drives visibility (§11) |
| `workforce.shift_requests` | employee-authored requests, manager-decided |
| `workforce.leave_requests` | employee-authored requests, manager-decided |
| `workforce.attendance` | out of scope for MVP UI (§7); no policy change needed |

If a future stage needs new columns (e.g. a `requested_by` employee-linkage
column distinct from `decided_by`), that is a follow-up design decision, not
part of this plan.

## 10. Proposed permissions/RBAC

Add one new permission key and reassign existing ones — a **policy and seed
data change**, not a schema change:

- New: `workforce.request.self` — "create/read own shift or leave requests."
  Granted to the Employee role. Distinct from `workforce.request.manage`
  (approve/reject any request), which stays Manager-only.
- Existing `workforce.shift.read` stays on Employee, but its RLS meaning
  changes for employees to "read shifts within permission scope, filtered by
  `published` unless the actor also holds `workforce.shift.write`" (§11).
- Existing `workforce.attendance.manage` stays out of MVP UI scope (§7) but no
  permission change is proposed for it.

This keeps the two-layer enforcement model in `architecture/rbac.md` intact:
permission catalog (`core.permissions`) → role mapping
(`core.role_permissions`) → RLS predicate (`core.has_permission`).

## 11. Proposed RLS strategy

Directional proposal only — no SQL is written or run as part of this document.
Any real policy text is a future, separately-approved migration.

- **Shifts read policy** should be split into two predicates instead of one:
  - Actors with `workforce.shift.write` (Managers) see all shifts, published
    or draft, within their permitted `tenant_id`/`location_id` scope
    (unchanged from today for that group).
  - Actors with only `workforce.shift.read` (Employees) see a shift **only
    if** `published = true` **and** the shift's `employee_id` resolves to an
    `employees` row whose `user_id` matches the caller **or** the caller
    otherwise holds a broader read permission for that location. This closes
    §5.2. The exact predicate shape (e.g. a `core.has_permission(...)` helper
    variant that also takes `published`) is left to the implementation stage,
    not decided here.
- **shift_requests / leave_requests write policy** should add an
  **OR-branch**, not replace the existing one: keep
  `core.has_permission(tenant_id, 'workforce.request.manage', location_id)`
  for managers, and add a self-service branch requiring (a) the caller holds
  `workforce.request.self`, (b) the request's `employee_id` resolves to an
  `employees` row with `user_id = core.current_user_id()`, and (c) the caller
  is an **active** tenant member with current module access — not linkage
  alone (§2.4, §8.2). This closes §5.1.
- **shift_requests / leave_requests read policy** should similarly add a
  self-read branch so an employee can see their own submitted requests and
  their outcome, gated the same way as the write branch.
- **employees table** read policy is unchanged in shape (still
  `workforce.shift.read`-gated) — the roster-listing use case in §6 is a
  Manager action; employees do not need to read the whole roster for MVP.
- All of the above stays RLS-first per `security/security-requirements.md`
  §1: tenant isolation and the self-service boundary must hold at the
  database layer, not only in `apps/api` application code.

## 12. Proposed API/facade strategy

Two distinct access paths, matching the existing project pattern
(ADR 0005 / ADR 0008) — no new pattern is invented:

- **Read-only, non-PII, self-scoped data** (e.g. "my published shifts," "my
  request status") can eventually be exposed as `api.*` security-invoker
  views, the same shape as `api.my_tenant_modules` /
  `api.my_tenant_locations`. This is a candidate for a later stage, not MVP
  stage 1 — it requires its own reviewed migration and must keep the
  no-PII / no-`SECURITY DEFINER` invariants from ADR 0008.
- **Any write** (creating a request, publishing a shift, approving/rejecting)
  and **any PII-bearing read** (resolving `employees.name_encrypted` to a
  display name) go through `apps/api`, using `resolveTenantContext` +
  `requirePermission` before touching data, and a `service_role` client only
  after those checks pass (§2.3). This is consistent with ADR 0005's
  "sensitive business mutations go through the backend" model and is the only
  place PII decryption is permitted to happen.

## 13. PII/encryption strategy

Reuse `packages/db/src/crypto.ts` (`encryptPII` / `decryptPII` / `blindIndex`)
exactly as-is — do not build a parallel encryption utility for Workforce.

Per the CTO correction (§2.1), the display mechanism is a **Workforce
name-display service/route**, not a generic decrypt endpoint:

1. Caller authenticates (existing `apps/web` → `apps/api` auth path).
2. `resolveTenantContext` derives tenant membership from the authenticated
   user — never from a client-supplied `tenant_id`.
3. The route verifies `location_id` scope for the specific roster/shift rows
   requested.
4. The route calls `requirePermission` for the Workforce permission that
   covers seeing staff names in that context (`workforce.shift.read` for
   roster/shift display; a manager-only permission for anything broader).
5. Only after 1–4 pass does the route decrypt `name_encrypted` for the
   specific rows already authorized by the RLS-scoped query, and return
   **only** the decrypted display name plus the fields the UI needs — never a
   bulk "decrypt all employees" capability, never a raw decrypt-by-id
   endpoint that accepts an arbitrary employee id without the row already
   having passed tenant/location/permission filtering.

`name_hash` (blind index) remains available for equality search (e.g.
"find employee by exact name") without decrypting, consistent with ADR 0003.

## 14. apps/api boundary and deployment question

`apps/api` is confirmed as the target backend boundary for Workforce writes
and PII display (§2.2), but this repository does not yet document where
`apps/api` runs, how it is deployed, or how it authenticates a request
(no auth guard exists in `apps/api/src/` today — only a health check and the
LINE webhook controller, which has its own signature-based verification and
is not representative of an authenticated-user path).

**Before any Workforce endpoint is coded**, a short, separate readiness
review is required, covering at minimum:

- Where `apps/api` is deployed (or will be deployed) for dev/preview/
  production, and how that maps to the existing Vercel (`apps/web`) +
  Supabase (Cloud dev/production) split in
  `operations/deployment-checklist.md` and `operations/env-inventory.md`.
- How an authenticated `apps/web` user's session/JWT reaches `apps/api` (e.g.
  forwarded Supabase JWT, a session-to-service-token exchange, or another
  mechanism) so `resolveTenantContext` has a real user id to work with.
- Which env vars `apps/api` needs at runtime (service-role key,
  `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`) and confirmation those are
  provisioned server-side only, consistent with
  `security/security-requirements.md` §3 and §5.
- CI/build coverage for `apps/api` (it currently builds via Turbo but has no
  Workforce-specific tests to run yet).

This readiness review is itself a small, separate piece of work — it is not
performed as part of this document and is not approved by this document.

## 15. Proposed UI/routes

Under the existing `apps/web/src/app/workforce/` tree, matching
`WORKFORCE_ROUTES` in `packages/workforce/src/index.ts`:

- `/workforce` — landing/redirect (exists today as a placeholder).
- `/workforce/manager` — Manager view: shift calendar/list for a location
  (draft + published), publish action, pending requests queue with
  approve/reject.
- `/workforce/shifts` — Employee view: "my published shifts" list only.
- `/workforce/requests` (new, not yet in `WORKFORCE_ROUTES`) — Employee view:
  submit a leave/swap/pickup request, see status of own past requests.

Legacy redirects `/shifts` → `/workforce/shifts` and `/manager` →
`/workforce/manager` are already anticipated in the existing route constants
and should be preserved.

## 16. Japanese UX labels

Candidate labels for the MVP scope in §6 (UTF-8 Japanese; verify rendering in
an editor/terminal before use in UI code):

| Context | Label |
| --- | --- |
| Module name | 勤怠管理 (Workforce / attendance management) |
| Manager view | マネージャー画面 |
| Employee view | 従業員画面 |
| Shift | シフト |
| Shift schedule (list) | シフト表 |
| Draft (unpublished) | 下書き |
| Published | 公開済み |
| Publish action | シフトを公開する |
| My shifts | 自分のシフト |
| Leave request | 休暇申請 |
| Shift swap request | シフト交換申請 |
| Shift pickup request | シフト応募 |
| Submit request | 申請する |
| Approve | 承認 |
| Reject | 却下 |
| Pending | 承認待ち |
| Approved | 承認済み |
| Rejected | 却下済み |
| Staff roster | スタッフ一覧 |
| Staff name | 氏名 |
| Position/role | 役職 |
| Location | 店舗 |

## 17. Audit logging plan

Every mutation in the MVP scope writes to `audit.audit_logs` via the existing
`writeAudit` helper, per `security/security-requirements.md` §6:

- Shift create/edit/publish → module `workforce`, entity `shift`, action
  `create`/`update`/`publish`.
- Leave/shift request create → entity `leave_request` / `shift_request`,
  action `create`, actor = the submitting employee's user id.
- Request approve/reject → same entities, action `approve`/`reject`, actor =
  the deciding manager's user id, `decided_by` recorded.
- Any PII-bearing before/after payload is redacted with `redactPII` before
  being written, per existing policy — employee names never appear
  unredacted in audit rows.

## 18. Implementation stages

Sequenced so nothing here is authorized to start until separately approved:

1. **apps/api readiness review** (§14) — confirm deploy target, auth
   forwarding, env vars. Docs/config only.
2. **RLS/permission migration** (§10, §11) — add `workforce.request.self`,
   split shift read policy on `published`, add self-service OR-branches to
   request policies. Requires human approval per §2.6; includes pgTAP tests
   proving the self-service and draft-visibility boundaries (own vs.
   cross-employee, published vs. draft, revoked-membership fails closed).
3. **Workforce service/API routes** (§12, §13) — `apps/api` controllers for
   shift publish, request create/approve/reject, and the name-display route.
4. **apps/web UI** (§15) — Manager and Employee views, wired to the routes
   from stage 3, no direct browser-to-Postgres Workforce access.
5. **Pilot verification** — manual smoke test of the full loop (manager
   drafts → publishes → employee sees only published → employee requests
   leave → manager approves), plus an audit-log spot check.

## 19. Risks

- **RLS regression risk**: changing the shifts read policy incorrectly could
  either re-open the draft-visibility gap (§5.2) or over-restrict managers.
  Requires explicit pgTAP coverage for both directions before merge.
- **Self-service policy complexity**: OR-branch policies (manager-wide vs.
  self-only) are easy to get subtly wrong (e.g. missing the active-membership
  check called out in §2.4, reopening a "linkage alone" hole). Needs careful
  test coverage for revoked/inactive membership specifically.
- **PII display boundary creep**: without the discipline in §2.1/§13, it is
  easy to accidentally build a general-purpose decrypt-by-id endpoint "for
  convenience" that becomes a cross-tenant or cross-permission leak vector.
- **apps/api unknowns**: because `apps/api` has no documented deploy target or
  auth path today (§14), stage 1 could surface unexpected infra work (e.g.
  needing a new Vercel/Node deployment target, or a session-forwarding
  mechanism) that changes the effort estimate for stages 3–4.
- **Scope creep**: attendance UI, payroll, or AI scheduling features could be
  pulled forward under "while we're in there" pressure; §7 should be treated
  as a hard boundary for this MVP stage.

## 20. Do-not-do-yet list

- Do not write or run any migration based on §10/§11 without separate human
  approval (§2.5, §2.6).
- Do not implement any `apps/api` Workforce controller before the readiness
  review in §14/stage 1 is done.
- Do not implement `apps/web` Workforce UI beyond the existing placeholder.
- Do not run any Supabase Cloud command (`db push`, `db pull`, `link`,
  `migration repair`) as part of or after this document.
- Do not build attendance clock-in/out, payroll, cross-location transfer, AI
  scheduling, bulk import, or self-onboarding (§7) under this plan.
- Do not introduce a generic decrypt-by-id endpoint or any `service_role`
  usage in `apps/web` (§2.1, §2.3).
- Do not treat this document, once accepted, as authorization to start
  stage 2 or later in §18.

## 21. Final recommendation

Accept this document as the Workforce MVP **design baseline**, with the CTO
corrections in §2 binding on any future implementation. Proceed next only to
**stage 1** (§18) — the `apps/api` deployment/env readiness review — as a
small, separate, docs/config-only piece of work. Do not begin the RLS/
permission migration (stage 2) or any code implementation until that review
is complete and a separate human approval is given for the migration, per
`CLAUDE.md`'s "Never run Supabase Cloud writes... without explicit human
approval" and this plan's §2.5/§2.6.
