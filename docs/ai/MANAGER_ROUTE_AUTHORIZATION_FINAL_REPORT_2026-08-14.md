# MANAGER_ROUTE_AUTHORIZATION_FINAL_REPORT

Date: 2026-08-14
Scope: ORUWA Cafe v2.1 — fix for the sole blocking defect from
`CANONICAL_CAFE_PREVIEW_ACCEPTANCE_REPORT_2026-08-14.md` (SECURITY_ACCEPTANCE = FAIL):
a Staff-authenticated user could navigate directly to `/dashboard/workforce/manager`
and the Manager dashboard rendered.

## 1. Root cause

`apps/web/src/app/(protected)/dashboard/workforce/manager/page.tsx` ran only:

1. `requireTenantContext()` — proves the caller is an authenticated, active member
   of *some* tenant (any role, including plain Staff).
2. A `workforce` module-enabled check — a product entitlement flag, not an
   authorization boundary.

No permission/role check existed between those two steps and the Manager-only
data fetch (`listWorkforceStaffForManager`, `listEmployeeLineLinks`,
`listWorkforceEmployeeInvitations`, `listShiftRequestsForManager`,
`listShiftAssignments`, `listAttendanceForManager`) and the
`ManagerDashboardClient` render. Any tenant member — Staff included — passed
both checks and reached the Manager page. RLS on the underlying `workforce.*`
tables correctly rejected Manager-only *writes* for a Staff caller (per the
prior acceptance report), but the *read* path and the Manager UI shell itself
had no equivalent gate.

By contrast, the sibling `/dashboard/workforce/staff/page.tsx` is self-scoped
by construction (`getMyWorkforceStaffProfile`, own-row only) and the *preview*
Cafe Manager surface (`_client-preview/mame-to-cha/manager`) already runs
`authorizePreviewManagerPage` → `resolvePreviewManagerContext('workforce.staff.manage')`
before rendering — this canonical page was the one surface in the module
missing the equivalent check.

## 2. Chosen authorization rule

**`workforce.staff.manage`**, checked tenant + location scoped via the
existing `api.has_permission` RPC (0019 facade over `core.has_permission`,
0006).

Why this permission, not a new one or `workforce.shift.write`:

- It is the exact permission that already gates every other Manager-only
  administrative capability in this module: the staff directory
  (`api.workforce_staff_directory`, 0023), employee LINE-link management
  (0029), and employee invitations (0064).
- It is held only by the `tenant_owner`, `tenant_admin`, and `manager` system
  roles (0008/0020 seed) — the `employee` role never holds it — so it
  correctly separates Manager/Owner/Admin from Staff without any new role
  label or hardcoded id/email.
- It is already the exact rule the *preview* Cafe Manager page enforces
  (`resolvePreviewManagerContext('workforce.staff.manage')` in
  `apps/web/src/lib/preview/actions/authorize.ts`), so this fix brings the
  canonical page in line with an established, tested pattern rather than
  inventing a new one.
- `core.has_permission(tenant_id, permission, location_id)` treats a
  tenant-wide role assignment (`location_id is null` — Owner/Admin) as
  matching any location, and a location-scoped Manager assignment as matching
  only that location — so multi-location scoping and Owner/Admin/Manager
  parity are preserved unchanged, not reinvented.
- `workforce.shift.write` was considered and rejected as the sole gate: it is
  one of several independent Manager capabilities surfaced on this page
  (shift editing), not the permission that already governs the page's primary
  administrative content (the staff roster), so it would have been a weaker,
  less-precedented choice than `workforce.staff.manage`.

This is a pre-check, not a substitute for RLS — the underlying tables keep
enforcing their own policies regardless of this result, exactly as the
existing B2a manager-write sequence's `checkManagerPermission` already works.

## 3. Files changed

