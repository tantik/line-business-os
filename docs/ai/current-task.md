# LINE Business OS — Current Task

Canonical current-state file per `documentation-and-decision-hierarchy.md` §2
and `docs/ai/oaes-project-profile.md` "Context continuity". This is not a
changelog — historical execution detail lives in git history and in the dated
mission reports/handoffs under `docs/ai/`; this file states only the current
verified stage, active constraints, and the next gate.

## 1. Governance state

- `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` is the canonical
  definition of how a Claude Code session runs a mission here (autonomy
  boundaries, evidence discipline, mission/handoff/completion-report formats).
- **ORUWA AI Governance Consolidation** is in progress across phases:
  - Phase 1 (read-only audit) — complete:
    `docs/ai/ORUWA_AI_GOVERNANCE_CONSOLIDATION_AUDIT.md`.
  - Phase 2A (approval-authority reconciliation between
    `oaes-project-profile.md`/`oruwa-engineering-principles-and-governance.md`
    §7.5 and the Operating Model) — complete, merged via PR #236.
  - Phase 2B (unique-information consolidation — migrate still-valid content
    out of `docs/project/*` and the stale `docs/ai/` standing docs before
    Phase 2C deletes them) — this mission. See its PR for the exact file
    disposition and the SAFE_TO_DELETE list handed to Phase 2C.
  - Phase 2C (mass deletion of superseded governance/state files) — not yet
    started; scoped by Phase 2B's completion report.
- `docs/project/*` is retired as an active state system (Founder decision,
  Phase 2B mission scope). `docs/ai/current-task.md` (this file) is the single
  canonical mission-state mechanism going forward. `docs/project/*` files
  still exist on disk pending Phase 2C deletion; do not update them further.

## 2. Cafe product state

Cafe Package v2.0 remains frozen (bug/security/accessibility/localization
fixes and bounded release polish only; new features require a new Product
Review). Cafe Package v2.1 is in Preview evidence closure on `dev`; **Cafe
v2.1 Freeze has not been declared and this is not a Commercial Release.**

