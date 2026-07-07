# Workforce RLS and Security Plan

Status: **Design doc only. No SQL migrations or RLS policies are created in
Phase 1K, and no production database behavior changes as part of this
phase.** Phase 1L will create new, forward-only migrations after review;
already-applied migrations are never edited.
Phase: 1K. Read with:
[`workforce-production-mvp-architecture.md`](./workforce-production-mvp-architecture.md),
[`workforce-data-model.md`](./workforce-data-model.md),
[`../security/security-requirements.md`](../security/security-requirements.md),
[`rbac.md`](./rbac.md), [`multi-tenancy.md`](./multi-tenancy.md).

## 1. Security goals

- No tenant can ever read or write another tenant's Workforce data, under
  any application bug, by database-level enforcement (RLS), not
  frontend filtering.
- No location-scoped Manager/Staff can see another location's data within
  the same tenant, once a tenant has more than one location.
- `service_role` never reaches `apps/web`; all privileged writes route
  through `apps/api`.
- Every sensitive Workforce action (correction approval/rejection, role
  changes, CSV export, staff PII access) is audited.
- Staff PII (names, free-text messages, LINE user ids) is encrypted at rest
  and never exposed beyond what a given role legitimately needs.
- The existing `/demo/cafe*` public demo remains architecturally unrelated
  to this security model — it holds no real data and this plan does not
  change its access posture.

## 2. Threat model

In scope:

- A malicious or compromised tenant user attempting to read/write another
  tenant's Workforce data (cross-tenant leakage).
- A Staff-role user attempting to read/write another Staff member's work
  reports, correction requests, or profile within the same tenant.
- A Manager-role user attempting to act outside their assigned
  location(s) within a multi-location tenant.
- An unauthenticated (`anon`) request attempting to reach any private
  Workforce data.
- A request with no valid JWT, or an expired/malformed one, attempting to
  reach protected endpoints or tables.
- Accidental `service_role` exposure through a misconfigured environment
  variable or a frontend import.
- Free-text fields (correction requests, daily messages) containing real
  personal information (health/leave mentions, complaints) beyond the
  literal work-report correction it names.
- Bulk data exfiltration via CSV/monthly-report export.

Out of scope for this document (covered elsewhere or genuinely later):

- LINE webhook signature verification — covered by the existing platform
  requirement (`security-requirements.md` §4) and
  [`workforce-line-liff-entry-plan.md`](./workforce-line-liff-entry-plan.md)
  §10, since Workforce has no LINE webhook of its own in this MVP.
- Platform-staff cross-tenant support access — already governed by
  `core.is_platform_staff()` and `0012_protect_platform_staff.sql`; Workforce
  does not change that model.
- AI-agent access to Workforce data — out of scope per the production
  architecture doc §3 (no AI automation in this MVP).

## 3. Roles and permissions matrix

Following the `module.entity.action` convention in `rbac.md` and
`packages/core/src/permissions.ts`. Exact keys are an implementation-time
addition to that file; the set proposed here:

| Permission (proposed) | Owner | Manager | Staff |
| --- | --- | --- | --- |
| `workforce.staff.read` | ✅ tenant-wide | ✅ own location(s) | ✅ self only |
| `workforce.staff.write` | ✅ tenant-wide | ✅ own location(s) | ❌ |
| `workforce.recipe.read` | ✅ | ✅ | ✅ tenant-wide (recipes are not location-scoped, §5) |
| `workforce.recipe.write` | ✅ | ✅ | ❌ |
| `workforce.shift.read` (existing) | ✅ | ✅ own location(s) | ✅ own assignments only |
| `workforce.shift.write` (existing) | ✅ | ✅ own location(s) | ❌ |
| `workforce.request.manage` (existing) | ✅ | ✅ own location(s) | ❌ (Staff submit via a separate, narrower write path, §6) |
| `workforce.report.write` | ✅ self | ✅ self + read-all in own location(s) | ✅ self only |
| `workforce.correction.submit` | ✅ self | ✅ self | ✅ self only |
| `workforce.correction.approve` | ✅ | ✅ own location(s) | ❌ |
| `workforce.report.export` | ✅ | ✅ own location(s) | ❌ |
| `workforce.settings.manage` | ✅ | ✅ own location(s), scope TBD | ❌ |

Notes:

- "Own location(s)" means the Manager's grant is scoped via
  `core.role_assignments.location_id`, per `rbac.md`'s existing
  `location_id = X` grant mechanism — no new grant mechanism needed.
