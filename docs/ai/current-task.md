# LINE Business OS — Current Task

Canonical current-state file per `documentation-and-decision-hierarchy.md` §2
and `docs/ai/oaes-project-profile.md` "Context continuity". It states only the
**current verified stage, active constraints, and the next gate**. It is not a
changelog and not a mission log.

**Size rule (Founder-approved 2026-09-19): keep this file under ~250 lines**
so a fresh session reads it in a single call. When a mission closes, do NOT
append a new dated pointer block. Instead:

1. put the mission's full detail in its own handoff or completion report
   under `docs/ai/` (templates in `docs/ai/templates/`);
2. replace §5 below with the new current stage and next gate;
3. record anything left open in `docs/operations/deferred-debt-register.md`
   (Operating Model §19), not in this file;
4. if the previous §5 holds detail worth keeping, move it verbatim into
   `docs/ai/history/`.

History lives in `docs/ai/history/` and git, never here.

## 1. Governance state

- `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` is the canonical
  definition of how a Claude Code session runs a mission here (autonomy
  boundaries, evidence discipline, mission/handoff/completion-report formats).
- **ORUWA AI Governance Consolidation** — complete across phases:
  - Phase 1 (read-only audit) — complete:
    `docs/ai/ORUWA_AI_GOVERNANCE_CONSOLIDATION_AUDIT.md`.
  - Phase 2A (approval-authority reconciliation between
    `oaes-project-profile.md`/`oruwa-engineering-principles-and-governance.md`
    §7.5 and the Operating Model) — complete, merged via PR #236.
  - Phase 2B (unique-information consolidation — migrated still-valid content
    out of `docs/project/*` and the stale `docs/ai/` standing docs into
    `docs/ai/current-task.md`, `docs/ai/review-checklists.md`, and
    `docs/operations/risk-register.md`) — complete, merged via PR #237.
  - Phase 2C (deletion of the superseded governance/state/history files
    Phase 2B marked SAFE_TO_DELETE, plus §4–6 of `docs/AI_PLAYBOOK.md`
    migrated to `docs/architecture/frontend-engineering-standards.md`) —
    complete, merged via PR #238.
- `docs/project/*`, `scripts/project-handoff.ps1`, `docs/ai/project-context.md`,
  `docs/ai/agent-roles.md`, `docs/ai/oaes-integration-acceptance-report.md`,
  have been deleted (Phase 2C, 2026-08-15). Their
  still-valid content survives in `docs/ai/current-task.md` (this file),
  `docs/ai/review-checklists.md`, `docs/operations/risk-register.md`, and
  `docs/architecture/frontend-engineering-standards.md`. `docs/ai/current-task.md`
  is the single canonical mission-state mechanism going forward. Do not
  recreate any of the deleted files under new names. `docs/AI_PLAYBOOK.md`
  remains tracked but is non-canonical and superseded/migrated; do not use it
  as current mission or route authority.
- **2026-09-19 governance update** (docs-only): Operating Model v1.9.0 adds
  the role model for the ChatGPT brief author and specialized reviewers
  (§2, §12, §13), brief intake / Prompt Review (§18), and the coverage matrix
  plus deferral discipline (§19); `docs/operations/deferred-debt-register.md`
  is the single register of open deferrals; this file was reduced from 2240
  lines to a current-state document, its old content archived verbatim in
  `docs/ai/history/`.

## 2. Cafe product state

Cafe Package v2.0 remains frozen (bug/security/accessibility/localization
fixes and bounded release polish only; new features require a new Product
Review). **Cafe Package v2.1 is CLOSED** (bounded F1/F2 closure with Final
Founder Acceptance 2026-08-16, then a broader **Founder Acceptance = PASS on
2026-08-26**, `docs/ai/CAFE_V2_1_FOUNDER_ACCEPTANCE_CLOSURE_2026-08-26.md`).
This is not a Commercial Release; production remains separately gated and was
not enabled.

**Cafe v2.2: all five planned Work Packages are CLOSED, but v2.2 itself is
NOT declared CLOSED.** Nothing below authorizes new work by itself.