Verified baseline:
- Base branch: `dev`. Local migrations extend through `0068` (committed);
  pgTAP test files extend through `0036` (directory listing, VERIFIED
  2026-08-15 — pass/fail counts NOT re-run this session, do not assume a
  prior session's numbers still apply without re-running).
- v2.0 authenticated acceptance: `docs/product/cafe-package-v2-acceptance-report.md`.
- v2.1 evidence of record: `docs/product/cafe-package-v2-1-acceptance-report.md`,
  `docs/product/cafe-package-v2-1-founder-acceptance-audit.md`,
  `docs/product/cafe-package-v2-1-final-live-founder-acceptance.md`. Do not
  reuse v2.0 PASS results as proof of changed v2.1 surfaces.
- Production remains separately gated and was not enabled.

### 2.1 Canonical Staff surface (settled)

`(protected)/dashboard/workforce/**` ("Surface B") is the canonical Cafe
Staff/Manager product surface — Founder decision, PR #228 (2026-08-14),
ratified with no contradicting evidence by
`docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`. The
`%5Fclient-preview/mame-to-cha/**` surface ("Surface A", preview-host-only)
remains, for now, the client-acceptance/UX-reference environment; its
long-term retain-vs-retire status is still an open Founder decision (see
§2.3). The unauthenticated `mame-to-cha/**` / `demo/cafe/**` surfaces are
intentional public marketing demos, out of scope for "real Staff product
experience."

### 2.2 Staff onboarding (proven end-to-end)

The invite → email → password-setup → `api.accept_employee_invitation`
onboarding chain is proven working for a genuine first-time hire with zero
manual Admin-API recovery, via the server-side `token_hash`/`verifyOtp`
callback fix (PR #233, merged) plus a Founder-applied Supabase Invite email
template change. Verified live end-to-end for Staff C on the `oruwa-cafe`
reference tenant (`docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`
§33, `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF_2026-08-15.md`
§3). Do not reopen this result without new contradicting evidence.

### 2.3 Open Cafe v2.1 items (future product mission — not this repository's
current governance task)

Full detail, evidence, and citations:
`docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md` §10–15.

- **P0 (Manager could not act on a Staff shift-exchange request) — CLOSED**
  2026-08-15, commit `f476792` ("feat(cafe): canonical Manager UI to
  approve/reject Staff shift-exchange requests"), on `dev`.
- **P1, open**: no live one-tap clock-in/out on the canonical Staff surface
  (manual time entry only); incomplete JA/EN localization on several Staff
  sections (profile card, preferences table, work-report, correction-request
  form); raw/untranslated `employmentType`/`attendance_status` values shown
  to Staff; Staff location-fallback is lenient where the reference surface
  fails closed.
- **P2, open**: no modal/detail-overlay pattern on the canonical Staff page
  (flat 7-section scroll); no mobile touch-target sizing; orphaned dead stub
  `apps/web/src/app/workforce/page.tsx` with two dangling redirects;
  `api.workforce_staff_roster` (migration `0061`) remains unused by any
  application code — Founder decision needed (wire in or drop).
- **Open defects** (`docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`
  §34, `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF_2026-08-15.md`
  §4):
  - **Defect A** (Low–Medium) — `/dashboard/admin` has no role/permission
    gate (`requireTenantContext()` only). Currently inert (RLS empties reads,
    every action is a disabled placeholder) but must be fixed before any real
    privileged action is wired onto that route.
  - **Defect B** (Low) — `listMyPendingWorkforceInvitations` relies solely on
    RLS policy OR-composition to scope "my pending invitations," so a Manager
    also sees (and can Accept) other people's pending invitations via
    `PendingInvitationBanner`. No unauthorized write is possible
    (`api.accept_employee_invitation` independently re-checks
    `target_user_id`), but visibility should be scoped explicitly.
  - **Defect C, recovery half** (Medium, onboarding-reliability blocker) — the
    fresh-onboarding half is fixed (§2.2); no self-service recovery path
    exists yet if a user's Auth token is consumed but password-setup/
    acceptance never completes (closed tab, lost connection, any
    interruption). `/sign-in` states outright "password reset... not
    available yet." Must be resolved (self-service recovery flow, or a
    formal Manager-triggered recovery action) before this invite flow is
    relied on for real customer onboarding.
- **Founder decision still needed**: Surface A's long-term retain-vs-retire
  status once Surface B reaches parity on the P1/P2 items above.

None of the open items above require DB/RLS/Auth changes. Closing them is a
bounded, separately-scoped future product mission — do not start it as part
of a governance/documentation mission, and do not start Cafe v2.2 before it
closes.

## 3. Founder decisions in force (not fully restated elsewhere)

Staff identity/auth architecture (`docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md`
§3; the identity-shape invariants are also enforced in schema by migrations
`0062`–`0064`):
- One Auth user → at most one `workforce.employees` row **per tenant**
  (`unique (tenant_id, user_id) where user_id is not null`); the same person
  may be an employee in a different tenant.
- An employee's contact email may double as their invite/login email
  initially; changing the employee's contact email later must never silently
  mutate their Supabase Auth login email.
- For an invite to an email that already belongs to an existing Supabase Auth
  user, no new email is sent — the person accepts via the in-app
  `PendingInvitationBanner` on their next authenticated session. This is a
  deliberate architecture choice, not a gap (it does not, however, cover a
  first-time hire stuck mid-onboarding — see Defect C, §2.3).
- No LINE Login in the Staff-auth-provisioning scope.

Product/business (`docs/project/03_DECISIONS.md`, Founder-provided,
evidence still pending — carried forward as still-open constraints, not yet
formal ADRs):
- Platform subscription billing and merchant payments are treated as separate
  domains; do not mix SaaS entitlement with customer commerce without a
  formal source.
- Do not make a public "one-hour onboarding" commercial claim before a
  successful rehearsal.
- Cafe v2.2 scope selection prioritizes purchase probability and onboarding
  impact; no heavy ERP-style scope.

## 4. Safety boundaries

See `CLAUDE.md`'s four highest-risk constraints and
`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §8–§9 for the full,
canonical approval-boundary rules. Restated only as a pointer, not
duplicated here.

## 5. Exact next gate

1. This mission (Phase 2B) opens a PR into `dev` for review; merge remains a
   human gate. Phase 2C (mass deletion of the files this mission's PR marks
   SAFE_TO_DELETE) is a separate, future mission.
2. Cafe v2.1 Staff-surface reconciliation (§2.3) is a separate, future
   product mission — Phase 1 (P0) is already closed; Phase 2 (P1) and Phase 3
   (P2) from the reconciliation audit's §14 plan are not yet scheduled.
3. Do not start Cafe v2.2 before the open Cafe v2.1 items in §2.3 close and a
   Founder Freeze decision is recorded for v2.1.
