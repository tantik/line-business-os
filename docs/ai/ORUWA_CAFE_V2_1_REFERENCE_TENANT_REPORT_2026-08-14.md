> **Extraction note, 2026-08-15 (ORUWA AI Governance Consolidation, Phase
> 2B).** Defects A/B/C (§34) were the only standing defect log for this
> workstream; their still-open status (Defect C's recovery half remains
> open, A and B remain open) is now tracked in `docs/ai/current-task.md`
> §2.3. Staff A/B/C acceptance results below were further extended (Staff C
> fully proven) by
> `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF_2026-08-15.md` §3 —
> read that for the current state before citing this report's §16/§33 as
> current. Not superseded otherwise; kept as the evidence-grade record of
> the reference-tenant bootstrap.
>
> **Phase 2C addendum (2026-08-15).** Some 2026-08-14 reports this document
> cross-references (`CANONICAL_CAFE_PREVIEW_ACCEPTANCE_REPORT_2026-08-14.md`,
> `STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md`,
> `MANAGER_ROUTE_AUTHORIZATION_FINAL_REPORT_2026-08-14.md`) were retired as
> fully-superseded process detail; git history preserves them.

# ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT (2026-08-14)

Creation of the first clean canonical Cafe v2.1 reference tenant, "ORUWA Cafe"
(slug `oruwa-cafe`), on top of the accepted Manager route authorization fix.
Production untouched throughout.

## 1. Starting dev SHA

