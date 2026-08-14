# CANONICAL_CAFE_PREVIEW_ACCEPTANCE_REPORT (2026-08-14)

Preview acceptance pass for the Cafe v2.1 canonical Staff consolidation, following merge to `dev`. Production untouched throughout (§23).

## 1. Branch / PR / merge SHA

- Consolidation PR: [#228](https://github.com/tantik/line-business-os/pull/228) `feature/cafe-v2-1-canonical-staff` → `dev`. CI green (typecheck/test/build/lint, Vercel). Merged by Founder at `034b7c8b3101e037bf7d57eb4428c2aa943545fe`.
- Follow-up fix PR (found during this QA pass, see §17): [#229](https://github.com/tantik/line-business-os/pull/229) `fix/cafe-v2-1-staff-attention-cross-employee-leak` → `dev`. CI green. Merged by this session at `2c61ca367b19b7d65dde352295871755e1abc323`.
- Final `dev` HEAD verified via `git rev-parse origin/dev`: `2c61ca367b19b7d65dde352295871755e1abc323`.

## 2. Exact Preview SHA verified

Verified two ways, both agreeing:
- GitHub deployment API (`gh api repos/.../deployments`) shows the `Preview` deployment for commit `2c61ca367b19b7d65dde352295871755e1abc323`, status `success`.
- `vercel inspect https://preview.oruwa.jp` resolves the `preview.oruwa.jp` alias to deployment `dpl_CJXvFGpCD8AhGkeMunzPWj7Ti7q2`, which is exactly the deployment created for that same commit (`https://line-business-os-dttybbv9d-tantiks-projects.vercel.app`).

Preview is confirmed serving the merged fix, not a stale alias.

## 3. Local gates (re-verified before commit, and again after the in-session fix)

- `npm run test` (apps/web): 1006/1006 → after fix, 1007/1007 (1 new regression test).
- `npx tsc --noEmit`: clean, both times.
- `npx eslint`: clean, both times.
- `npm run build`: succeeded (17 static pages, `/dashboard/workforce/staff` 15.8 kB / 121 kB First Load JS — matches the local consolidation report exactly).

## 4. Manager session tested

`manager@mame-to-cha.test` on `/dashboard/workforce/manager`. Staff list (real names, positions, status), weekly schedule grid, shift-type table, submitted shift preferences, and correction-request approve/reject all rendered and functioned. `/dashboard/workforce/recipes` shows real tenant recipe data (JA + EN, e.g. 抹茶ラテ, ほうじ茶ラテ). `/dashboard/inventory` shows 5 items with correct shortage detection (Ice, Milk flagged; 2 items need restocking).

## 5. Staff A identity result — PASS

`staff@mame-to-cha.test` resolved to **田中 愛** (Position: Barista, Status: Active) via the server-side `getMyWorkforceStaffProfile()` → `employeeId` path. Self row ("Me"/"自分") pinned first, self-highlighted, and matched exactly the schedule the Manager session had assigned for 田中愛 (including a disposable shift created for this QA pass — see §20).

## 6. Staff B identity result — PASS

`staff2@mame-to-cha.test` resolved to **佐藤 健** (Position: Barista, Status: Active), a distinct Auth user and distinct `employeeId` from Staff A. Self row correctly showed 佐藤健's own schedule, which is materially different from 田中愛's (different shift-type sequence across the week), confirming no identity bleed between the two sessions.

## 7. Manager → Staff live schedule result — PASS

Manager created and published one future shift each for Staff A (Sat 2026-08-15, `CUSTOM_1786528259098`, 07:00-11:00) and Staff B (same date, `CUSTOM_1786528350253`, 09:00-13:00). Both isolated Staff sessions, on reload, showed exactly their own new shift in the "Me" row and in the shift-exchange modal (verified shift code/time in each modal). Staff A never saw Staff B's shift type on her own row or vice versa.

## 8. Staff A → Manager attribution — PASS

Staff A opened the Sat shift, submitted a shift-exchange request ("Offer for exchange") with reason `QA-CANONICAL-PREVIEW-STAFF-A attribution test`. Submission succeeded ("Shift exchange request submitted."); the "!" attention indicator appeared on her own cell. `createShiftExchange` resolves `requesterEmployeeId` server-side from the caller's own tenant context — never client-supplied (confirmed in `shift-exchange-actions.ts`).

## 9. Staff B → Manager attribution — PASS

Staff B independently submitted her/his own shift-exchange request (`QA-CANONICAL-PREVIEW-STAFF-B attribution test`) on her/his own Sat shift. Succeeded independently of Staff A's request. **Note**: the canonical Manager dashboard has no shift-exchange decide UI yet (pre-existing, documented limitation from the prior consolidation report §25 — the decide UI exists only in `_client-preview`'s Manager panel) — attribution correctness was verified via the server-side identity-resolution code path and via each request being submitted with a reason string and shift ID matching the correct caller's own resolved identity/assignment, not by decision in a canonical Manager view.

## 10. Coworker roster result — PASS WITH NOTED DESIGN CONFLICT

Both Staff sessions saw the schedule grid populated with real published shifts, correctly self-pinned. However, coworkers are shown as **"Staff N" / "スタッフ N"**, not their real names — this is a deliberate, pre-existing privacy design (`staff-schedule-view-model.ts`: "Other employees' encrypted names are deliberately not exposed to a Staff caller"), mirrored intentionally from `_client-preview`'s own behavior and unchanged by this consolidation. This conflicts with this task brief's literal §10 wording ("real Manager-entered employee names... no synthetic numbering"). Given it is a deliberate, cross-surface architectural privacy decision — not a regression or oversight — I did not alter it; flagging here for Founder awareness rather than treating it as a defect to silently "fix."

## 11. Inventory result — PASS

Both Staff sessions saw the "Inventory" card with an accurate shortage count (2 items) and a working link to the canonical `/dashboard/inventory`, landing on the same real, RLS-scoped page Manager uses, showing the same 2-item shortage. No duplicate write UI.

## 12. Recipes/manuals result — PASS

Verified via Manager session (`/dashboard/workforce/recipes`): real tenant categories/recipes, correct JA content, no regression. (Not re-verified per Staff session — no material path difference from Manager's, and this was already re-confirmed by source inspection in the prior consolidation report §3.)

## 13. JA result — PASS

Both Staff sessions defaulted to JA and rendered correctly: 公開シフト, すべて/自分のみ, 前週/次週, 在庫を開く, etc. — all consolidation-scope strings correctly localized.

## 14. EN result — PASS

Toggling to EN correctly switched every consolidation-scope string (Published schedule, All/Only me, Prev/Next week, Me/Staff N, Open Inventory, item(s) need restocking, exchange modal). Legacy sections (shift preferences, work reports, correction requests) remain static bilingual-looking headings, matching the prior report's documented, in-scope boundary (Category C: acceptable known legacy behavior, not part of this consolidation's named scope).

## 15. Manager regression result — PASS

Staff list, employee names, schedule, shift types, correction-request approve/reject, Inventory, and Recipes all functioned with no observed regression from the consolidation.

## 16. Security negative checks

- **Staff A cannot act as Staff B / vice versa**: PASS — isolated sessions, distinct identities, distinct schedules, no cross-contamination observed in reads or writes.
- **Staff cannot expose email/wage/auth identifiers through the coworker roster**: PASS — roster shows only "Staff N" labels, no PII (see §10).
- **Deactivated Staff write protection**: not independently exercised this pass; relies on the existing automated pgTAP/unit test suite (1007/1007 passing) per this task's guidance to prefer existing automated coverage over manual destructive testing on Preview.
- **Staff cannot access Manager-only controls**: **FAIL — see §17, pre-existing, not caused by this consolidation.**

## 17. Defects found

**A. Cross-employee attention-indicator leak (FIXED this session).** `computeStaffAttentionCellKeys` (new function added by the consolidation, `staff-schedule-view-model.ts`) tagged `${ownStaffId}:${workDate}` for *any* open/accepted shift exchange whose assignment fell on that date, without checking the assignment's `employeeId` matched the caller. Since `listShiftExchanges` is location-wide (not self-scoped), Staff B's dashboard showed the "!" attention indicator on her/his own unrelated shift purely because Staff A had an open exchange on the same date. Reproduced live on Preview, root-caused, fixed with a one-line guard (`assignment.employeeId === ownStaffId`), covered by a new regression test, verified via `npm run test` (1007/1007) and redeployed/re-verified on Preview (PR #229, merged).

**B. `/dashboard/workforce/manager` has no page-level role gate (NOT FIXED — pre-existing, architectural, reported not improvised).** Navigating a Staff session (`staff2@mame-to-cha.test`, no manager privileges) directly to `/dashboard/workforce/manager` fully renders the entire Manager dashboard: complete staff roster with real names/positions/status, "+ Add staff", "Edit"/"Deactivate" buttons, the full weekly schedule grid with "Assign"/"Publish schedule" controls, and the shift-type table. `manager/page.tsx` only calls `requireTenantContext()` (tenant-membership check) — there is no manager-role/permission check gating the route itself.
  - **Not a full write bypass**: RLS (`0009_workforce.sql`) grants `workforce.shift.write` only to the `r_manager` role; the `r_emp` (staff) role has `workforce.shift.read` only (`0008_rbac_seed.sql`). Writes attempted through this exposed UI would very likely still be rejected server-side by RLS — this was not destructively tested per this task's guidance to prefer relying on the existing RLS/automated-test boundary rather than manually attacking Preview.
  - **Is a real information-disclosure regression against this consolidation's own design intent**: the canonical Staff dashboard *deliberately* hides coworkers' real names from Staff (§10), but the same Staff account can trivially reach `/dashboard/workforce/manager` by URL and see every coworker's real name, position, and account-access status in plain view — undermining that privacy boundary from a different route.
  - Confirmed pre-existing: no file under `dashboard/workforce/manager/**` was touched by the consolidation (per the prior local report §16, independently re-confirmed by `git log` on that path). Fixing this requires deciding what should gate the Manager route (a permission check, e.g. `workforce.shift.write`, checked at the page/layout level) — an authorization-surface decision, not a copy/logic bug. Per the Fix Policy, this is reported and left for Founder decision rather than improvised.

## 18. Defects fixed

- §17.A only (cross-employee attention-indicator leak). Minimum-scope fix, one file + one new test, no RLS/Auth/tenant-model changes.

## 19. Remaining known limitations (pre-existing, not regressions)

- Coworker roster shows "Staff N", not real names, by deliberate design (§10).
- No canonical Manager UI to decide (accept/reject) shift-exchange requests yet — exists only in `_client-preview`.
- `/dashboard/workforce/manager` has no page-level role gate (§17.B) — reported, not fixed this pass.
- Inventory shortage count on the Staff entry-point card is a point-in-time snapshot, not live-polled (documented in the prior local report).

## 20. QA data created

- Two disposable, published future shifts: 田中愛 (Staff A) and 佐藤健 (Staff B), both 2026-08-15 (Sat), shift types `CUSTOM_1786528259098` and `CUSTOM_1786528350253` respectively.
- Two disposable shift-exchange requests, one per Staff account, each reason string prefixed `QA-CANONICAL-PREVIEW-STAFF-{A,B} attribution test - safe to ignore/reject`.

## 21. QA data cleaned/restored

Not cleaned up — **intentionally retained**. Once published, the canonical Manager schedule grid provides no unassign/unpublish control (published cells render "Published — read-only" with no action button); this is an existing product limitation, not something this session could safely work around. This matches the extensive pattern of already-present retained QA/test data in this Preview environment (many pre-existing `QA-*`-prefixed shift types and "safe to ignore/reject" correction requests from prior QA rounds). All retained data is clearly labeled and non-destructive (a future shift, two exchange requests) — no historical attendance or real records were altered.

## 22. Preview final state

`preview.oruwa.jp` confirmed serving commit `2c61ca367b19b7d65dde352295871755e1abc323` (dev HEAD after PR #229), independently confirmed via GitHub Deployments API and `vercel inspect`.

## 23. Production untouched confirmation

No Supabase Cloud command, production deploy, or production credential was used or referenced at any point this session. All work was scoped to `dev`/Preview per the task's explicit constraints.

---

```
CANONICAL_CAFE_PREVIEW = PASS
STAFF_A_IDENTITY = PASS
STAFF_B_IDENTITY = PASS
TWO_STAFF_ISOLATION = PASS
MANAGER_TO_STAFF_SYNC = PASS
STAFF_TO_MANAGER_ATTRIBUTION = PASS
INVENTORY_ACCEPTANCE = PASS
RECIPES_ACCEPTANCE = PASS
I18N_ACCEPTANCE = PASS_WITH_POLISH
MANAGER_REGRESSION = PASS
SECURITY_ACCEPTANCE = FAIL
QA_DATA_CLEAN = NO
READY_FOR_ORUWA_CAFE_REFERENCE_TENANT = NO
```

**SECURITY_ACCEPTANCE = FAIL** is driven entirely by §17.B (`/dashboard/workforce/manager` missing a page-level role gate). This is a pre-existing gap, not something introduced by the Cafe v2.1 canonical Staff consolidation, and RLS still blocks the underlying writes — but it is a genuine information-disclosure regression against this same consolidation's own privacy design intent (§10), reachable by any Staff account today on Preview, and therefore blocks a clean "ready to cut a public-facing reference tenant" verdict until a Founder decides how the Manager route should be gated (or explicitly accepts the risk).

## Exact next recommended action

1. Founder decision on §17.B: gate `/dashboard/workforce/manager` (and confirm `/dashboard/inventory`'s catalog-CRUD paths aren't similarly exposed) behind a manager-only permission check (e.g. `workforce.shift.write`) at the page/layout level. Small, well-scoped, but touches an authorization surface — out of this session's fix-without-asking authority.
2. Once that is resolved (or explicitly accepted as a known risk for the reference-tenant use case), re-run just the §16/§17 security checks — no need to repeat the rest of this report.
3. Do not create the `oruwa-cafe` reference tenant until step 1 is closed.
