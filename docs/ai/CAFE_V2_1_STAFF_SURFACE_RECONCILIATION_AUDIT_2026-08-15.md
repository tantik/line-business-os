> **Status update, 2026-08-15 (later same day).** The P0 finding below
> (§1, §10 item 1 — Manager could not decide a Staff shift-exchange request
> on the canonical surface) is **CLOSED** as of commit `f476792`
> ("feat(cafe): canonical Manager UI to approve/reject Staff shift-exchange
> requests"), merged to `dev`. The P1/P2 items and the final verdict's
> `FULL_CAFE_V2_1_STAFF_ACCEPTANCE = NOT_READY` remain otherwise accurate.
> Current status tracked in `docs/ai/current-task.md` §2.3 — treat that file,
> not this one, as the live status; this document remains the authoritative
> evidence record for everything except the P0 item.
>
> **Phase 2C addendum (2026-08-15).** `CANONICAL_CAFE_STAFF_CONSOLIDATION_LOCAL_REPORT_2026-08-14.md`,
> cross-referenced below, was retired as fully-superseded local-implementation
> detail (ORUWA AI Governance Consolidation, Phase 2C); git history preserves
> it.

# CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT (2026-08-15)

Read-only investigation and documentation only. No code, routes, DB/RLS, or
Auth configuration were changed while producing this document. Branch:
`audit/cafe-v2-1-staff-surface-reconciliation`, created off `origin/dev` at
`f4b7cda` (confirmed identical to the handoff's recorded HEAD). Working tree
otherwise unmodified except for this file.

Evidence markers used throughout: **VERIFIED** (tool output — file read,
grep, git log/show — observed directly in this session), **INFERRED**
(reasonable conclusion from VERIFIED evidence but not directly proven),
**UNKNOWN** (not established either way), **NOT TESTED** (a check that
could be run but wasn't, e.g. live browser verification).

---

## 1. Executive conclusion

The Cafe v2.1 Staff product experience is built on **four** distinct Staff-
or Staff-adjacent route trees, not the two or three previously documented:

1. **Surface B** — `apps/web/src/app/(protected)/dashboard/workforce/**`
   ("dashboard") — real per-employee Supabase Auth, the actual onboarding
   landing target, and the surface a Founder decision (PR #228, 2026-08-14)
   already designated **canonical**.
2. **Surface A** — `apps/web/src/app/%5Fclient-preview/mame-to-cha/**`
   ("preview") — also real Supabase-Auth-backed, reachable only on the
   `preview.oruwa.jp` host via a Next.js rewrite, originally built (July
   2026) as a **client-acceptance/demo environment**, later repurposed as
   the **UX reference implementation** that Surface B's gaps were measured
   against and ported from.
3. **Surface A′** — `apps/web/src/app/mame-to-cha/**` — an unauthenticated,
   localStorage-mock public sales-demo surface, sharing its URL namespace
   with Surface A (disambiguated only by `Host` header) and functionally
   identical to `apps/web/src/app/demo/cafe/**`, its sibling brand-skin.
4. **`apps/web/src/app/workforce/page.tsx`** — a previously-undocumented,
   apparently dead/orphaned static stub with no auth, no data, and two
   `next.config.mjs` redirects pointing at routes (`/workforce/shifts`,
   `/workforce/manager`) that do not exist anywhere in the current tree.

**Backend logic is not duplicated.** Surfaces A and B share one
`lib/workforce/*`/`lib/inventory/*` service layer end to end (identity,
tenant/location, schedule, preferences, attendance, corrections, exchange,
recipes, inventory) — verified function-by-function, file:line, by direct
code reading (§5). The divergence is real but is a **presentation/UX and
completeness gap**, not an architectural split of two independently
evolving applications.

**The most significant, previously-undocumented finding of this audit**:
Surface B (canonical, production) lets a Staff member submit a shift-
exchange request (`shift-exchange-request-form.tsx` exists and is wired into
`staff-dashboard-client.tsx`), but the canonical Manager surface
(`(protected)/dashboard/workforce/manager/**`) contains **zero**
exchange-related code — no file, no import, no UI (confirmed by exhaustive
grep, §4/§10). The only UI anywhere in the repository that can decide a
shift-exchange request is Surface A's Manager panel, which is reachable
only on the `preview.oruwa.jp` host behind `requirePreviewUser()` — not a
route any real production Manager uses day to day. **A real Cafe Manager
today has no way to approve or deny a shift-exchange request a real Staff
member submits on the canonical surface.** This is classified P0 (§10).

**Verdict (§16): reconciliation is required before full Cafe v2.1
acceptance.** The onboarding path, backend, and core security model are
sound and already converged; the gaps are enumerated and bounded (§10), not
open-ended architectural rework.

---

## 2. Verified route/surface map

All entries below are **VERIFIED** via direct file reads/`Glob`/`grep`
against the current working tree at `f4b7cda`, cross-checked against
`git ls-tree HEAD`.

### 2.1 The `%5Fclient-preview` naming — resolved

The literal on-disk (and git-tree-committed) directory name is
`%5Fclient-preview` — the five ASCII characters `%`, `5`, `F`, `c`, `l`... —
**not** a real underscore. This is intentional, not a mangled artifact:
Next.js App Router treats a folder whose *name* starts with a literal `_`
as a private folder excluded from routing. `apps/web/src/lib/preview/
rewrite-config.mjs` rewrites public requests to the URL path
`/_client-preview/mame-to-cha/...`; for that path to resolve to a real,
routable folder, the folder must be physically named with the documented
`%5F` (percent-encoded underscore) escape so Next.js does not treat it as
private. The folder is functioning exactly as designed.

### 2.2 Surface B — `(protected)/dashboard/workforce/**` (canonical, production)

| Route | Auth | Permission gate | Tenant/location | Data source |
|---|---|---|---|---|
| `workforce/page.tsx` (hub) | `requireUser()` (group) + `requireTenantContext()` | module-enable only | real membership | real Supabase |
| `workforce/staff/page.tsx` | `requireUser()` + `requireTenantContext()` | module-enable only, no manager-permission check | real membership; **lenient** location fallback (`profile.locationId ?? first active ?? tenantLocations[0]`) | real Supabase via `lib/workforce/*` |
| `workforce/manager/page.tsx` | `requireUser()` + `requireTenantContext()` | `hasManagerAccess()` → `api.has_permission('workforce.staff.manage')` RPC | real membership; first-active-or-any location, no ambiguity detection | real Supabase via `lib/workforce/*` |
| `workforce/recipes/page.tsx`, `recipes/[recipeId]/page.tsx` | `requireUser()` + `requireTenantContext()` | module-enable only | real membership | real Supabase via `lib/workforce/recipes` |

Wrapped by `apps/web/src/app/(protected)/layout.tsx` (`requireUser()` group
gate) → root `apps/web/src/app/layout.tsx`. This is the route Staff C
actually landed on after real onboarding (handoff §3).

### 2.3 Surface A — `%5Fclient-preview/mame-to-cha/**` (preview / client-acceptance / UX reference)

| Route | Auth | Permission gate | Tenant/location | Data source |
|---|---|---|---|---|
| `mame-to-cha/page.tsx` (staff) | `requirePreviewUser()` | module + strict profile gate | **hardcoded** tenant slug `mame-to-cha`; **strict** location resolution (fails closed on mismatch) | real Supabase via `lib/workforce/*` |
| `mame-to-cha/staff/page.tsx` | none | none | n/a | `permanentRedirect('/mame-to-cha')` — legacy URL shim only |
| `mame-to-cha/manager/page.tsx` | `requirePreviewUser()` | `authorizePreviewManagerPage()` → same `workforce.staff.manage` RPC | hardcoded tenant slug; strict single-active-location (fails closed on 0 or >1) | real Supabase via `lib/workforce/*` |
| `mame-to-cha/recipes/page.tsx`, `recipes/[recipeId]/page.tsx` | `requirePreviewUser()` | module gate only | hardcoded tenant | real Supabase |

**Reachability**: only on host `preview.oruwa.jp` (`PREVIEW_HOST_PATTERN`
in `rewrite-config.mjs`), via a `next.config.mjs` `beforeFiles` rewrite from
public path `/mame-to-cha/**` to `/_client-preview/mame-to-cha/**`. On every
other host, `/mame-to-cha/**` resolves to Surface A′ instead (§2.4) — the
two surfaces share a URL namespace, disambiguated purely by `Host` header.

### 2.4 Surface A′ — `mame-to-cha/**` (public mock demo) and its sibling `demo/cafe/**`

No auth, no tenant, no permission checks, hardcoded/localStorage mock data
(`@/lib/demo/cafe/data`, `CURRENT_STAFF_ID`, `STAFF` fixture array), zero
Supabase imports. `apps/web/src/app/mame-to-cha/staff/page.tsx` and
`apps/web/src/app/demo/cafe/staff/page.tsx` are structurally identical —
both render the same `<StaffView/>` component, differing only in the
`BrandProvider brand=` prop (`MAME_TO_CHA_BRAND` vs `CAFE_DEMO_BRAND`).
Confirmed sibling brand-skins of one shared mock package, not two
independent builds.

### 2.5 `apps/web/src/app/workforce/page.tsx` — orphaned stub (new finding)

Static, unauthenticated placeholder page with two `<a>` links to
`/workforce/shifts` and `/workforce/manager`. Neither route exists anywhere
under `apps/web/src/app/workforce/` (confirmed: exactly one file exists in
that directory). `apps/web/next.config.mjs` additionally carries two
unrelated top-level `redirects()` — `/shifts → /workforce/shifts` and
`/manager → /workforce/manager` — that point at the same non-existent
targets. This was not identified in any prior audit doc. Not part of the
Staff onboarding path, not linked from any live surface's navigation
(confirmed: no `href="/workforce"` found in Surfaces A/A′/B). Classified
**obsolete / dead code** (§11).

### 2.6 Middleware / rewrite mechanics

`apps/web/src/middleware.ts` is scoped only to Supabase session-cookie
refresh (`updateSession`) — explicitly documented in its own comment as
intentionally *not* where the preview host-rewrite lives. All host-
conditional routing lives in `next.config.mjs`'s `rewrites().beforeFiles`,
sourced from `apps/web/src/lib/preview/rewrite-config.mjs`.

---

## 3. Historical origin

All findings **VERIFIED** via `git log --follow`/`git show` against local
history, cross-referenced with the docs cited.

- **Surface A′ / `demo/cafe`** (public mock demo): earliest commit `4bad789`
  ("feat(web): add client-ready cafe demo package", 2026-07-11), later
  extended by `f4bd485` (#141, 2026-07-30). `docs/phase-1n-4c-mame-to-cha-
  db-preview-architecture-plan.md` (§B10/C) explicitly designates this the
  `demo.oruwa.jp/cafe/*` public marketing/sales-demo surface, one of
  **three intentionally coexisting** "Mame To Cha" artifacts by design
  (public demo path, seeded internal sales-demo tenant, acceptance tenant).
  No evidence anywhere that this was meant to be replaced by either other
  surface.
- **Surface A** (`_client-preview`): planned in `20121b1`
  ("docs: plan Mame To Cha DB preview architecture", PR #104, 2026-07-12/14
  — the architecture-plan doc itself); first code in `f60a99c` (PR #105,
  2026-07-14); write capability added `756a7cc`/`60c5371` (PR #107/#108,
  2026-07-16); smoke-completed `c07db14` (2026-07-24). The architecture
  plan's Decision D.1 states explicitly: *"`/dashboard/workforce/*` is
  never the client acceptance URL... Client acceptance always happens at
  `preview.oruwa.jp/mame-to-cha/*`."* Originally a **DB-backed client-
  acceptance environment**, deliberately distinct from and not a
  replacement for the dashboard — reusing dashboard code, not its URL.
  By 2026-08-14, commit `dd27965`'s own message calls it "the
  `_client-preview` reference surface," confirming a directional shift:
  it had become the UX/parity **reference** for the dashboard rather than
  a separate acceptance-only environment.
- **Surface B** (dashboard): earliest commits `cc9106e`/`f4ff2ca`
  (2026-07-08/10, PR #73, "feature/phase-1j-2-cafe-workforce-demo", its own
  architecture predecessor PR #63). Originally the internal tenant-owner-
  facing operational surface, pre-dating Surface A. **Explicit
  canonicalization decision**: PR #228 "feature/cafe-v2-1-canonical-staff"
  (merge `034b7c8`, 2026-08-14), containing `dd27965` ("feat(cafe):
  consolidate canonical staff experience") — VERIFIED via
  `docs/ai/CANONICAL_CAFE_STAFF_CONSOLIDATION_LOCAL_REPORT_2026-08-14.md`,
  which states the goal explicitly: close "the two remaining Cafe v2.1
  Staff parity gaps against the `_client-preview` reference surface" so
  that "No essential Staff capability remains exclusive to
  `_client-preview`," with `READY_FOR_PREVIEW_CONSOLIDATION_QA = YES` and
  the next step recorded as "proceed to Phase B (the clean `oruwa-cafe`
  reference tenant) per the roadmap, per Founder decision." Follow-on
  same-day commits `ba76ce4` (Manager permission gate) and `5a1cfb4`
  (ORUWA Cafe reference tenant + "canonical Add-staff form") reinforce this
  as a deliberate, Founder-directed canonicalization, not an accidental
  drift.

**Synthesis**: Surface A′ was always intended to coexist (marketing layer);
Surface A began as a separate client-acceptance environment and was later
repurposed as a UX-parity reference for Surface B; Surface B was
**explicitly designated canonical by a Founder decision on 2026-08-14**
(PR #228), predating this audit by one day. **INFERRED, not directly
confirmed in any commit/doc**: whether the long-term intent is to fully
retire/delete Surface A once parity is complete, or to keep it
indefinitely as a separate client-acceptance/demo environment forever —
no commit or doc states this end-state explicitly (see §13, unknown #1).

---

## 4. Feature comparison matrix

Classification per Surface: **IMPLEMENTED** / **PARTIAL** / **MISSING** /
**N/A** / **UNKNOWN**. B = dashboard (canonical), A = preview. A′/mock
excluded from most rows (no backend); noted only where relevant.

| Capability | Surface B (dashboard) | Surface A (preview) | Citation |
|---|---|---|---|
| Real per-employee Auth login | **IMPLEMENTED** | **IMPLEMENTED** (same underlying `getUserFromClient`) | §5 |
| Invitation provisioning UI | **IMPLEMENTED** (B-only) | MISSING | `invitation-cell.tsx`, `PendingInvitationBanner`, PR #233 |
| LINE account linking | **IMPLEMENTED** (B-only) | MISSING | `employee-line-links.ts`, `line-link-form.tsx` |
| Explicit Manager deactivate control | **IMPLEMENTED** (B-only) | MISSING | manager-dashboard-client.tsx |
| Coworker roster / self-pin / All-Only-me | **IMPLEMENTED** (ported PR #228, `dd27965`) | **IMPLEMENTED** (original) | `staff/page.tsx:145-193`, `staff-dashboard-client.tsx:197-200/302-324` |
| Week navigation | **IMPLEMENTED** | **IMPLEMENTED** | both surfaces, `lib/workforce/shift-assignments` |
| Live schedule refresh/polling | **UNKNOWN** — not independently re-verified this pass whether B's ported roster polls or is static-per-load; A's uses `setInterval` per prior audit | **IMPLEMENTED** (`setInterval`) | flag for manual verification (§13) |
| Shift preference submission | **IMPLEMENTED** (same `submitShiftPreferenceWrite`) | **IMPLEMENTED**, plus an extra app-layer shiftType tenant/location/active pre-check A has and B lacks | §5 item (d) |
| Clock in/out (live, one-tap) | **MISSING** — only a manual `<input type="time">` field inside the after-the-fact work-report form; no live "clock in now" action found (`grep` confirmed zero `PreviewClockPanel`-equivalent component in B) | **IMPLEMENTED** — dedicated `PreviewClockPanel`, live state-driven button | `staff-dashboard-client.tsx` (no match), `preview-clock-panel.tsx` |
| Attendance / work report (manual entry) | **IMPLEMENTED** | **IMPLEMENTED** | shared `attendance-actions.ts` |
| Correction request (submit) | **IMPLEMENTED** | **IMPLEMENTED** | shared `shift-requests.ts` |
| Correction request (decide, Manager) | **IMPLEMENTED** in B's manager surface (via shared `decideCorrectionRequestWrite`) | **IMPLEMENTED** | both call same write function |
| Shift exchange (Staff request) | **IMPLEMENTED** — `shift-exchange-request-form.tsx` wired into `staff-dashboard-client.tsx` | **IMPLEMENTED** | `lib/workforce/shift-exchange-actions.ts` |
| Shift exchange (Manager decide) | **MISSING** — zero exchange-related files anywhere under `(protected)/dashboard/workforce/manager/**` (confirmed by exhaustive grep, this session) | **IMPLEMENTED** — `preview-correction-actions`/manager exchange decide UI | grep: 0 hits in B's manager tree; A has `lib/preview/actions/shift-exchange-manager-actions.ts` |
| Recipes/manuals | **IMPLEMENTED** — same import path, same filename convention | **IMPLEMENTED** | `recipes/page.tsx` both surfaces, identical `lib/workforce/recipes` calls |
| Inventory read (shortage-aware entry point) | **IMPLEMENTED** (ported PR #228) — links to canonical `/dashboard/inventory` | **IMPLEMENTED** (dedicated staff panel) | `CANONICAL_CAFE_STAFF_CONSOLIDATION_LOCAL_REPORT_2026-08-14.md` §1 |
| Inventory opening/closing check sessions | N/A on both — feature-flagged **off** in A (`SHOW_OPENING_CLOSING_STOCK_CHECKS = false`), never built in B | N/A (flagged off) | same report §1, "explicitly not ported" |
| Language switching (JA/EN toggle) | **PARTIAL** — schedule/roster/exchange-modal/Inventory-card sections use a real `LangProvider`/`useLang` toggle (ported PR #228); profile card, submitted-preferences table header labels, work-report table, correction-request form/table remain **English-only or bilingual-static-text**, not toggle-driven | **IMPLEMENTED** — whole surface, JA default | `staff-dashboard-client.tsx:283-296,457,501,541,553` (English-only sections); `CANONICAL_...REPORT` §2 (documents this as an intentional scope boundary, not an oversight) |
| Raw/untranslated data exposure | Present: `profile.employmentType` (raw free-text DB value, no mapping, `staff-dashboard-client.tsx:291`) and `a.status` (raw `attendance_status` enum, unmapped, line 529) shown verbatim — inconsistent with the same page's own `correctionStatusLabel()` mapping two sections below | Not observed in reviewed files — statuses routed through `t()`/label helpers | §8 |
| Mobile touch-target sizing | **MISSING** — no responsive/touch-specific styling found (`buttonSecondary` etc. use fixed small padding); generic dark dashboard theme | **IMPLEMENTED** — `mobilePageStyle()`, 64px/56px min-height touch targets | `lib/ui/theme.ts` vs `lib/demo/cafe/theme.ts:69-72` |
| Information density / task flow | Flat — 7 stacked `<section>`s on one continuously scrolling page, all rendered unconditionally | Compact — modal/detail-overlay pattern for secondary tasks (preference submission, correction request), explicitly documented as a deliberate density fix ("Founder QA F09") | `staff-dashboard-client.tsx` structure vs `preview-staff-actions.tsx:26-34` |
| `service_role`/elevated credentials in either surface | **NONE** (confirmed) | **NONE** (confirmed) | §5 |

---

## 5. Backend/data-flow comparison

**Conclusion: no duplicated business logic.** Every capability audited
resolves to the same `apps/web/src/lib/workforce/*.ts` (55 files) or
`apps/web/src/lib/inventory/*.ts` function for both Surface A and Surface
B — confirmed by grep-scoped import checks in both directions (zero
cross-imports found between `lib/preview/**` and `(protected)/dashboard/
workforce/**`, but both import the same `lib/workforce/**`). The only
per-surface code is a thin orchestration/wrapper layer:
`apps/web/src/lib/preview/**` (~70 files: `auth.ts`, `tenant.ts`,
`location.ts`, `module-guard.ts`, `manager-page-authorize.ts`,
`actions/*.ts`, presentation components) for Surface A, versus inline
Server Actions and `lib/workforce/*-actions.ts` wrappers for Surface B.

Key identical-function pairs (file:line cited from direct code reads):

- **Auth**: both surfaces bottom out in the exact same
  `getUserFromClient()` (`apps/web/src/lib/auth/user.ts:11`) →
  `supabase.auth.getUser()` (server-validated, not cookie-trusted). Surface
  A's `requirePreviewUser()` wraps `requireUser()`
  (`apps/web/src/lib/auth/require-user.ts:14`); Surface B's
  `requireTenantContext()` (`apps/web/src/lib/tenant/context.ts:94`) calls
  the identical `getUserFromClient`. **No separate/weaker preview auth
  path exists.**
- **Tenant resolution**: `resolvePreviewTenantContext()`
  (`lib/preview/tenant.ts:37`) internally calls the same
  `requireTenantContext()` Surface B calls directly — A just supplies an
  explicit, membership-verified `tenantId` (strict path, cookie never
  read); B's default call reads the `lbo_active_tenant_id` cookie only as
  a lenient hint, always revalidated against live membership rows
  (`context.ts:67-76`). One function, two call patterns — not two
  implementations.
- **Schedule/preferences/attendance/corrections/exchange/recipes/
  inventory**: all route through the identical shared write functions
  (`submitShiftPreferenceWrite`, `submitWorkReportWrite`,
  `submitCorrectionRequestWrite`, `decideCorrectionRequestWrite`,
  `listShiftExchanges`/exchange write functions in
  `lib/workforce/shift-exchanges.ts`, `listWorkforceRecipes`,
  `listInventoryItemStatus`) — same file, same function, for both
  surfaces.

**Two verified divergences at the app-orchestration layer** (not the
service layer):
1. Staff location resolution: Surface A's `resolveStaffLocation()`
   (`lib/preview/location.ts:38`) fails closed on any mismatch between the
   employee's own `locationId` and an active tenant location; Surface B's
   inline fallback (`staff/page.tsx:122-125`) silently falls back to the
   tenant's first/active location instead. Both remain scoped to the same
   tenant (no cross-tenant leak) — low-severity, availability-only
   divergence.
2. `previewSubmitShiftPreference()` (`lib/preview/actions/staff-schedule-
   actions.ts:49-53`) performs an app-layer check that the submitted
   `shiftTypeId` belongs to the caller's tenant/location and is active,
   before writing; Surface B's `submitShiftPreference()`
   (`lib/workforce/schedule-actions.ts:100-121`) has no equivalent
   pre-check, relying on DB-layer FK/RLS. Not confirmed exploitable
   (**UNKNOWN**, §13) but flagged for a follow-up DB-schema check.

**`api.workforce_staff_roster`** (migration `0061`): confirmed still
**unused by any application code** in either surface — exists in schema,
exercised only by a pgTAP test (`supabase/tests/0006_api_has_permission.sql`).
Unchanged from the 2026-08-14 audit's finding.

---

## 6. Onboarding destination analysis

**Chain, VERIFIED by direct code reading:**

1. `api.accept_employee_invitation` (`supabase/migrations/
   0064_workforce_employee_invitations.sql:261-279`) — invoker-only
   passthrough to `workforce.accept_employee_invitation` (`SECURITY
   DEFINER`), binds the caller's Auth identity to the employee row.
2. `apps/web/src/app/auth/accept-invite/route.ts:72-115` (PR #233) — calls
   `verifyOtp({ token_hash, type: 'invite' })` or falls back to
   `exchangeCodeForSession(code)`, then redirects to
   `/auth/accept-invite/set-password?invitation_id=...`. Never calls
   `accept_employee_invitation` itself, never redirects to `/dashboard`
   directly (deliberately, per an in-code comment citing a known Supabase
   gap where a session exists before a password is set).
3. `setPasswordAndAcceptInvitation` (`lib/workforce/invitation-
   actions.ts:79-103`) sets the password, then calls
   `acceptWorkforceEmployeeInvitation` → `api.accept_employee_invitation`.
4. `apps/web/src/app/auth/accept-invite/set-password/
   SetPasswordForm.tsx:49` — on success, `router.push('/dashboard/
   workforce/staff')`.

**Is the destination hardcoded or tenant/product-aware?** VERIFIED
hardcoded — a literal string, not computed. `tenantKind`/`tenant.kind` is
used elsewhere in the codebase (`lib/tenant/types.ts`, `membership.ts`,
`admin-members.ts`) **only for display** (e.g. an admin-page table
column) — never in any conditional that computes a route. No
`TenantKind`-keyed routing table or "vertical product package" routing
config exists anywhere in `apps/web/src`. The only per-vertical mechanism
found is module-entitlement gating (does the `workforce` module render at
all), which is orthogonal to *which* route a tenant lands on.

**Is this intentional or incidental?** INFERRED, not directly documented:
`/dashboard/workforce/staff` was purpose-built by an earlier "Staff Auth
Provisioning" effort (PR #225, per `docs/ai/STAFF_PRODUCT_SURFACE_AND_
QA_IDENTITY_AUDIT_2026-08-14.md:80,84`) specifically to carry real
per-employee Auth login, invitation lifecycle, and deactivation control —
i.e. it was the *only* route that could legitimately be an invitation-flow
landing target at the time, since Surface A is preview-gated and Surface
A′ has no backend at all. Git history for `SetPasswordForm.tsx` shows only
two commits (`7ea25f8` Staff Auth Provisioning, `946bc24` the PR #233
callback fix), neither with commit-message rationale weighing this
destination against alternatives. **Conclusion: the choice was constrained
(no real alternative existed), not a deliberated product decision — but
given Surface B's subsequent Founder-directed canonicalization (§3), the
destination is now also the *correct* one going forward, not merely an
accident to fix.** Per the handoff's explicit instruction, this redirect
was **not** changed as part of this audit.

---

## 7. Security comparison

**Auth**: identical underlying code path for both surfaces (§5) —
`getUserFromClient()` → `supabase.auth.getUser()`. No separate, weaker
preview-only session check exists. Tenant/location authorization is RLS-
backed identically for both surfaces regardless of which app-layer
function issues the query (both call the same `lib/workforce/*` read/write
functions).

**Manager permission gate**: both surfaces gate the Manager page on the
identical `api.has_permission('workforce.staff.manage')` RPC — Surface A
via `authorizePreviewManagerPage()`/`resolvePreviewManagerContext()`,
Surface B via `hasManagerAccess()`. Surface A additionally re-runs this
RPC as a defense-in-depth pre-check inside each individual manager Server
Action; Surface B's manager action wrappers rely on RLS alone at the final
write (explicitly documented in-code, e.g. `schedule-actions.ts:123-131`:
"Manager permission is enforced entirely by RLS on the final INSERT...
there is no separate pre-check here"). **Not an actual privilege gap** —
both converge on the same RLS predicate; Surface A's extra call only
improves error-message clarity, not the security boundary itself.

**Historical divergence, now closed (important finding to preserve in
this audit)**: Surface A's `resolvePreviewStaffContext()`
(`lib/preview/actions/authorize.ts:177-234`) has always explicitly
rejected writes from a deactivated employee (`!profile.isActive` check);
Surface B's equivalent action wrappers never had this app-layer check.
Per migration `supabase/migrations/0062_workforce_deactivated_employee_
write_hardening.sql:1-20` (its own text, quoted verbatim): a prior
"STAFF_AUTH_IDENTITY_ARCHITECTURE_AUDIT found that
`workforce.is_own_employee`... only checks `e.user_id =
core.current_user_id()`, never `e.is_active`. A deactivated employee whose
Supabase Auth session is still valid can therefore still pass every
`*_self_insert/_self_update` self-scope RLS policy, even though app-layer
`resolvePreviewStaffContext()` already refuses to resolve them." Migration
0062 added `workforce.is_own_active_employee` and substituted it into
every self-scope WRITE policy. **Current status: closed at the correct
layer (RLS) for both surfaces equally** — this is a legitimate example of
a real divergence, found by a prior audit, fixed at the layer that
actually matters (not just papered over in one surface's app code).

**`service_role`**: zero hits anywhere in `apps/web` production code for
`service_role`/`SUPABASE_SERVICE_ROLE_KEY`/`createServiceClient` (every
grep match is either a negative test assertion or a doc comment explaining
why it must never be used) — confirmed for both surfaces, AGENTS.md rule
upheld.

**One unresolved, low-confidence item** (§13, unknown #2): whether
Surface B's missing app-layer `shiftTypeId` tenant/location/active
pre-check (§5, item 2) is fully compensated for by DB-layer FK/RLS —
plausible but not independently confirmed against the actual schema this
session.

**No case found** where either surface can read data the other correctly
restricts — all reads share the same RLS-backed functions.

---

## 8. Product/UX comparison

Files read directly: Surface B —
`(protected)/dashboard/workforce/staff/page.tsx` (235 lines),
`staff-dashboard-client.tsx` (598 lines). Surface A —
`%5Fclient-preview/mame-to-cha/page.tsx` (271 lines),
`lib/preview/staff-view.tsx`, `preview-clock-panel.tsx`,
`preview-staff-actions.tsx`, `lib/demo/cafe/theme.ts`/`i18n.tsx`.

- **Language**: Surface A defaults to Japanese (`LangProvider` default
  `'ja'`) with every string routed through `tStaff(lang, key)`. Surface B
  is **mixed, English-dominant** outside the sections ported in PR #228 —
  `"My staff profile"`, `"Position"`, `"Employment type"`, `"Status"`
  (`staff-dashboard-client.tsx:283-296`), `"My submitted shift
  preferences"`, `"My work reports this week"`, `"Submit a correction
  request"`, `"My correction requests this week"` (lines 457, 501, 541,
  553) are English-only headings with no toggle. This is a real,
  currently-accurate gap, not stale information — it is the direct,
  documented scope boundary of the PR #228 consolidation pass (per
  `CANONICAL_..._REPORT_2026-08-14.md` §2: "Deliberately not translated...
  the pre-existing shift-preference/work-report/correction-request
  sections... were not part of what this task's two named gaps covered").
- **Raw data exposure**: `profile.employmentType` (raw free-text DB value,
  `staff-dashboard-client.tsx:291`) and `a.status` (raw `attendance_status`
  enum, unmapped, line 529) are shown verbatim to the employee — the same
  page maps an equivalent status via `correctionStatusLabel()` two
  sections below (line 580), so this is an internal inconsistency, not a
  blanket policy.
- **Theme**: Surface B uses `lib/ui/theme.ts`, a generic dark admin-
  dashboard palette with no cafe branding and no documented mobile
  accommodation. Surface A uses `lib/demo/cafe/theme.ts`, a light,
  warm, cafe-branded palette with an explicit `mobilePageStyle()` (near-
  edge padding on phones) and touch-sized controls (64px/56px
  min-height buttons).
- **Density/flow**: Surface B stacks 7 full sections vertically,
  unconditionally rendered, on one continuously scrolling page. Surface A
  keeps the main scroll short and defers secondary tasks (preference
  submission, correction request) to modals/day-cell-tap overlays — a
  deliberate density decision documented in-code as fixing "Founder QA
  F09" (a duplicate correction-request entry point was removed for this
  exact reason).
- **Coworker roster**: now **present on both** surfaces (contradicting the
  2026-08-14 audit's "Staff sees only own row" characterization of Surface
  B, which is now stale — the roster was ported in PR #228, confirmed by
  in-code comments cross-referencing Surface A and `git blame` on
  `staff/page.tsx` pointing to `dd27965`).
- **Clock in/out**: Surface A has a dedicated, prominent, live
  `PreviewClockPanel` with a single state-driven primary button. Surface B
  has **no live clock action** — only a manual `<input type="time">`
  field inside the after-the-fact `WorkReportForm` (confirmed by grep:
  zero matches for any clock-panel-equivalent component in Surface B's
  files). This is the most significant functional (not merely cosmetic)
  UX gap found — flagged in §10 (P1, not P0 — see rationale there).

---

## 9. Canonical Staff surface recommendation

**Recommendation: Surface B (`(protected)/dashboard/workforce/**`)
remains canonical.** This is not a new decision this audit is introducing
— it ratifies the Founder decision already recorded in PR #228
(`docs/ai/CANONICAL_CAFE_STAFF_CONSOLIDATION_LOCAL_REPORT_2026-08-14.md`)
one day before this audit began, and this audit found no evidence
contradicting it.

**Why, restated against the audit's own evidence:**
- It is the only surface with real per-employee invitation provisioning,
  LINE-account linking, and explicit Manager deactivation control — none
  of which exist in Surface A and cannot be retrofitted onto A without
  duplicating that identity/security work (§4).
- It is architecturally generic — a shared Workforce module route, not a
  Cafe- or Mame-To-Cha-specific fork — satisfying the binding "one SaaS →
  shared Platform Foundation → reusable modules → vertical product
  packages → no tenant-specific forks" constraint (AGENTS.md, handoff §7).
  Surface A, by contrast, is architecturally tenant-specific: its tenant
  is a **hardcoded slug constant** (`PREVIEW_TENANT_SLUG = 'mame-to-cha'`,
  `lib/preview/constants.ts`) — it cannot serve any other tenant without
  code changes, the opposite of the platform's module/package model.
- It is already the real onboarding landing target (§6) and the real,
  live-verified production path (Staff C, handoff §3).
- Backend logic is already fully shared (§5) — canonicalizing the UI layer
  does not require any backend rework, only porting the remaining UX gaps
  (§10) from Surface A into B, exactly the pattern PR #228 already used
  successfully for roster/Inventory/partial-i18n.

**Rejected alternative — Surface A canonical**: would require rebuilding
invitation provisioning, LINE linking, and deactivation control from
scratch on a route tree whose tenant resolution is architecturally
hardcoded to one tenant slug — directly contradicts the no-tenant-specific-
forks constraint and would be strictly more work than finishing the
already-underway B-ward port.

**Rejected alternative — shared Workforce shell + Cafe package
composition**: no evidence in this codebase of a package-composition
mechanism for per-vertical UI (§6) — introducing one now would be new
platform architecture, out of scope for a Staff-surface reconciliation and
not justified by the size of the remaining gaps (§10 is a bounded, finite
list, not evidence of a structural need for composition).

**Surface A and A′'s ongoing role**: Surface A should remain, for now, as
the client-acceptance/UX-reference environment its original design
intended (§3) — not deleted — until Surface B reaches full parity (§10)
and a separate, explicit Founder decision is made about its long-term
fate (§13, unknown #1). Surface A′ (mock demo) and `demo/cafe/**` should
remain as the public marketing surfaces they were always designed to be —
out of scope for "real Staff product experience" entirely.

---

## 10. P0/P1/P2 reconciliation gaps

**P0 — blocks Cafe v2.1 acceptance:**

1. **Manager cannot decide shift-exchange requests on the canonical
   surface.** Staff can submit a shift-exchange request on Surface B
   (`shift-exchange-request-form.tsx`), but
   `(protected)/dashboard/workforce/manager/**` contains zero
   exchange-related code (confirmed by exhaustive grep this session — no
   file, import, or UI element anywhere in that tree references
   "exchange"). The only UI that can approve/deny an exchange request is
   Surface A's Manager panel, reachable only on `preview.oruwa.jp` behind
   `requirePreviewUser()` — not a route a real production Manager
   authenticates against. **A real Manager today has no way to act on a
   real Staff member's exchange request.** This is a genuinely broken
   end-to-end workflow on the canonical, production surface, not a UX
   nicety — classified P0 because the feature is already exposed to Staff
   (implying it's considered a live capability) but is unusable without a
   corresponding Manager action anywhere reachable in production.

**P1 — should be reconciled soon:**

2. **No live clock-in/clock-out action on Surface B.** Only a manual
   `<input type="time">` field inside the after-the-fact work-report form
   exists; Surface A has a dedicated, prominent, one-tap `PreviewClockPanel`.
   Not P0 because the underlying capability (recording attendance times)
   still functions via manual entry — data can still be captured and
   written through the same shared `submitWorkReportWrite` function — but
   the absence of a real-time action is a meaningful daily-workflow gap
   for hourly cafe staff and increases risk of inaccurate/self-reported
   times.
3. **Incomplete JA/EN localization on Surface B.** Profile card, submitted-
   preferences table headers, work-report section, and correction-request
   form/table remain English-only or inconsistently bilingual, against a
   Japanese-first SMB product and a Japanese default on Surface A. Not P0
   because the affected sections remain functionally usable in English and
   this is a documented, intentional scope boundary of the prior
   consolidation pass rather than a regression — but it should not remain
   the final state for a Japanese-first product.
4. **Raw/untranslated data shown to Staff.** `profile.employmentType`
   (raw free-text) and `a.status` (raw enum) are displayed unmapped on
   Surface B, inconsistent with the same page's own status-mapping pattern
   used elsewhere (`correctionStatusLabel()`). Low effort, direct fix once
   prioritized.
5. **Staff location-fallback leniency** (§5, §7): Surface B silently falls
   back to a different active location when the employee's own location is
   missing/inactive, where Surface A fails closed. Same-tenant only (no
   isolation break) but worth aligning to the stricter behavior for
   consistency and to avoid silently showing schedule/shift-type data for
   a location the employee isn't actually assigned to.

**P2 — later polish:**

6. **Information density / lack of modal pattern.** Surface B's 7 stacked,
   always-rendered sections vs Surface A's compact/modal-based flow —
   real UX debt, not a functional blocker.
7. **No mobile touch-target sizing on Surface B** (generic dark dashboard
   theme, no `mobilePageStyle()` equivalent, small fixed-padding buttons)
   — worth addressing given hourly staff most likely use mobile devices,
   but does not block core functionality.
8. **`apps/web/src/app/workforce/page.tsx` orphaned stub** (§2.5, §11) —
   dead code with dangling redirects; not user-facing risk but should be
   cleaned up.
9. **`api.workforce_staff_roster` (migration 0061) remains unused** by any
   application code — a Founder decision on whether to build against it
   or drop the view is still outstanding (carried forward from the
   2026-08-14 audit, unchanged).

No P0/P1/P2 item above requires DB/RLS/Auth changes — all are app-layer
UI/wiring work reusing the already-shared backend (§5).

---

## 11. Deprecation/deletion candidates

| Candidate | Recommendation | Dependencies / migration risk |
|---|---|---|
| `apps/web/src/app/workforce/page.tsx` + its two dangling `next.config.mjs` redirects | **DELETE** — confirmed orphaned: not linked from any live surface, links to two routes that don't exist. Lowest-risk deletion candidate in this audit; verify via a repo-wide `href="/workforce"` grep immediately before deletion (not performed as an actual mutation in this audit) to rule out any late-discovered inbound link. | None found. Zero inbound links from Surfaces A/A′/B navigation (confirmed this session). |
| `apps/web/src/app/mame-to-cha/**` (Surface A′, mock demo) | **RETAIN** for now, contrary to the 2026-08-14 audit's "delete later" recommendation — this audit's git-history investigation (§3) found the architecture plan explicitly designates this the intentional `demo.oruwa.jp` public marketing surface, one of three deliberately coexisting artifacts, not dead-weight duplication. Revisit only if the Founder confirms the public marketing-demo use case is no longer needed. | Shares `@/components/demo/cafe/views/*` and `@/lib/demo/cafe/*` with `demo/cafe/**` (its sibling brand-skin) — deleting one without the other would be inconsistent; any deprecation decision should cover both together. |
| `apps/web/src/app/%5Fclient-preview/mame-to-cha/**` (Surface A) | **RETAIN**, do not deprecate yet — still the only environment for client-acceptance testing and the only place Manager exchange-decide UI exists at all (P0, §10 item 1) pending that gap being closed on B. Revisit once §10's P0/P1 items are closed and the Founder makes an explicit decision on Surface A's long-term role (§13, unknown #1). | Backend fully shared with B (§5) — deleting it does not risk backend regression, but deleting it *before* P0 item 1 is closed on B would remove the only working exchange-decide UI in the repo entirely. **Do not delete before P0 is resolved.** |
| `api.workforce_staff_roster` (migration 0061 view) | **Founder decision needed** — either wire it into application code during the reconciliation work, or explicitly drop it in a future migration. Not urgent; carried forward unchanged from the prior audit. | None — confirmed zero application-code references; a `DROP VIEW` would only need to account for the pgTAP test that exercises it. |

No deletions were performed in this audit — this section is analysis only,
per the explicit prohibition on implementation (handoff §8).

---

## 12. Risks

- **P0 item (§10.1) represents a live product gap**, not merely a
  documentation gap — if any real Cafe tenant currently has Staff members
  submitting exchange requests with no Manager able to act on them, those
  requests are silently stuck. Recommend the Founder check whether any
  real (non-QA) tenant has outstanding pending exchange requests before
  this is reconciled.
- **Consolidation-report claims were not blindly trusted** — this audit
  independently re-verified the roster port (confirmed present via direct
  code read + `git blame`), the Inventory port (confirmed via grep), and
  the i18n scope boundary (confirmed via direct code read of the English-
  only sections) rather than citing the 2026-08-14 reports as fact. All
  three held up under re-verification, but the exchange-decide gap they
  did **not** mention was found only by this audit's independent grep —
  underscoring that report claims of "parity" should continue to be
  spot-checked against code, not assumed complete.
- **Two prior-audit claims found stale and superseded in this document**:
  (a) the 2026-08-14 audit's "Staff sees only own row" characterization of
  Surface B (superseded by the PR #228 roster port); (b) its "DELETE
  LATER" recommendation for Surface A′ (superseded by this audit's
  git-history finding that A′ was always an intentional, coexisting public
  marketing surface, not accidental duplication). Both corrections are
  explicit, evidence-based, and documented here per the self-correction
  rule (handoff §11) — future docs citing the 2026-08-14 audit should defer
  to this document's corrections on these two specific points.
- **DB-layer compensation for the shiftType pre-check gap (§5 item 2,
  §7)** was not independently confirmed against the live schema this
  session — low-confidence risk, worth a follow-up check before treating
  it as fully closed.

---

## 13. Unknowns requiring Founder/manual verification

1. **Surface A's long-term fate**: is it meant to be fully retired once
   Surface B reaches parity (implied by the "reference surface" framing
   and the PR #228 report's tone) or permanently retained as a separate
   client-acceptance/demo environment (as its original architecture-plan
   design intended)? No commit or doc states the end-state explicitly.
   This materially affects whether closing §10's P0/P1 items should be
   framed as "port and then delete A" or "port and keep A running
   indefinitely as a QA/acceptance tool."
2. **Whether DB-layer FK/RLS fully replicates Surface A's app-layer
   shiftType tenant/location/active pre-check** on Surface B (§5 item 2) —
   not independently confirmed against the live schema this session;
   recommend a direct `\d workforce.shift_requests` / RLS-policy read as a
   fast follow-up, not full penetration testing.
3. **Whether Surface B's ported roster (PR #228) live-polls or is static
   per page load** — not independently re-verified this pass (the earlier
   2026-08-14 audit's "Live schedule refresh/polling: Missing" claim for B
   predates the roster port and cannot be trusted as current; this audit
   marks it UNKNOWN rather than repeating a stale claim).
4. **Whether any real (non-QA) Cafe tenant currently has pending Staff
   exchange requests** stuck by the P0 gap (§12) — requires a read-only DB
   query against Preview/production data the Founder should authorize and
   review directly, not something this audit ran unprompted given the
   handoff's data-sensitivity boundaries.
5. **Whether the Founder considers the incomplete-i18n state (§10 item 3)
   a P0 given "Japanese-first usability" is an explicit audit-mandate
   criterion (handoff §9.J)** — this audit classified it P1 because the
   affected sections remain functional in English, but the Founder may
   weigh Japanese-first usability more heavily than this audit did; flagged
   explicitly rather than silently resolved either way.

---

## 14. Proposed implementation phases — PLAN ONLY, not implemented

This section is a plan for a future, separately-approved workstream. **No
part of it was implemented in this audit.**

**Phase 1 (P0 closure)**: Port Surface A's Manager shift-exchange
decide UI (`lib/preview/actions/shift-exchange-manager-actions.ts` +
its presentation component) into `(protected)/dashboard/workforce/
manager/**`, reusing the already-shared `lib/workforce/shift-exchanges.ts`
write functions — no new backend logic required, matching the pattern PR
#228 already used for Inventory/roster.

**Phase 2 (P1 closure)**: (a) Port `PreviewClockPanel`'s live clock-in/out
UI into Surface B's staff page, wired to the existing
`submitWorkReportWrite` path. (b) Extend the existing `staff-dashboard-
i18n.ts` dictionary (already the correct mechanism, per PR #228) to cover
the profile/preferences/work-report/correction-request sections currently
English-only. (c) Map `profile.employmentType` and `a.status` through
label helpers consistent with the page's existing `correctionStatusLabel()`
pattern. (d) Align Surface B's staff location-resolution fallback to
Surface A's stricter fail-closed behavior, or explicitly document why the
lenient fallback is intentional if the Founder decides to keep it.

**Phase 3 (P2 polish)**: (a) Introduce a modal/detail-overlay pattern for
Surface B's secondary tasks (preference submission, correction request),
reducing the 7-section flat scroll. (b) Add mobile-specific touch-target
sizing to `lib/ui/theme.ts` or a Staff-page-scoped extension of it.
(c) Delete the orphaned `apps/web/src/app/workforce/page.tsx` stub and its
two dangling `next.config.mjs` redirects, after a final inbound-link grep.
(d) Founder decision on `api.workforce_staff_roster` (wire in or drop).

**Phase 4 (Founder decision, not engineering)**: resolve unknown #1 (§13)
— Surface A's long-term retain-vs-retire status — before or alongside
Phase 1-3, since it determines whether Phases 1-2's ported code should
eventually be followed by Surface A deletion or not.

Each phase should ship as its own PR, mirroring the granularity PR #228
already established (one PR per named gap-closure pass, with its own
local consolidation report), not a single large rewrite.

---

## 15. Exact acceptance criteria for Cafe v2.1 Staff surface reconciliation

Reconciliation is complete when **all** of the following are true and
independently verified (code read + passing tests + manual QA, not just a
report claiming completion):

1. A real Manager, authenticated on the canonical `(protected)/dashboard/
   workforce/manager` route (not `preview.oruwa.jp`), can view and decide
   (approve/deny) a real Staff member's shift-exchange request submitted
   on the canonical `(protected)/dashboard/workforce/staff` route,
   verified live against a real (or QA) tenant — closing P0 item §10.1.
2. Staff on the canonical surface can record a clock-in/clock-out event in
   real time (not only via after-the-fact manual time entry) — closing
   P1 item §10.2.
3. Every string added or already present in Surface B's Staff page (not
   only the sections PR #228 already covered) renders correctly in both
   Japanese and English via the existing `LangProvider`/`useLang`
   mechanism, verified by extending `staff-dashboard-i18n.test.ts` to
   cover the newly-translated sections — closing P1 item §10.3.
4. No raw/unmapped enum or free-text database value is shown to Staff
   without going through a label/translation helper, consistent with the
   page's own existing `correctionStatusLabel()` pattern — closing P1 item
   §10.4.
5. Staff location resolution on Surface B either matches Surface A's
   fail-closed behavior, or an explicit Founder decision is recorded
   choosing to keep the lenient fallback — closing P1 item §10.5.
6. `apps/web/src/app/workforce/page.tsx` and its two dangling redirects
   are deleted, or an explicit reason is recorded for retaining them —
   closing P2 item §10.8.
7. The Founder has made and recorded an explicit decision on Surface A's
   long-term retain-vs-retire status (§13 unknown #1), so future audits
   are not left inferring intent from commit-message tone.
8. All existing test suites (`npm run test`, `npx tsc --noEmit`, lint,
   build) continue to pass with zero regressions after every phase in
   §14, matching the bar PR #228's own consolidation report already
   documented (1006 passed / 0 failed, clean typecheck/lint, successful
   build).

---

## 16. Final verdict

**Reconciliation required before Cafe v2.1 Staff surface acceptance.**

The architecture is coherent — one shared backend, one already-designated
canonical UI surface, no service-role/RLS-bypass risk, no tenant-isolation
break found. What remains is a **bounded, enumerated set of gaps** (§10),
headlined by one genuine P0 (Manager cannot act on Staff exchange requests
anywhere in production) that this audit surfaced as new evidence not
present in any prior report. This is not a request to redesign or re-
architect anything — Surface B is confirmed canonical, the backend needs
no changes, and every P0/P1 item has a direct, low-risk porting path
already proven by the PR #228 precedent. Closing §10's P0 and P1 items,
plus recording the Founder decision in §13 unknown #1, is sufficient to
move this workstream to "coherent and accepted."

```
STAFF_PRODUCT_SURFACE = CONVERGING (canonical decision already made, backend unified, UI gaps bounded)
CANONICAL_SURFACE = (protected)/dashboard/workforce (Surface B) — RATIFIED, not newly decided
BACKEND_DUPLICATION = NONE FOUND
SECURITY_MODEL = SOUND (one historical gap found and already closed at the RLS layer)
NEW_P0_FOUND_THIS_AUDIT = YES — Manager cannot decide Staff shift-exchange requests on the canonical surface
ONBOARDING_DESTINATION = CORRECT (constrained-then-ratified, not accidental; not changed by this audit)
FULL_CAFE_V2_1_STAFF_ACCEPTANCE = NOT_READY — pending §10/§15
```