`5bfb18438cf3a78d2c8c31be2982306272c6b51d` — `origin/dev` HEAD at session
start, confirmed to include PR #231 (`fix(cafe): gate Manager dashboard route
on workforce.staff.manage`) via `git merge-base --is-ancestor`. Both
prerequisite reports (`MANAGER_ROUTE_AUTHORIZATION_FINAL_REPORT_2026-08-14.md`,
`CANONICAL_CAFE_PREVIEW_ACCEPTANCE_REPORT_2026-08-14.md`) were read; the
former's final verdict `READY_FOR_ORUWA_CAFE_REFERENCE_TENANT = YES` was the
gate this session executed against.

## 2. Branch / PR

- Branch: `feature/cafe-v2-1-oruwa-reference-tenant`, created from the real
  `origin/dev` tip (5bfb184), not an old feature branch.
- PR [#232](https://github.com/tantik/line-business-os/pull/232) → `dev`. CI
  green (`typecheck / test / build / lint`, `Vercel`). Merged at
  `ee0fadaa7741d9e4647dd470cb38111048433517` (fast-forward-safe merge commit).
- Merge commit diff is exactly 4 files, 100 insertions / 1 deletion — verified
  via `git show --stat` on the merge commit itself, not inferred.

## 3. Portability audit result

Searched canonical runtime code
(`apps/web/src/app/(protected)/dashboard/**`, `apps/web/src/lib/tenant/**`,
`apps/web/src/lib/workforce/**`, `apps/web/src/lib/inventory/**`) for
`mame-to-cha`, hardcoded tenant/location/employee UUIDs, and tenant-slug
branches.

- **One occurrence** of `mame-to-cha` in canonical code: a historical comment
  in `apps/web/src/app/(protected)/dashboard/workforce/staff/page.tsx`
  referencing `_client-preview`'s equivalent behavior. **Category B
  (historical/documentation only)** — no runtime effect.
- **Zero** hardcoded tenant/location/employee UUIDs in canonical runtime code
  (`grep -E` for the UUID pattern, canonical dirs only, excluding tests,
  returned no matches).
- **Zero** QA-email hardcodes in canonical (non-test) files.
- Tenant/module resolution (`getActiveTenantContext`, `requireTenantContext`,
  `listTenantModules`) derives everything from `core.tenant_memberships` and
  an explicit-or-cookie-hinted tenant id, revalidated against live
  memberships every time — no slug/id branch anywhere in this path.

All other `mame-to-cha` matches (48 files) are in the separate, historical
`_client-preview`/`mame-to-cha` route tree (a different, non-canonical
"showcase" surface reachable at `/mame-to-cha/*`) — **Category C (legacy
demo/preview surface)**, untouched, unrelated to the canonical
`/dashboard/**` routes this task targets. Not modified or removed per §29 of
the task brief.

**Conclusion: Cafe is portable at the canonical-code layer with zero fixes
needed there.**

## 4. Cloud onboarding mechanism finding (read before reusing this pattern)

No safe, reusable, Cloud-reaching tenant-onboarding mechanism currently
exists in this repository:

- `packages/db/scripts/onboard-tenant.ts` (+ `onboard-write.ts`/
  `onboard-commit.ts`/`onboard-db.ts`) is a real, carefully staged (3a→4e),
  idempotent onboarding routine — but it is **hard-locked to local-only** at
  three independent layers (`assertLocalDatabaseUrl`, the pure preflight
  checklist, and the commit gates all explicitly reject any
  `.supabase.co`/Cloud-like host). This is deliberate, documented safety
  scoping (`docs/operations/client-onboarding-runbook.md`: *"Real Cloud/prod
  onboarding remains a future, separately approved process... must not be
  treated as executable from this runbook."*), not an oversight.
- There is **no self-service sign-up UI** anywhere in the app (`signUp`/
  `sign-up` do not exist as a route). The first Owner/Manager identity for a
  brand-new tenant can only be created by an operator directly in Supabase
  Studio (Option A in the runbook: owner signs up first, operator manually
  copies the resulting auth UUID) — there is no programmatic path.
- The real Staff invite flow (`invite-employee` Edge Function,
  `auth.admin.inviteUserByEmail`) requires a Manager to already exist to call
  it, and depends on real email delivery.

Given this, per explicit Founder approval, **migration
`0068_oruwa_cafe_reference_tenant.sql`** was used as a **one-time bootstrap
exception** for this specific reference tenant, using the exact same
idempotent `insert ... on conflict do nothing` shape as
`supabase/seed/seed.sql`'s existing demo tenants (tenant/location/module rows
only — no schema change, no RLS change). **This is explicitly documented in
the migration's own header comment as not the intended repeatable mechanism.**

**Two separate post-v2.1 Platform Foundation gaps are recorded here for a
dedicated future task (not built this session):**

1. **Generic safe Cloud tenant onboarding** — extend
   `packages/db/scripts/onboard-tenant.ts` with an explicitly-gated
   `--target preview`/Cloud mode carrying equivalent backup/preflight/
   idempotency/approval safeguards to the existing `--target local` path, so
   future tenants never require a hand-written migration.
2. **First Owner/Manager bootstrap provisioning** — a safe, non-Studio path to
   create the very first tenant-owner identity for a new tenant (today this
   requires manual Supabase Studio user creation plus manual
   `core.users`/`core.tenant_memberships`/`core.role_assignments` linking via
   a privileged DB channel).

These two gaps should eventually converge into one controlled,
Founder-approved customer-onboarding workflow — building that workflow was
explicitly out of scope for this task.

## 5. Onboarding mechanism used (this session)

1. Migration `0068_oruwa_cafe_reference_tenant.sql` — created via
   `supabase db push --linked` against the Preview-linked project
   (`pehcoenozjtsjdvjietj` / `line-business-os-dev`, confirmed as the exact
   project backing `https://preview.oruwa.jp` via
   `NEXT_PUBLIC_SUPABASE_URL` in `.env.local.cloud-backup*` and via the
   GitHub commit-status → Vercel deployment cross-check in §2). Creates
   `core.tenants`/`core.locations`/`core.tenant_modules` rows only.
2. Manager identity bootstrap (Option A, Founder-executed): Founder created
   the disposable Auth user `manager@oruwa-cafe.test` directly in Supabase
   Studio for the Preview project and supplied the resulting auth UUID
   (`1236004e-de3e-45e0-9736-92ca06c8ce50`) to this session. This session then
   bound `core.users` (mirror row, no PII columns), `core.tenant_memberships`
   (`status = active`, `location_id = null`), and `core.role_assignments`
   (`manager` system role, `location_id = null`, tenant-wide) via the same
   privileged `supabase db query --linked` channel used for the read-only
   verification queries below — mirroring exactly the same
   membership/role shape already in place for the real Mame To Cha manager
   (verified by querying that tenant's own `core.role_assignments`/
   `core.tenant_memberships` rows first, before writing anything).
3. Reference employees (Staff A/B), one shift-type-bearing schedule week, and
   inventory items were all created through the real canonical Manager UI
   (`/dashboard/workforce/manager`, `/dashboard/inventory`) — no direct SQL.
4. Recipes/manuals (category + 2 recipes + ingredients/steps) were created via
   the privileged DB channel, because the canonical `/dashboard/workforce/
   recipes` route is **read-only** (no creation UI exists there for either
   Manager or Staff) — this is pre-existing, unrelated to this task, and not
   something this session built or should improvise a UI for.

## 6. Tenant id

`72b81b2f-9ba5-4a4a-a296-02e32d4682b8` — freshly generated, does not reuse any
Mame To Cha id.

## 7. Location id(s)

`4bad308e-f8d3-4c20-a158-b6eb3bafa71b` ("ORUWA Cafe Main Store", `Asia/Tokyo`)
— freshly generated, one location per the task's default recommendation.

## 8. Enabled modules/configuration

`core`, `workforce`, `inventory` — exactly `CAFE_PACKAGE_V2_TEMPLATE
.requiredModules` from `packages/db/scripts/cafe-package-template.ts`
(the versioned, non-secret Cafe Package v2 contract). Verified live on the
canonical `/dashboard` page: "Modules — total: 3 | enabled: 3".

## 9. Manager identity architecture

`manager@oruwa-cafe.test` → `auth.users.id =
1236004e-de3e-45e0-9736-92ca06c8ce50` → `core.users` mirror (no PII columns
set) → `core.tenant_memberships` (`status = active`, tenant-wide) →
`core.role_assignments` (`manager` system role,
`00000000-0000-0000-0000-000000000005`, tenant-wide). Identical shape to the
real Mame To Cha manager's own role assignment, verified by direct comparison
before writing.

## 10. Staff A / Staff B identity architecture

**Not provisioned this session — blocked, not a leftover.** See §16.

## 11. Reference employees created

Two `workforce.employees` rows, created through the real canonical Manager
"Add staff" form (after the bug fix in §17):

- 田中 美咲 (Tanaka Misaki) — Barista, part_time, Active.
- 佐藤 陽介 (Sato Yosuke) — Barista, part_time, Active.

Both are fictional Japanese names; no real personal data used.

## 12. Reference Workforce data

One published week (2026-08-10–08-16) with 3 draft-then-published shifts:

- 田中美咲: Mon 09:00–13:00.
- 佐藤陽介: Mon 13:00–17:00, Tue 09:00–13:00.

All created via the real Manager "Assign" → "Publish schedule" flow (the
confirm dialog was accepted, matching the real product UX). Auto-generated
`Custom` shift type per the canonical route's own established pattern (same
`CUSTOM_...` mechanism documented in the prior acceptance reports).

## 13. Reference Inventory data

Two items, created via the real Manager `/dashboard/inventory` "+ Add item"
UI, with real stock counts recorded via the real "Save count" action:

- 牛乳 (Milk): target 10 L, reorder 3 L, counted 8 L → **Sufficient**.
- コーヒー豆 (Coffee beans): target 5 kg, reorder 2 kg, counted 1 kg →
  **⚠ Shortage — need 4 kg** (demonstrates the recommended-purchase/shortage
  calculation, per task §10 requirement).

## 14. Reference Recipes/manuals data

One category (ドリンク / Drinks) and two published recipes, created via the
privileged DB channel (§5.4), matching the exact `workforce.recipes` schema
shape:

- カフェラテ (Cafe Latte) — Japanese description, 2 ingredients, 2 steps,
  `is_popular = true`.
- 抹茶ラテ (Matcha Latte) — Japanese description, `is_popular = false`.

Both fictional, simple, non-copyrighted content.

## 15. Manager acceptance

**PASS.** Live-tested with `manager@oruwa-cafe.test` on Preview:

- Sign-in → `/dashboard` shows the correct active tenant (ORUWA Cafe,
  `oruwa-cafe`, `client`, 1 membership, 3/3 modules enabled), zero Mame To
  Cha data visible.
- `/dashboard/workforce/manager` → **ALLOWED** (the `workforce.staff.manage`
  gate from PR #231 correctly grants the `manager` role holder access),
  correct tenant/location header ("ORUWA Cafe - ORUWA Cafe Main Store").
- Staff roster: create (after §17 fix), list, both employees visible with
  real names/position/status.
- Weekly schedule: Assign, auto-created Custom shift type, Publish schedule
  (with confirm dialog) — all functioned; cells correctly show
  "Published — read-only" post-publish.
- `/dashboard/inventory`: create item, record stock count, correct shortage
  calculation.
- `/dashboard/workforce/recipes`: real ORUWA Cafe recipe data renders
  correctly (JA content, ingredients, steps).
- No Mame To Cha data visible on any of the above surfaces.

## 16. Staff A / Staff B acceptance

**NOT_TESTABLE — exact reason.** Inviting either Staff account through the
real `invite-employee` Edge Function (Manager UI → "招待する" button) failed
with `{"status":"unexpected_error","message":"The invitation service reported
an error (auth_admin_error)."}` on the first attempt. This is the same error
category (`auth_admin_error`) as the prior session's confirmed Supabase
default-email-sender rate-limit exhaustion documented in
`STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md` §10
(`auth_admin_invite_failed: email rate limit exceeded`). Per explicit
instruction, this session did **not** retry and did **not** fall back to
manual Auth UUID binding. Verified via direct read-only DB query that the
failure was fully atomic: zero rows in `workforce.employee_invitations` for
this tenant, zero stray `auth.users` rows created — clean state preserved.

Everything downstream of a working Staff login (Staff A/B dashboard
acceptance, cross-account attribution, Manager→Staff live-sync from the Staff
side, Staff-side JA/EN, Staff-side Manager-route denial) is consequently
**NOT_TESTABLE this session**, not a defect.

## 17. Bug found and fixed: canonical Add-staff form

Discovered while creating the first ORUWA Cafe reference employee — **not
tenant-specific, would have blocked Mame To Cha's Manager identically.**
`parseUpsertEmployeeInput` (`employees-input.ts`) requires `familyName`/
`givenName`/`email` in the submitted `FormData` and rejects the entire
submission with `{"status":"unexpected_error","message":"Invalid input."}`
when any are absent — but the client component
(`dashboard/workforce/manager/staff-form.tsx`) only ever submitted `name`/
`positionLabel`/`employmentType`. Every create/edit through this exact form,
for any tenant, always failed.

**Fix:** added the three missing required `<input>` fields
(`familyName`/`givenName`/`email`) to `staff-form.tsx`, wired from
`WorkforceStaffManageEntry`'s existing (already-typed) fields for edit
prefill. **Minimum-scope, no tenant special-case, no RLS/permission/security
change.** Regression guard added
(`staff-form.test.ts`, source-text based, matching this repo's established
pattern for `.tsx` client-component tests). Shipped via PR #232 alongside the
tenant migration, merged to `dev`, deployed to Preview, verified live before
use (confirmed the deployed Vercel deployment id for the merge SHA matches
the `preview.oruwa.jp` alias exactly).

## 18. Cross-account attribution

**NOT_TESTABLE** — blocked by §16 (no second Staff identity available).

## 19. Manager → Staff sync

**NOT_TESTABLE from the Staff side** — blocked by §16. The Manager-side half
(create/publish a real shift through the real UI) is proven working (§12/§15);
only the Staff-side confirmation of receiving it is blocked.

## 20. Tenant isolation

**PASS — both directions, live-verified.**

- **ORUWA Cafe → Mame To Cha:** the entire ORUWA Cafe Manager acceptance pass
  (§15) — dashboard, `/dashboard/workforce/manager`, `/dashboard/inventory`,
  `/dashboard/workforce/recipes` — showed zero Mame To Cha data at any point.
- **Mame To Cha → ORUWA Cafe:** signed in as the real, pre-existing
  `manager@mame-to-cha.test` (credentials from `docs/QA_ACCESS.md`) and
  confirmed: `/dashboard` shows only the Mame To Cha tenant (1 membership,
  2/2 modules, no ORUWA Cafe); `/dashboard/inventory` shows exactly the same
  5 pre-existing items from the prior acceptance report (Coffee beans, Matcha
  powder, Water, Ice, Milk) with the same shortage state (Ice, Milk flagged),
  zero ORUWA Cafe items (牛乳/コーヒー豆) visible; `/dashboard/workforce/
  recipes` shows only Mame To Cha's own 10 recipes — critically, Mame To
  Cha's **own, separate** "ドリンク" category (same label as ORUWA Cafe's
  category, different `tenant_id` row) correctly shows "No recipes in this
  category yet.", proving zero cross-tenant bleed even between
  identically-labeled category rows.

## 21. Inventory isolation

**PASS.** Covered directly by §20's live bidirectional check — no additional
gap found.

## 22. Recipes isolation

**PASS.** Covered directly by §20's live bidirectional check, including the
same-label-different-tenant category edge case.

## 23. JA/EN result

**PASS_WITH_KNOWN_ARCHITECTURAL_BOUNDARY, not independently expanded this
session.** The canonical Manager dashboard (`/dashboard/workforce/manager`,
`/dashboard/inventory`) has no language toggle and is English-chrome-only by
existing design (confirmed by source inspection — no i18n/locale usage in
`manager/page.tsx` or `manager-dashboard-client.tsx`); this matches the prior
consolidation reports' documented finding that JA/EN toggling exists only on
the canonical **Staff** page. All Japanese *content* rendered correctly
wherever present regardless of UI chrome language: employee names (田中美咲,
佐藤陽介), recipe titles/descriptions/ingredients/steps (カフェラテ,
抹茶ラテ, エスプレッソ, etc.) all displayed correctly. Full JA/EN toggle
acceptance requires the Staff surface, which is blocked by §16.

## 24. Manager-route security

**PASS.** Reconfirmed live on the new tenant: `manager@oruwa-cafe.test` →
`/dashboard/workforce/manager` → **ALLOWED**, full dashboard renders,
correctly scoped to ORUWA Cafe. This proves PR #231's `hasManagerAccess`
gate (`workforce.staff.manage` via `api.has_permission`) is genuinely generic
— it worked correctly for a brand-new tenant + brand-new manager role
assignment it had never seen before, with zero tenant-specific code. The
Staff-denial half of this check (a Staff account hitting the same route and
being denied) is **NOT_TESTABLE** — blocked by §16, same as the rest of the
Staff-side matrix.

## 25. Tenant-specific runtime branches

**0.** Verified directly via `git show --stat` on the actual merge commit
(`ee0fadaa`): exactly 4 files changed (`apps/web/package.json`,
`staff-form.tsx`, `staff-form.test.ts`, the migration). `oruwa-cafe`/`ORUWA
Cafe` appears only in: the migration's own seed data (expected — that *is*
the tenant's identity data), one code comment in `staff-form.test.ts`
documenting how the bug was discovered, and this report/the migration's
header prose. **Zero occurrences in any conditional/behavioral code path.**
No `if (tenant.slug === 'oruwa-cafe')`-shaped code exists anywhere.

## 26. Automated test results

- `npm run test` (apps/web): **1016/1016 pass** (was 1015/1015 before this
  session's one new test file).
- `npx tsc --noEmit`: clean.
- `npx eslint` on changed files: clean.
- `npm run build`: succeeded, `/dashboard/workforce/manager` compiles as a
  dynamic route as before, no new warnings.
- No DB/RLS/schema change was made beyond the additive, idempotent migration
  (tenant/location/module rows only) — pgTAP was not re-run since no
  RLS/policy/schema logic changed; the existing full pgTAP suite from the
  prerequisite report (803/803 at last run) remains the relevant coverage for
  tenant-isolation RLS itself, and this session's own live bidirectional
  check (§20) is direct, additional evidence on top of that.

## 27. Preview deployment/state

`preview.oruwa.jp` confirmed serving the merge commit for PR #232
(`ee0fadaa7741d9e4647dd470cb38111048433517`) — cross-verified via GitHub's
commit-status API (`Vercel` context → deployment
`dpl_8NBa3wgFJAbMYdZd9M5gNE4Gdexz`) matching `npx vercel inspect
https://preview.oruwa.jp`'s resolved deployment id exactly, not inferred.

## 28. Persistent reference data left intentionally

Per §27 of the task brief (reference tenant persistence — do not clean up):

- Tenant `ORUWA Cafe` (`oruwa-cafe`, `72b81b2f-9ba5-4a4a-a296-02e32d4682b8`)
  and its one location.
- 3 enabled modules (`core`, `workforce`, `inventory`).
- Manager identity (`manager@oruwa-cafe.test`) and its `manager` role
  assignment.
- 2 reference employees (田中美咲, 佐藤陽介), both Active.
- 1 published reference week (3 shifts, §12).
- 2 reference inventory items with real recorded counts (§13).
- 1 recipe category + 2 published recipes with ingredients/steps (§14).
- Migration `0068` and the `staff-form.tsx` fix, merged to `dev` (PR #232).

## 29. Disposable QA artifacts cleaned

None needed cleanup — every write made this session (schedule, inventory
counts, employees, recipes, Manager identity) is intended to remain as
permanent reference data per §28, and the one failed action (Staff invite,
§16) left zero rows to clean up (verified).

## 30. Known v2.1 polish issues

- **BLOCKER (external, not architectural):** Supabase default email sender
  rate-limited again, blocking Staff Auth Provisioning invites — same
  recurring issue as the prior session. Recommend custom SMTP configuration
  on the Preview Supabase project before the next attempt (same
  recommendation as `STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md`).
- **V2.1 POLISH:** the canonical Manager dashboard has no JA/EN toggle
  (English-only chrome) while the Staff dashboard does — a known,
  pre-existing scope boundary (§23), not introduced or worsened this session.
- **KNOWN LEGACY:** the canonical `/dashboard/workforce/recipes` route has no
  content-creation UI for either Manager or Staff (§5.4) — recipes must be
  created through a privileged DB channel today. Not this session's defect to
  fix (out of the explicitly authorized bootstrap scope), but worth folding
  into the two Platform Foundation gaps recorded in §4 if a real customer
  onboarding workflow is designed next.

## 31. Legacy/dead/duplicate code findings deferred to later cleanup

- The `_client-preview`/`mame-to-cha` route tree (48 files matched
  `mame-to-cha` in §3) remains untouched, exactly as instructed (§29 of the
  task brief: do not launch cleanup now). No new findings beyond what the
  prerequisite reports already documented.

## 32. Production untouched confirmation

**YES.** No Production command was run at any point: no `supabase db push/
pull/link/migration repair` against any Production project, no production
deploy, no customer-data/billing/LINE-broadcast action. All `supabase db
push`/`supabase db query --linked` calls targeted the Preview-linked project
(`pehcoenozjtsjdvjietj`) only, confirmed by `npx supabase projects list`
before any write and cross-checked against `preview.oruwa.jp`'s actual
Supabase URL. All PR/merge activity targeted `dev`, never `main`.

---

## 33. Continuation session — Staff A real provisioning/acceptance (supersedes §16 for Staff A)

Custom SMTP (Resend, `auth.oruwa.jp`, sender `noreply@auth.oruwa.jp`) was configured
on the Preview Supabase Auth project ahead of this continuation, resolving the
§16/§30 email-rate-limit blocker. Staff A (田中美咲, `employee.id =
47111fc0-48b2-4fe3-b747-918a35d0bab1`) was carried through the real, unmodified
canonical flow end to end:

1. **Real invite via Manager UI** (`/dashboard/workforce/manager` →
   "招待する") succeeded on the first attempt — no `auth_admin_error`, confirming
   the SMTP fix. Initial employee contact email was `staff-a@oruwa-cafe.test`
   (a leftover placeholder from the blocked prior session); discovered
   mid-flow that `.test` is an IANA-reserved, non-routable TLD, so no real
   mailbox could ever receive it. Per Founder direction, that invitation was
   cleanly revoked (canonical "取り消す" action, verified zero stray rows) and
   the employee's email was updated via the canonical Edit form to a real,
   Founder-supplied reachable address, used **only** for this acceptance test
   and not persisted anywhere in the repo.
2. **Real email delivery verified** by the Founder directly in the target
   inbox (Resend "Delivered").
3. **Auth redirect defect found and fixed** (see Defect C, §34) — the first
   real click landed on `http://localhost:3000/#access_token=...` instead of
   the app, because the Preview Supabase Auth project's **Site URL** was
   still the platform default (`http://localhost:3000`) and
   `https://preview.oruwa.jp/auth/accept-invite` was not in **Redirect
   URLs**. Diagnosed read-only (Edge Function source, DB timestamps, network
   behavior fingerprint) before any change; fix scoped and confirmed
   Preview-only, no Production project exists yet for `app.oruwa.jp`
   (confirmed via `docs/phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md`
   and `supabase projects list`). Founder applied the two-value fix
   (Site URL, Redirect URLs) directly in Supabase Studio; verified
   working live immediately after (a stale link correctly then redirected to
   `preview.oruwa.jp` with `otp_expired`, i.e. reached the right app and
   correctly rejected the already-consumed token).
4. **Real canonical acceptance completed live**: Founder signed in as Staff A
   (temporary password set via one-time, narrowly-scoped Admin API call on
   the *existing* Auth user — no new/duplicate user created; same mechanism
   already used for the Manager identity in §5.2) and clicked "承認する" on
   the in-app `PendingInvitationBanner`, running the real
   `api.accept_employee_invitation` RPC.
5. **DB-verified end state, live-tested**:
   - `workforce.employee_invitations`: exactly 2 rows for this tenant (1
     `revoked` from the `.test`-domain attempt, 1 `accepted` at
     `2026-08-14 14:48:13 UTC`, correct `target_user_id`). No duplicates.
   - `workforce.employees`: still exactly 2 rows tenant-wide; Staff A's row
     now `user_id`-bound to the correct Auth user; Staff B's row unchanged
     (`user_id = null`).
   - `core.tenant_memberships`: exactly 1 row, ORUWA Cafe, `active`.
   - `core.role_assignments`: exactly 1 row, `employee` (not manager/owner),
     correctly location-scoped to ORUWA Cafe Main Store.
   - Live sign-in as Staff A: `/dashboard/workforce/staff` shows own profile
     only (Barista, part_time, Active, correct 4.0h scheduled hours matching
     the real published shift); `/dashboard/workforce/manager` →
     **"Access denied"** (Manager-route Staff-deny half of §24, now closed);
     `/dashboard/admin` unexpectedly loaded (see Defect A, §34) but rendered
     no privileged data/actions.

**STAFF_A_ACCEPTANCE = PASS** (supersedes §16/§30's NOT_TESTABLE). Manager-route
security (§24) is now fully closed both directions. Three defects were found
during this work and are tracked, unresolved, in §34 — none of them were
fixed as part of reaching this PASS, per explicit instruction.

## 34. Defects found this continuation (tracked, NOT fixed)

**Defect A — `/dashboard/admin` has no role/permission gate.**
Severity: Low–Medium (defense-in-depth gap, not an active leak today).
`apps/web/src/app/(protected)/dashboard/admin/page.tsx` calls only
`requireTenantContext()` (membership check) — no `has_permission`/role check,
unlike `/dashboard/workforce/manager`'s explicit `workforce.staff.manage`
gate (PR #231). Live-verified: Staff A can load this route. It is currently
inert only because every read on the page is itself RLS-scoped (member list
renders empty for a non-manager caller) and every management action is a
hardcoded-disabled placeholder — there is no route-level enforcement backing
that. **Must be resolved (an explicit permission/role gate added) before any
real privileged action is wired onto `/dashboard/admin`.**

**Defect B — `PendingInvitationBanner` invitation visibility not scoped to
the intended recipient.** Severity: Low (information disclosure only; no
unauthorized write is possible — `api.accept_employee_invitation` independently
re-checks `target_user_id = caller`). `listMyPendingWorkforceInvitations`
(`apps/web/src/lib/workforce/invitations.ts`) filters only by
`status = 'pending'`, relying solely on RLS to scope results to "self." But
`workforce.employee_invitations` also carries `wf_employee_invitations_manager_read`
(tenant-wide, for any caller with `workforce.staff.manage` in that tenant),
and Postgres RLS policies for the same command are OR'd — so a Manager
viewing their own tenant also satisfies this "self" query and sees (and gets
an Accept button for) other people's pending invitations. Live-reproduced
twice this session on the Manager session for ORUWA Cafe.
**Must be corrected so invitation visibility is properly scoped to the
intended recipient** — e.g. add an explicit `target_user_id = auth.uid()`
filter in the query itself rather than relying on RLS policy composition, or
split the self-read policy onto a dedicated view.

**Defect C — new-hire onboarding has no recovery path if the Supabase Auth
token is consumed before the app-level acceptance step completes.**
Severity: Medium (onboarding-reliability blocker for real customers, not
just this session's misconfigured Site URL). Sequence: an invited new user's
email link is clicked, Supabase Auth exchanges the one-time token
server-side (marking the user `confirmed`, issuing a session) — but the
browser fails to reach the app's own `/auth/accept-invite` → password-setup →
`api.accept_employee_invitation` steps (this session: caused by the
now-fixed Site URL misconfiguration; in general: could equally be a closed
tab, lost connection, or any interruption). The user is left with: a
`confirmed` Auth identity, **no password**, and a still-`pending` app-level
invitation. `invite-employee`'s own "already-registered → send no email, use
the in-app banner" logic (Founder decision 8, documented in
`docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md`) then permanently
forecloses the resend-email path — confirmed live this session
(`auth.users.invited_at` provably unchanged by the resend attempt; only the
DB-side invitation row's `expires_at` refreshed, no second email dispatched).
That assumption is correct for an *existing* ORUWA member being invited to a
second tenant (they have another way to reach an authenticated session), but
it does not hold for a first-time hire, who has no self-service path at all —
`/sign-in` explicitly states "password reset... not available yet." Recovery
this session required a manual, narrowly-scoped Admin API password-set — **an
explicitly-labeled recovery-only workaround, not a fix.**
**Must remain explicitly tracked as an onboarding-reliability blocker
requiring a reviewed, permanent solution (e.g. a self-service
password-set/recovery flow, or detecting-and-repairing this specific limbo
state server-side) before this flow is relied on for real customer
onboarding.** Not designed or implemented this session.

---

## Final verdicts

```
CAFE_PORTABILITY = PASS
NEW_CUSTOMER_WITHOUT_CODE_CHANGE = YES
ORUWA_CAFE_TENANT = PASS
MANAGER_ACCEPTANCE = PASS
STAFF_A_ACCEPTANCE = PASS (§33 — real invite, real email delivery, real canonical acceptance; supersedes prior NOT_TESTABLE)
STAFF_B_ACCEPTANCE = PENDING (next step, this continuation)
IDENTITY_ATTRIBUTION = PENDING (blocked on Staff B)
TENANT_ISOLATION = PASS
INVENTORY_ISOLATION = PASS
RECIPES_ISOLATION = PASS
MANAGER_SECURITY = PASS (both directions closed: Manager-allow §15/§24, Staff-deny live-verified §33)
I18N_ACCEPTANCE = PASS_WITH_POLISH (Manager surface has no toggle by pre-existing design; Staff-side toggle now testable, not yet independently re-verified this continuation)
TENANT_SPECIFIC_RUNTIME_BRANCHES = 0
QA_DATA_CLEAN = YES (Staff A/B employee rows and Manager identity are intentional persistent reference data per §28; no stray rows from the revoked `.test`-domain attempt)
PRODUCTION_UNTOUCHED = YES
DEFECTS_OPEN = 3 (A: /dashboard/admin missing permission gate — Low-Medium; B: pending-invitation visibility not scoped to recipient — Low; C: no onboarding recovery path if Auth token consumed before app-level acceptance — Medium, onboarding-reliability blocker)
CAFE_V2_1_REFERENCE_TENANT_READY = PARTIAL — Manager surface and Staff A fully proven end-to-end; Staff B/cross-account attribution pending; 3 open defects tracked, none blocking Staff A's own PASS, Defect C blocks reliance on this flow for real customer onboarding until fixed
```

## Exact next recommended action

1. Staff B provisioning + cross-account attribution checks, using a reachable
   test email and the now-proven Staff A flow as reference (avoid repeating
   the `.test`-domain / broken-redirect recovery sequence intentionally).
2. Separately scope and review fixes for Defects A, B, and C (§34) — not
   urgent for Staff A/B acceptance itself, but Defect A must be resolved
   before any real privileged action is enabled on `/dashboard/admin`, and
   Defect C must be resolved before this invite flow is relied on for real
   customer onboarding.
3. When convenient, scope the two Platform Foundation gaps from §4 as a
   dedicated follow-up task (generic Cloud onboarding; first Owner/Manager
   bootstrap) — not urgent, but this session's bootstrap-migration approach
   should not be repeated for the next real customer.