- `apps/web/src/lib/workforce/manager-access.ts` (new) — `hasManagerAccess(supabase, tenantId, locationId)`, calls `api.has_permission` for `workforce.staff.manage`, fails closed to `false` on any RPC error or thrown exception.
- `apps/web/src/app/(protected)/dashboard/workforce/manager/page.tsx` — calls `hasManagerAccess` immediately after location resolution and before the Manager-only `Promise.all` data fetch; renders the existing `<UnauthorizedState />` on denial.
- `apps/web/src/lib/workforce/manager-access.test.ts` (new) — unit tests: grant, deny, RPC-error fail-closed, thrown-exception fail-closed, exact RPC args (`workforce.staff.manage`, tenant, location).
- `apps/web/src/app/(protected)/dashboard/workforce/manager/manager-page-authorization.test.ts` (new) — source-text regression guard proving the gate call and its denial both precede the Manager-only data fetch in the page source.
- `apps/web/package.json` — registers the two new test files in the `test` script (this repo's `node --test` invocation lists files explicitly; it does not glob).

No DB migration. This is purely an app-layer read gate using an existing RBAC permission and RPC; the investigation confirmed the RBAC model already had the needed permission and the underlying RLS was already correct — only the app-layer page was missing the check.

## 4. Route coverage

`/dashboard/workforce/manager` is a single page file with no nested manager-only
sub-routes and no shared `layout.tsx` anywhere in the `dashboard/workforce`
tree (verified by glob — only `page.tsx` files exist at `workforce/`,
`workforce/manager/`, `workforce/staff/`, `workforce/recipes/`, and
`workforce/recipes/[recipeId]/`; the other files under `manager/` are client
components, not routes). The single-page fix is therefore complete coverage
for this surface, not a partial one.

## 5. Staff denial result

- Staff A (`staff@mame-to-cha.test` → 田中 愛): direct navigation to
  `/dashboard/workforce/manager` → **"Access denied — You do not have access
  to this resource."** (the existing `UnauthorizedState` component).
- Staff B (`staff2@mame-to-cha.test` → 佐藤 健): same result.

## 6. Manager allow result

`manager@mame-to-cha.test` → direct navigation to `/dashboard/workforce/manager`
→ full page renders: staff roster (11 employees, LINE bind/unbind/invite
controls), weekly schedule grid with Assign/Publish controls, shift types
table, submitted shift preferences, and correction requests queue (including
the live "NEEDS ACTION" item and "Recently decided" history).

## 7. Owner result

Not separately re-tested live (no disposable Owner QA account in
`docs/QA_ACCESS.md`) — covered analytically instead: `core.has_permission`
treats Owner/Admin's tenant-wide `workforce.staff.manage` grant
(`role_assignments.location_id is null`, 0020 seed) as matching every
location, identically to how it already governs Owner/Admin access to the
staff directory, LINE links, and invitations elsewhere in this module. No
code path in this fix distinguishes Owner from Admin from Manager; all three
pass the same `hasManagerAccess` check by construction.

## 8. Protected-data / RSC payload result

Inspected the raw network response body for Staff A's
`GET /dashboard/workforce/manager` (200, `text/html`, RSC-inlined payload):
the entire streamed payload's rendered content is
`{"children":"Access denied"}` / `"You do not have access to this resource."`
— no staff names, positions, LINE-link status, shift assignment, shift
preference, or correction-request row appears anywhere in the response body.
No console errors on either Staff session. Confirmed for both Staff A and
Staff B.

## 9. Tenant / location result

Not separately re-tested against a second tenant (none provisioned in this
Preview environment) — covered analytically: `hasManagerAccess` passes
`activeTenant.tenantId` (the caller's own resolved tenant, never
client-supplied) to `api.has_permission`, and `core.has_permission` requires a
matching `role_assignments.tenant_id` row for that exact tenant. A
cross-tenant caller has no such row and is denied by the same mechanism as a
same-tenant Staff caller.

## 10. Location result

`hasManagerAccess` passes the page's already-resolved `location.locationId`
(never client-supplied) into the location-scoped `p_location_id` argument,
unchanged from how every other location-scoped permission check in this
module already works. No location-scoping behavior was added, removed, or
altered.

## 11. Automated tests

- `apps/web/src/lib/workforce/manager-access.test.ts` — 5 tests (grant, deny, RPC-error fail-closed, throw fail-closed, exact RPC args).
- `apps/web/src/app/(protected)/dashboard/workforce/manager/manager-page-authorization.test.ts` — 3 tests (gate call present with correct args, denial precedes the Manager-only fetch, gate runs after location resolution).
- Full `apps/web` suite: **1015/1015 passing** (local, pre-merge) — confirmed green again post-merge via the `typecheck / test / build / lint` GitHub Actions check on the `dev` merge commit.

## 12. Typecheck / lint / build

- `npm run typecheck` (apps/web) — clean.
- `npm run lint` (apps/web) — clean.
- `npm run build` (apps/web) — clean; `/dashboard/workforce/manager` compiles as a dynamic (`ƒ`) route as before.

## 13. PR / merge SHA

- PR: [#231](https://github.com/tantik/line-business-os/pull/231) `fix/cafe-v2-1-manager-route-authorization` → `dev`.
- Merge commit (verified via `git log origin/dev` and `gh pr view 231 --json state,mergeCommit,mergedAt`): `5bfb18438cf3a78d2c8c31be2982306272c6b51d`, state `MERGED`, merged `2026-08-14T11:22:22Z`.
- CI on that exact merge SHA (`gh api .../commits/<sha>/check-runs`): `typecheck / test / build / lint` → **success**; `Vercel` deploy → **success**.

## 14. Preview SHA

`npx vercel inspect https://preview.oruwa.jp` → deployment `dpl_13d46SdPS25T6HQXZWMmA9yQBPkU`,
`target: preview`, `status: ● Ready`, aliased to `https://preview.oruwa.jp`.
This is the exact same deployment id GitHub's commit-status API links from
merge SHA `5bfb1843...`'s `Vercel` status check — cryptographically confirmed,
not inferred, that Preview is serving the merged fix.

## 15. Staff A live result

`staff@mame-to-cha.test` (田中 愛): direct `/dashboard/workforce/manager` →
**DENIED** ("Access denied"). No Manager UI flash, no protected data in the
network response body (verified above), no console errors, no redirect loop.
Canonical Staff page (`/dashboard/workforce/staff`) still fully functional:
profile card, published-schedule grid, inventory card, shift-preference form,
work-report form, correction-request form and history all rendered normally.
Submitted a live shift preference (2026-08-10, `CUSTOM_1786528259098`) — UI
confirmed "Shift preference submitted." and the new row appeared in "My
submitted shift preferences."

## 16. Staff B live result

`staff2@mame-to-cha.test` (佐藤 健): direct `/dashboard/workforce/manager` →
**DENIED** ("Access denied"), same as Staff A. No console errors. Canonical
Staff page loaded correctly (profile card: Barista / Active).

## 17. Manager live result

`manager@mame-to-cha.test`: direct `/dashboard/workforce/manager` →
**ALLOWED**, full dashboard rendered (see §6). Reloaded after Staff A's
submission and confirmed the new preference (田中 愛, 2026-08-10,
`CUSTOM_1786528259098`) appeared in the "Submitted shift preferences" table —
the Staff → Manager request path is live and working end-to-end post-fix.

## 18. Short regression smoke

- Canonical Staff page: works for both Staff A and Staff B. ✅
- Manager schedule (weekly grid, staff roster, shift types, Assign/Publish controls): renders correctly for Manager. ✅
- Staff → Manager request path: Staff A's new shift preference submission propagated to and rendered on the Manager dashboard. ✅
- Manager → Staff schedule sync: not independently re-exercised via a fresh Manager-side write in this pass (out of scope for "short" smoke and unrelated to the auth boundary being fixed); the previously-accepted published schedule (from `CANONICAL_CAFE_PREVIEW_ACCEPTANCE_REPORT_2026-08-14.md`) is confirmed still rendering identically and consistently on both the Manager weekly grid and the Staff published-schedule grid (same shift codes/dates/employees visible on both, e.g. 田中 愛's Published shifts spanning 2026-08-10–08-16 match on both pages).

## 19. Remaining risks

- No live Owner-role or second-tenant retest was performed (no disposable
  credentials/tenant provisioned for this Preview environment) — covered
  analytically only (§7, §9); low risk since no code path added here
  distinguishes Owner from Admin from Manager, and tenant scoping is
  unchanged, pre-existing `core.has_permission` behavior.
- This fix closes the read-side disclosure on the one page identified. It does
  not constitute a broader application-wide authorization audit (explicitly
  out of scope per the task).

## 20. Production untouched confirmation

No Production command was run at any point in this task: no `supabase db
push`/`db pull`/`link`/migration repair, no production deploy, no
customer-data/billing/LINE-broadcast action. All verification was against
`https://preview.oruwa.jp` (Preview target) and the `dev` branch/GitHub API
only. `git log`/`gh pr` calls used were read-only except the already-reviewed
PR #231 merge, which the Founder performed (not this session).

---

## Final verdicts

MANAGER_ROUTE_AUTHORIZATION = PASS
STAFF_MANAGER_DATA_DISCLOSURE = CLOSED
SECURITY_ACCEPTANCE = PASS
CANONICAL_CAFE_PREVIEW = PASS
READY_FOR_ORUWA_CAFE_REFERENCE_TENANT = YES

Stopping here per task instructions — reference tenant creation and v2.2 are
out of scope for this task.