- Staff never get a tenant-wide or all-location grant; every Staff
  permission is inherently self-scoped by row ownership, enforced in the RLS
  predicate (§6), not just by which permission key they hold.
- `workforce.request.manage` already exists in `0009_workforce.sql`/
  `permissions.ts`; Staff submitting their own shift preference/correction
  request needs a narrower self-scoped write permission
  (`workforce.correction.submit`, and shift-preference submission reusing
  `workforce.shift.read` + a self-row `insert`-only policy, §6) rather than
  the Manager-level `request.manage` grant.

## 4. Tenant isolation rules

- Every `workforce` table has `tenant_id uuid not null` and RLS enabled from
  the migration that creates it (never added in a follow-up migration).
- Every policy predicate starts from `core.has_permission(tenant_id, key,
  location_id)`, exactly as `0009_workforce.sql` already does — no
  table gets a bespoke tenant-check expression.
- No Workforce query, view, or API code path accepts a `tenant_id` from the
  request; it is always derived from `resolveTenantContext(user)`
  server-side, per `security-requirements.md` §2.
- Views in the `api` schema are `security_invoker = true`, so the underlying
  table RLS is still the enforced boundary even when a view is queried
  directly — matching `api.my_tenant_memberships`.

## 5. Location isolation rules

- Tables tied to a physical location (`shift_assignments`, `work_reports`,
  `work_report_breaks` via parent, `work_report_corrections` via parent,
  `location_workforce_settings`) carry `location_id` and gate on it through
  `core.has_permission(tenant_id, key, location_id)`'s existing
  location-scoping behavior.
- `recipes` and `recipe_categories` are tenant-wide, not location-scoped, in
  this MVP (per `workforce-data-model.md`) — a recipe created at one
  location is visible tenant-wide. If a future client needs per-location
  recipe books, that is a schema change (`location_id` added to
  `recipes`), not a policy-only change.
- `staff_profiles.location_id` represents a staff member's home location; a
  Manager scoped to location X can read/write staff profiles whose
  `location_id = X`. A staff member transferring locations is an
  implementation-time UPDATE flow, not a new concept.

## 6. Staff access rules

- Staff read own `staff_profiles` row only (not other staff's), matched via
  `staff_profiles.user_id = core.current_user_id()` (or the equivalent
  `staff_profile_id` derived from the authenticated user), not a
  client-supplied id — this is the direct fix for the demo's
  `CURRENT_STAFF_ID` client-side constant, called out as a real risk in the
  Phase 1J-2 closeout's Security review.
- Staff read own `shift_assignments` (`staff_profile_id` matches their own
  profile) and own `work_reports`/`work_report_breaks`/
  `work_report_corrections` — never another staff member's, even within the
  same location.
- Staff write (insert/update) only their own `work_reports` rows (clock
  in/out, breaks) and only their own `work_report_corrections` /
  `shift_requests` submissions. Staff cannot set `status = 'approved'` on a
  correction — the RLS `with check` clause and/or the `apps/api` write path
  must reject a Staff-originated update that changes `status` away from
  `pending`.
- Staff read all `recipes`/`recipe_categories`/`recipe_ingredients`/
  `recipe_steps`/`recipe_notes` for their tenant (recipes are shared
  reference material, not personal data) — this is the one Staff read grant
  that is tenant-wide rather than self-scoped, matching §3's "unless
  public/published recipe data" requirement, interpreted here as "published
  within the tenant," not literally public/anonymous (no anon recipe access
  in production, per the production architecture doc §9).
- Staff have no access to other staff members' `staff_profiles` beyond
  perhaps a minimal non-PII directory (name, role_label) if a future feature
  needs it — not required for this MVP and not granted by default.

## 7. Manager access rules

- Manager reads/writes `staff_profiles`, `shift_assignments`,
  `shift_requests`, `work_reports`, `work_report_corrections`, `recipes`,
  and `location_workforce_settings` scoped to their assigned
  tenant/location(s), via `core.has_permission(tenant_id, key,
  location_id)` where their `role_assignments` grant carries a specific
  `location_id`.
- A Manager assigned to multiple locations (future multi-location tenant)
  gets one `role_assignments` row per location, per `rbac.md`'s existing
  grant model — no new grant shape needed.
- Manager approval/rejection of `work_report_corrections` is the one write
  action gated by a distinct permission (`workforce.correction.approve`)
  rather than the general `workforce.request.manage`/`report.write` grants,
  so it can be audited and reasoned about as its own capability (§11) —
  matching §3's explicit requirement that correction decisions be a human
  approval action.