| Package | Status | PR / migration | Detail |
|---|---|---|---|
| WP1 Operations | CLOSED 2026-09-10, accepted with explicit MVP limitations | WP1-A `0099`–`0105` (PRs #462–#465); G1 fix `0116` (#513) | `CAFE_V2_2_WP1_OPERATIONS_FINAL_BOUNDED_ACCEPTANCE_2026-09-08.md`, `SESSION_HANDOFF_2026-09-10.md` |
| Design System v1 + Operations pilot | DONE 2026-09-11 | #516 | `SESSION_HANDOFF_2026-09-11.md` |
| WP2 Issues & Handover | CLOSED 2026-09-12 | #517, `0117`/`0118` | `SESSION_HANDOFF_2026-09-12.md` |
| WP3 Owner Weekly Review | CLOSED 2026-09-14 | #518–#522, `0119` | `SESSION_HANDOFF_2026-09-14.md` |
| WP4 Purchasing v2 | CLOSED 2026-09-15 | #524, `0120` | `SESSION_HANDOFF_2026-09-15.md` |
| WP5 Recipe Intelligence Lite | CLOSED 2026-09-17 | #525/#526, `0121` | `CAFE_V2_2_WP5_RECIPE_INTELLIGENCE_HANDOFF_2026-09-17.md` |
| Mission 8 Bounded Quality Sweep | CLOSED 2026-09-18 (predates the coverage rule; its untested dimensions were registered as DEBT-006 to DEBT-009, DEBT-042; DEBT-006 to DEBT-008 were closed by the 2026-09-21 acceptance, the rest stay open) | #529 | `SESSION_HANDOFF_2026-09-18.md` |
| Mission 9 Demo Readiness | CLOSED 2026-09-18, one Founder-deferred exception (predates the coverage rule; gaps registered as DEBT-001 to DEBT-005, DEBT-009, DEBT-042) | #531, #532 | `SESSION_HANDOFF_2026-09-18-MISSION9.md` |
| Full Integrated Acceptance (Phase 4) | CLOSED WITH GAPS 2026-09-21 (NOT TESTED: DEBT-049, DEBT-042, DEBT-009, DEBT-057, DEBT-060; Definition of Done item 4 not met: open class A findings DEBT-050 to DEBT-053, DEBT-061) | #536, #537 | `CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md`, `SESSION_HANDOFF_2026-09-21.md` |

Verified baseline (directory listing, git, test runs and a read-only
`supabase migration list` on 2026-09-21):

- Base branch: `dev`. Local migrations extend through `0121`; pgTAP test files
  through `0062`. Last recorded `apps/web` suite result: 1354/1354 (Full Integrated
  Acceptance, 2026-09-21; local pgTAP 60 files / 1475 tests, failing set =
  DEBT-037 baseline only). Migrations `0000`–`0121` are applied to Cloud DEV (VERIFIED
  2026-09-21, read-only `supabase migration list`, Remote column).
- v2.0 authenticated acceptance: `docs/product/cafe-package-v2-acceptance-report.md`.
  v2.1 evidence of record: `docs/product/cafe-package-v2-1-acceptance-report.md`,
  `docs/product/cafe-package-v2-1-founder-acceptance-audit.md`,
  `docs/product/cafe-package-v2-1-final-live-founder-acceptance.md` (2026-08-10,
  stale/superseded), `docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`,
  and the closing record
  `docs/product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md`. Do
  not reuse v2.0 PASS results as proof of changed surfaces.
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

### 2.3 Cafe v2.1 Whole-Product Gate and closure (summary)

The Whole-Product Integrity Gate (after PR #240) found P0 = 0, P1 = 2; the
two P1s (F1 Add/Edit Staff modal and F2 Shift Cell Editor were English-only)
were fixed in PR #241, verified live on Preview, and v2.1 closed on that
basis. Its remaining P2/P3 findings are durable deferred debt: open ones are
tracked in `docs/operations/deferred-debt-register.md`. Full verbatim text:
`docs/ai/history/current-task-cafe-v2-1-closure-and-launch-readiness.md`.

### 2.4 Cafe Commercial Launch Readiness (summary)

"Cafe v2.1 CLOSED" is a bounded, code-scoped claim, not "ready to sell"
(Founder decision 2026-08-16). A higher gate, **Cafe Commercial Launch
Readiness**, bundles Cafe-specific work with platform-wide work (Platform
Foundation) and must pass before Cafe is treated as launch-ready. Its step 1
(IA/visual reconciliation, mechanical hardening) completed 2026-08-16. The
old step ordering in the archived text is superseded by
`docs/strategy/oruwa-master-roadmap.md` (Cafe v2.2 before Platform Foundation
reconciliation); the remaining steps and their current status live in that
roadmap and `docs/project/master-state.md`, not here. Full verbatim text:
`docs/ai/history/current-task-cafe-v2-1-closure-and-launch-readiness.md`.

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
  first-time hire stuck mid-onboarding — see Defect C in the Whole-Product
  Gate §21).
- No LINE Login in the Staff-auth-provisioning scope.

Product/business (originally recorded in the now-deleted `docs/project/03_DECISIONS.md`;
Founder-provided, evidence still pending — carried forward here as still-open
constraints, not yet formal ADRs):

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

## 5. Current stage and exact next gate

**As of 2026-09-21** (checked against git; `dev` includes PR #536, #537, #539):

- **Full Integrated Acceptance (Phase 4) is CLOSED WITH GAPS.** Report:
  `docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md`.
- **UPDATE 2026-09-22: Mission 10.5 is CLOSED. Founder Technical Freeze readiness:
  PASS.** The Founder merged PR #541 and applied `0122` to Cloud DEV; verified
  live (Staff reads 0 rows from `api.workforce_staff_manage`, Manager
  read/write ok, a new Issue at 03:04 JST got 営業日 2026-09-22, Data API exposes
  only `public`, `graphql_public`, `api`). The next and final Cafe v2.2 mission is
  Founder Acceptance (not started); the Technical Freeze itself is the
  Founder's decision. The two-step text below is historical for this mission.
- **Mission 10.5 Technical Freeze Closure was PARTIAL, blocked by a Founder gate (2026-09-21).**
  Report: `docs/ai/CAFE_V2_2_TECHNICAL_FREEZE_CLOSURE_REPORT_2026-09-21.md`;
  handoff: `docs/ai/SESSION_HANDOFF_2026-09-21-MISSION10-5.md`. Done and merged:
  PR #539 (individual hourly rate in the Manager staff form on the existing
  `hourly_wage_yen`, DEBT-052 wage/notes erase fixed, estimated labour cost never
  counts a missing rate as 0 yen; live-verified with two different rates).
- **Two Founder steps remain (RED / input):** (1) merge PR #541 and apply
  migration `0122` to Cloud DEV (Issues `business_date` in the location
  timezone, Inventory module gate restored on Purchases writes, and DEBT-062:
  `api.workforce_staff_manage` was readable by Staff, exposing coworkers' wage);
  (2) DEBT-061 for Cloud DEV is VERIFIED PASS (2026-09-21: only `public`,
  `graphql_public`, `api` exposed); the Production project is still to be
  probed (T-PROD). Do not enter real wages before `0122` is applied.
- **Cafe v2.2 is NOT declared CLOSED.** Founder Technical Freeze readiness becomes
  PASS after those two steps; Commercial Release remains a separate Founder
  decision (DEBT-053 copy/allergen wording, DEBT-001 to DEBT-004 demo data,
  DEBT-035/036/043 production path, DEBT-049 second tenant). Next and final
  Cafe v2.2 mission: Founder Acceptance (not started).
- Production and `main` are untouched and separately gated.

Where everything else lives:

| Need | Read |
|---|---|
| Open deferrals, each with a trigger for when to revisit | `docs/operations/deferred-debt-register.md` |
| Latest mission detail | the newest `docs/ai/SESSION_HANDOFF_*.md` |
| Mission history (verbatim, pre-2026-09-19) | `docs/ai/history/current-task-pointers-2026-08-to-2026-09.md` |
| Roles, brief intake, coverage matrix | `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §2, §18, §19 |
| Project-level state and phase order | `docs/project/master-state.md`, `docs/strategy/oruwa-master-roadmap.md` |
