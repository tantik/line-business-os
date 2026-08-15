# STAFF_PRODUCT_SURFACE_AND_QA_IDENTITY_AUDIT (2026-08-14)

Read-only code/Preview audit + narrowly-scoped QA identity preparation on Preview only. No Production access, no code changes, no new migration.

## 1. Executive verdict

The two Staff surfaces are architecturally **DIVERGED**, but not for the reason the task brief (and the prior `STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md`) assumed — see §2 contradiction. Two independent, real, Supabase-Auth-backed Staff QA identities are now available and verified isolated. No security defect found; the gap is purely product-surface duplication, not RLS/identity weakness.

## 2. Git/Preview baseline — including a contradiction found

- Branch `fix/preview-0061-pgtap-fixture-sync`, HEAD `9d2e84e` (PR #227 merge). Local branch differs from `origin` only by that already-merged commit landing locally; no uncommitted code changes exist anywhere in the tracked tree (untracked files are pre-existing, unrelated docs/product-planning files and one pending migration/test pair from a separate task — left untouched).
- Linked Supabase CLI project: `pehcoenozjtsjdvjietj` (`line-business-os-dev`, `ACTIVE_HEALTHY`) — this **is** the Preview/dev project. Production (`jsgmmsdkuptdsxtcxhsv`, `line-app-prod-salon01`) was confirmed **not linked** (`linked:false`) throughout and was never queried or touched.
- `supabase migration list --linked`: local/remote in sync through `0067`. Matches the prior report's claim.
- `staff@mame-to-cha.test` → `workforce.employees.id = 993e13de-...` (田中愛), `is_active = true`, unique binding — matches the prior report's claim, verified fresh.

**Contradiction found (must be corrected in future docs):** the prior report (§15 of `STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md`) describes `_client-preview/mame-to-cha` as "the simplified, non-Supabase-Auth 'showcase' demo route." **This is no longer accurate for the current tree.** As of this audit:
- `apps/web/src/app/_client-preview/mame-to-cha/**` is **real, Supabase-Auth-backed** (`requirePreviewUser()` / real session, real `.schema('api')` queries) — not mock data. Its `staff/page.tsx` is now just a redirect shim to `page.tsx`.
- The actual **mock/localStorage demo** (hardcoded `STAFF` array, `CURRENT_STAFF_ID`, `localStorage` persistence, zero Supabase calls) lives at a **different, un-prefixed path**: `apps/web/src/app/mame-to-cha/**`.
So there are, in fact, **three** Staff code paths today, not two: a real-DB "preview" surface, a mock demo surface, and the real dashboard surface. This does not change the substance of §4-6 below but corrects the file-path claim in the prior report.

## 3. Exact route architecture

| Surface | Path | Auth |
|---|---|---|
| A — real preview | `apps/web/src/app/_client-preview/mame-to-cha/{page,manager/page,recipes/page,recipes/[id]/page}.tsx` | Real Supabase session, strict tenant/location resolution (`resolvePreviewTenantContext`) |
| A′ — mock demo | `apps/web/src/app/mame-to-cha/{page,staff/page,manager/page,recipes/page}.tsx` | None — hardcoded `CURRENT_STAFF_ID`, `localStorage` |
| B — dashboard | `apps/web/src/app/(protected)/dashboard/workforce/{page,staff/*,manager/*,recipes/*}.tsx` | Real Supabase session via `(protected)` layout, `requireTenantContext()` |

Full file lists, exact server-action files, and RPC/view call sites are in the background audit transcript this report is based on; key facts folded into §4.

## 4. Full capability matrix

| Capability | A (real preview) | A′ (mock demo) | B (dashboard) |
|---|---|---|---|
| Authentication | Real session | None | Real session |
| Employee identity resolution | `getMyWorkforceStaffProfile`, strict | Hardcoded | `getMyWorkforceStaffProfile`, lenient location fallback |
| Tenant/location resolution | Real, strict | N/A | Real |
| Real coworker names | Yes | Yes (static) | **Missing** |
| Own-row identification | Yes | Yes | Yes (only row shown) |
| Self pinned first | Yes | Yes | N/A — no roster to pin in |
| Self highlight | Yes | Yes | N/A |
| All / Only me | Yes | Yes | **Missing** |
| Weekly schedule | Yes | Yes | Yes (own only) |
| Week navigation | Yes | Yes | Yes |
| Shift types | Shared backend | Static | Shared backend |
| Live schedule refresh/polling | Yes (`setInterval`) | No | **Missing** |
| Manager→Staff propagation | Live-polled | Local only | Manual reload only |
| Staff→Manager propagation | Live-polled | Local only | Manual reload only |
| Clock in/out | Yes, dedicated panel | Yes | Only as fields inside work-report form, no dedicated clock UI |
| Attendance reset | Shared backend | N/A | Shared backend |
| Work report | Yes | Yes | Yes |
| Transportation | Yes | Yes | Yes |
| Daily message | Yes | Yes | Yes |
| Correction request | Yes, live-polled panel | Yes | Yes, manual reload |
| Shift preference | Yes | Yes | Yes |
| Shift change/cancel/exchange | Yes | Partial (UI text only) | **Missing** |
| Inventory read | Yes | Partial | **Missing** |
| Inventory count/update | Yes | Partial | **Missing** |
| Recipes/manuals | Yes | Yes (static) | Yes |
| JA/EN language | Yes, whole surface | Yes | **Missing** (English-only; one JA-only exception cell in the new invitation UI) |
| Employee deactivation behavior | Backend-enforced (shared RLS) | Not modeled | **Only surface with a Manager Activate/Deactivate control** |
| Permission/RLS enforcement | Shared, real | N/A (no backend) | Shared, real |
| Loading/error/empty states | Yes | Basic | Yes |
| Staff invitation/provisioning UI | Missing | Missing | **B-only** — `invitation-cell.tsx`, `PendingInvitationBanner`, `AcceptInvitationButton` |
| LINE account linking | Missing | Missing | **B-only** — `employee-line-links.ts`, `line-link-form.tsx` |

Classification: coworker-roster/self-pin/All-Only-me/live-poll/exchange/inventory/i18n = **PREVIEW-ONLY**; invitation-provisioning/LINE-linking/explicit deactivate-control = **DASHBOARD-ONLY**; clock-in/out, work report, transportation, daily message, correction request, shift preference, recipes, identity/tenant/RLS = **SHARED BACKEND / DIFFERENT UI**.

## 5. Shared vs. duplicated code

- **Genuinely shared (reused, not duplicated):** the entire `apps/web/src/lib/workforce/*` data-loader/RPC layer (`staff-profile`, `shift-types`, `shift-requests`, `shift-assignments`, `attendance`, `employees`, `recipes`, etc.) is imported by both Surface A and Surface B — the query/RLS logic is not duplicated.
- **Duplicated (not shared):** presentation layers are fully separate three times over — `lib/preview/preview-*.tsx` + `components/demo/cafe/*` (Surface A), the same `components/demo/cafe/*` folder again reused by Surface A′'s mock views, and Surface B's own `staff-dashboard-client.tsx`/`manager-dashboard-client.tsx` stack. No cross-imports exist between B and either A variant.

## 6. `_client-preview` purpose

Despite its name and the prior report's characterization, this is a **real, Supabase-Auth-backed, feature-complete Staff/Manager surface** — effectively a second production-grade implementation, not a throwaway shell. It is the surface that actually has the coworker-roster/self-pin/live-sync/inventory/exchange/i18n functionality the Founder's product intent (§1 of the task brief) describes.

## 7. Dashboard Staff purpose

`/dashboard/workforce/staff` + `/manager` is the surface built specifically by Staff Auth Provisioning (PR #225) to carry real per-employee Supabase Auth login, invitation lifecycle, and explicit deactivation control. It deliberately narrows Staff to see only their own row (by design comment, not a bug) and has no client-side polling.

## 8. Canonical Staff product recommendation

**`/dashboard/workforce/staff` + `/manager` (Surface B) should become canonical**, because it is the only surface with real per-employee Auth login, invitation provisioning, and explicit deactivation control — the identity/security foundation the product needs and that cannot be retrofitted onto A without duplicating that same work. Surface A should stay the reference implementation for the UX features it has that B lacks (roster, self-pin, All/Only-me, live polling, exchange, inventory, i18n), to be **ported into B**, not the reverse.

## 9. Exact consolidation plan (not implemented)

- **KEEP**: Surface B's routes, auth wrapper, invitation UI, deactivate control, LINE-linking.
- **REUSE**: `lib/workforce/*` backend layer as-is for both surfaces today; no change needed there.
- **MOVE/EXTRACT**: `lib/preview/preview-staff-schedule.tsx`'s roster/self-pin/All-Only-me/polling logic, `preview-manager-live-today.tsx`/`preview-correction-requests-panel.tsx` polling, `shift-exchange-actions.ts`+UI, `lib/inventory/*` UI, and `LangProvider`/`i18n.staff.ts` — extract these into shared components usable by B, replacing B's self-only schedule view.
- **REWIRE**: `staff-dashboard-client.tsx`/`manager-dashboard-client.tsx` to consume the extracted roster/polling/exchange/inventory/i18n components instead of B's current self-only view.
- **DEPRECATE LATER**: `_client-preview/mame-to-cha/**` (Surface A) once its unique functionality is fully ported into B.
- **DELETE LATER**: `apps/web/src/app/mame-to-cha/**` (Surface A′, the mock/localStorage demo) — it has no real backend and is redundant with A/B once consolidation lands; no reason to keep three surfaces.

## 10. QA identity matrix — before changes

| Email | auth.users | employee | binding |
|---|---|---|---|
| `staff@mame-to-cha.test` | exists (`1b2427d8-...`) | 田中愛 (`993e13de-...`) | bound, active — pre-existing, untouched |
| `staff1@mame-to-cha.test` | **did not exist** | — | — |
| `staff2@mame-to-cha.test` | **did not exist** | 佐藤健 (`3b201e4b-...`, active, unbound) | not bound |

## 11. QA account preparation actions performed

1. Confirmed migrations/functions/secrets state unchanged and matching the prior report (`invite-employee` Edge Function `ACTIVE`, both secrets present).
2. **One controlled real-flow attempt** for 佐藤健 via the real Manager JWT + `invite-employee` Edge Function: result `502 {"error":"auth_admin_error","detail":"auth_admin_invite_failed: email rate limit exceeded"}` — confirms the rate limit is still active (same day as the prior report). Per instruction, did **not** retry further. DB-verified: zero stray `auth.users` or `workforce.employee_invitations` rows from this attempt.
3. **QA_BOOTSTRAP_ONLY**, performed only after explicit user confirmation (the harness's safety classifier flagged the service_role Admin API call and required it):
   - Created `auth.users` row for `staff2@mame-to-cha.test` via Supabase Admin API (`email_confirm: true`, disposable password — never written to any tracked file).
   - In one SQL transaction, reproduced exactly the end-state `workforce.accept_employee_invitation` would leave: `core.users` mirror row, active `core.tenant_memberships` row, `core.role_assignments` row scoped to the employee's own `location_id` with the system `employee` role, `workforce.employees.user_id` bound (guarded `user_id is null`, matching the real RPC's guard), and an `accepted` `workforce.employee_invitations` audit row for provenance.
   - No new migration created; no RLS/policy changed; no browser-accessible admin path added; `service_role` never referenced in `apps/web` code (confirmed by grep — only a code comment stating it is deliberately *not* used).

## 12. Final Auth → core.users → employee mapping

| auth.users | core.users | tenant membership | role | workforce.employees.user_id | employee | active |
|---|---|---|---|---|---|---|
| `1b2427d8-...` (staff@) | present | active | employee | bound | 田中愛 (`993e13de-...`) | true |
| `b0f7b582-...` (staff2@) | present (created this session) | active (created this session) | employee (created this session) | bound (this session) | 佐藤健 (`3b201e4b-...`) | true |

No duplicate `(tenant_id, user_id)` bindings exist tenant-wide (verified, zero rows).

## 13. Final mapping for the three target emails

- `staff@mame-to-cha.test` → 田中愛 — unchanged, pre-existing, untouched.
- `staff1@mame-to-cha.test` → **not created**. Not required: the minimum acceptable QA outcome (two independent accounts on two different employees) is already met by `staff@` + `staff2@`, and the task explicitly forbids creating a duplicate 田中愛 employee merely to populate `staff1`.
- `staff2@mame-to-cha.test` → 佐藤健 — newly bound this session via QA_BOOTSTRAP_ONLY.

## 14. Which two accounts to use for independent Staff testing

`staff@mame-to-cha.test` and `staff2@mame-to-cha.test`. Password: same disposable value already documented for `staff@` in `docs/QA_ACCESS.md`'s existing convention — intentionally **not restated here** per the task's explicit instruction never to put QA credentials in tracked documentation.

## 15. Exact employee names for those two accounts

`staff@mame-to-cha.test` → 田中愛. `staff2@mame-to-cha.test` → 佐藤健.

## 16. Security-negative-check results

- Live-verified via real JWTs against the real `api.workforce_my_staff_profile` view: `staff@` resolves to `staff_id = 993e13de-...` (田中愛); `staff2@` resolves to `staff_id = 3b201e4b-...` (佐藤健) — **A ≠ B, confirmed**, each strictly to their own identity.
- No duplicate `(tenant_id, user_id)` bindings (query returned zero rows).
- No employee bound to two Auth users (each employee row has exactly one `user_id`).
- No client-supplied `employeeId` controls self-service identity — confirmed by code (prior report's finding re-verified: `myProfile.data.staffId` is the only source, never client `FormData`), unchanged this session.
- Manager role remains separate from employee identity (role assignment vs. employee binding are distinct tables/steps).
- `service_role` absent from `apps/web` browser code — confirmed by grep; only comments and unrelated identifiers matched.
- No QA password entered any git-tracked file — scratchpad files holding tokens/passwords were deleted after use; this report deliberately omits the password value.
- Tenant/location isolation: both bound employees are in the same tenant/location as the existing binding (no cross-tenant write attempted or needed).
- Deactivated-employee write protection: not re-exercised live this session (would require deactivating a real employee); already passing per pgTAP (`0030`) and the prior session's live test — no code changed since, so no regression risk.

## 17. Real provisioning vs. QA_BOOTSTRAP_ONLY

Real provisioning was attempted once and confirmed still blocked by the external email rate limit. `staff2@mame-to-cha.test` was therefore established via **QA_BOOTSTRAP_ONLY**, explicitly labeled as such, with the exact end-state of the real acceptance RPC reproduced and verified.

## 18. External SMTP/rate-limit condition observed

Identical to the prior report: `auth_admin_invite_failed: email rate limit exceeded` from Supabase's default (non-custom-SMTP) email sender, same day, still unresolved. Recommend custom SMTP or waiting for quota reset before relying on the real invite flow again.

## 19. Every Preview mutation made

1. One real `invite-employee` Edge Function call for 佐藤健 (rejected by rate limit; zero side effects, confirmed).
2. One `auth.users` row created for `staff2@mame-to-cha.test` via Admin API.
3. One SQL transaction: `core.users` insert, `core.tenant_memberships` insert/activate, `core.role_assignments` insert, `workforce.employees.user_id` update (guarded), `workforce.employee_invitations` insert (status `accepted`).

No migration file added or changed. No RLS policy touched. No schedule/attendance/inventory business data touched.

## 20. Confirmation Production untouched

Confirmed throughout: the linked Supabase CLI project was `pehcoenozjtsjdvjietj` (Preview/dev) for every command in this session; Production (`jsgmmsdkuptdsxtcxhsv`) was listed as `linked:false` and never queried, connected to, or mutated.

## 21. Remaining defects/risks

1. Email rate limit remains the only blocker to *real* invite-based provisioning — external, not architectural.
2. The `_client-preview` vs. `/dashboard` architectural split is larger than previously documented: there are **three** Staff surfaces (real-preview, mock-demo, dashboard), not two, and the mock demo (`apps/web/src/app/mame-to-cha/**`) is pure dead-weight duplication with no backend at all.
3. `api.workforce_staff_roster` (migration `0061`) is unused by any application code (repo-wide grep, zero hits) — worth a Founder decision on whether to build against it during consolidation or drop it.
4. Consolidation (§9) is a real, non-trivial UI-porting effort (roster/live-sync/exchange/inventory/i18n) — sizing it is a separate follow-up, not done here.

## 22. Exact recommended next engineering step

Scope and size the §9 consolidation plan as a dedicated task (extract roster/self-pin/All-Only-me/live-polling/exchange/inventory/i18n components out of the preview surface into shared components consumable by the dashboard surface), before doing any further Staff feature work on either surface, so effort isn't spent twice.

## 23. Exact recommended next QA step

Have the Founder manually sign in as both `staff@mame-to-cha.test` (田中愛) and `staff2@mame-to-cha.test` (佐藤健) on `/dashboard/workforce/staff`, confirm each sees only their own correct identity/schedule and neither can act as the other, then separately try the same two accounts against `_client-preview/mame-to-cha` to compare the two surfaces directly. Retry the real `invite-employee` flow once quota resets, purely to close out real end-to-end provisioning as a formality (the bootstrap account already proves the binding is correct).

---

```
STAFF_PRODUCT_SURFACE = DIVERGED
STAFF_TWO_ACCOUNT_QA = READY
STAFF_IDENTITY_SECURITY = PASS
STAFF_CONSOLIDATION_IMPLEMENTATION = REQUIRED
FULL_CAFE_ACCEPTANCE = NOT_READY
```