- A Manager cannot grant themselves Owner-level permissions or a wider
  location scope — that remains a `core.role_assignments` change, itself
  gated by `core.role.manage`, per `rbac.md`.

## 8. Owner access rules

- Owner has every Manager permission tenant-wide (all locations), plus
  `core.location.manage`, `core.member.invite`, `core.role.manage`, and
  `core.billing.manage` — all already-existing Core permissions, not new
  Workforce-specific ones.
- Owner is the only role that can enable/disable the `workforce` module for
  the tenant (`core.tenant_modules`) and create additional locations.
- Owner is not automatically the same as Platform Owner/Platform Support —
  those remain separate, cross-tenant platform roles per `rbac.md`, with no
  overlap in this plan.

## 9. App-facing API/view strategy

- Reads: `api`-schema, `security_invoker = true` views, following
  `0015_api_facade.sql`'s `api.my_tenant_memberships` pattern exactly —
  e.g. `api.workforce_my_shifts`, `api.workforce_recipes`,
  `api.workforce_manager_alerts` (the computed alerts view from
  `workforce-data-model.md`). No PII beyond what the view's consumer role
  legitimately needs; no `SECURITY DEFINER` objects in `api`.
- Writes: exclusively through `apps/api`, which derives tenant context,
  calls `requirePermission`, writes via the service-role client, and writes
  an audit entry — following `overview.md`'s existing "Request flow
  (privileged write)" diagram. No Workforce table gets a direct
  `authenticated`-role `INSERT`/`UPDATE`/`DELETE` grant that bypasses this
  path for mutation-sensitive tables (work reports, corrections, shift
  decisions); RLS is defense-in-depth under this path, not the only gate,
  per `overview.md`'s existing rationale.
- `anon` receives no `USAGE` on `workforce`, no grants on any
  Workforce-related `api` view, matching `0015_api_facade.sql`'s existing
  "anon is granted nothing" posture.

## 10. service_role prohibition

- `SUPABASE_SERVICE_ROLE_KEY` stays server-only (`apps/api`, `apps/worker`,
  db/seed scripts) per `security-requirements.md` §3; Workforce introduces
  no exception.
- No Workforce feature (staff app, manager dashboard, monthly report) is
  ever built with a `service_role` client instantiated in `apps/web`. The
  existing ESLint guard against `process.env` service-role access in
  `apps/web` applies unchanged.
- Monthly report/CSV export, despite touching more rows than typical reads,
  still goes through `apps/api` or a security-invoker `api` view — it is not
  a justification for a service-role shortcut in the frontend.

## 11. Audit log requirements

Per `security-requirements.md` §6 and the production architecture doc §13,
every one of the following writes an `audit.audit_logs` row with
`module = 'workforce'`:

- Work report create/update (clock in, clock out, break start/end).
- Correction request submission (`action = 'submit'`).
- Correction request approval/rejection (`action = 'approve' |
  'reject'`, `actor_id = decided_by`, before/after status).
- Shift request submission and decision.
- Shift assignment create/update (manager scheduling actions).
- Recipe create/update/archive.
- Staff profile create/update/deactivate.
- Role changes affecting Workforce access (Owner/Manager/Staff
  reassignment) — written by the existing Core role-management path
  (`core.role.manage`), not duplicated by Workforce, but Workforce-relevant
  reviewers should know to check `audit.audit_logs` filtered to
  `entity = 'role_assignment'` when investigating a Workforce access
  question.
- CSV/monthly-report export (`action = 'export'`, metadata recording the
  period and tenant/location scope exported).

`before`/`after` payloads must redact PII (`redactPII`) before being stored —
never write raw `daily_message`, `requested_change`, or decrypted staff
names into `audit.audit_logs`. Store enough to know *what changed*
(status transitions, ids, timestamps), not the sensitive content itself.

## 12. pgTAP/RLS test plan

Following the platform's existing "own-tenant, cross-tenant, anon, no-JWT"
verification pattern (`mvp-roadmap.md`'s First Client Readiness Checklist),
for every new/extended Workforce table:

1. **Own-tenant, own-row (Staff)**: Staff can read/write their own
   `work_reports`/`shift_requests`/`work_report_corrections`; cannot read
   another staff member's rows in the same tenant/location.
2. **Own-tenant, cross-location (Manager)**: a Manager scoped to location A
   cannot read/write location B's data within the same tenant.
3. **Cross-tenant (any role)**: a user authenticated in tenant A cannot
   read/write any tenant B Workforce row, for every table.
4. **anon**: an unauthenticated request cannot read any Workforce table or
   Workforce-related `api` view.
5. **no-JWT / expired JWT**: a request with no valid session cannot read or
   write any Workforce table.
6. **Correction approval-specific**: a Staff-role user cannot set
   `work_report_corrections.status` to `approved`/`rejected`, even on their
   own row; only a Manager/Owner with `workforce.correction.approve` can.
7. **Recipe read-specific**: Staff can read all tenant recipes but cannot
   write/archive them; Manager/Owner can.
8. **Audit coverage**: every mutation path listed in §11 produces exactly
   one `audit.audit_logs` row with the correct `actor_id`, `module`,
   `entity`, `action`.

These become real pgTAP tests in Phase 1L, mirrored on the existing test
patterns already used for `0009_workforce.sql`'s policies (test file
location/naming to be confirmed against the current pgTAP suite at
implementation time).

## 13. Sensitive data handling

- Staff names: `_encrypted`/`_hash` blind-index pattern, already established
  by `workforce.employees.name_encrypted`/`name_hash` in
  `0009_workforce.sql` — carried forward unchanged for `staff_profiles`.
- LINE user ids: same encrypted + blind-index pattern as
  `core.line_accounts.line_user_id_encrypted`/`line_user_id_hash` —
  Workforce's `staff_line_links` (or reuse of `core.line_accounts`, per
  `workforce-data-model.md`) follows the identical pattern, never storing a
  plaintext LINE user id anywhere.
- Free-text fields (`daily_message`, `requested_change`,
  `decision_note`): not encrypted by default in `0009_workforce.sql`'s
  precedent (`shift_requests.details jsonb` is stored plain), but these
  fields are more likely to contain real personal complaints or
  health/leave information than a shift-swap note. Phase 1L should
  explicitly decide, with the security requirements doc's PII list in mind,
  whether `daily_message`/`requested_change` need the same
  encrypted-at-rest treatment as names — flagged here as an open decision,
  not resolved by this doc.
- Encryption keys/pepper: come from env, never touch the database or
  browser, per `security-requirements.md` §5 — unchanged for Workforce.
- CSV/monthly-report export: generated server-side, never includes raw LINE
  user ids, and only includes decrypted staff names for roles that already
  have `workforce.staff.read` at that scope.

## 14. Backup/recovery notes

- Workforce tables are covered by the platform's existing backup/DR runbook
  (`docs/operations/`) with no Workforce-specific exception — no new backup
  mechanism is introduced by this module.
- Because `audit.audit_logs` is append-only (DB trigger blocks
  update/delete, per `0005_audit.sql`), it remains a reliable secondary
  source for reconstructing what happened to Workforce data even if a
  primary-table restore is needed.
- Soft-deleted (`is_active = false`) staff/recipe rows are retained, not
  hard-deleted, so a restore does not need to distinguish "deleted" from
  "destroyed" — a genuine hard-delete (e.g. a GDPR-style erasure request) is
  a separate, deliberate operational procedure, not part of this MVP's
  default behavior.
- Any future encryption key rotation (per `security-requirements.md`'s
  "Secret rotation notes") applies to Workforce's PII columns identically to
  every other module's — no separate rotation procedure needed.

## 15. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A Staff-role user updates their own correction request's `status` to `approved` | RLS `with check` on `work_report_corrections` restricts non-approval-permission writers to `status = 'pending'`/`'cancelled'` only; `apps/api` also enforces this in code as a second layer. |
| A Manager scoped to one location reads another location's data via a missing `location_id` filter in a new `api` view | Every new view follows the `security_invoker` + underlying-RLS pattern (§9), so a missing filter in the view still can't leak past the table's own RLS policy. |
| Free-text fields becoming an unflagged PII store | §13 flags this as an explicit open decision for Phase 1L rather than silently shipping without encryption. |
| CSV export becoming a bulk-exfiltration path | Export is a distinct, permissioned (`workforce.report.export`), audited (§11) action — not a byproduct of a general read grant. |
| RLS policy drift between this plan and what Phase 1L actually ships | §12's pgTAP test plan is the enforcement mechanism — tests are written per table before a table is considered done, not after. |
| Confusing this security model with the (currently nonexistent) security posture of `/demo/cafe*` | The demo has no real data and no RLS today by design; this plan applies only to production Workforce tables and does not retroactively change the demo. |
