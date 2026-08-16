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

## 2. Cafe product state

Cafe Package v2.0 remains frozen (bug/security/accessibility/localization
fixes and bounded release polish only; new features require a new Product
Review). **Cafe Package v2.1 is CLOSED** (Final Founder Acceptance recorded
2026-08-16, see §2.3). This is not a Commercial Release — production remains
separately gated and was not enabled (see "Verified baseline" below).

Verified baseline:

- Base branch: `dev`. Local migrations extend through `0068` (committed);
  pgTAP test files extend through `0036` (directory listing, VERIFIED
  2026-08-15 — pass/fail counts NOT re-run this session, do not assume a
  prior session's numbers still apply without re-running).
- v2.0 authenticated acceptance: `docs/product/cafe-package-v2-acceptance-report.md`.
- v2.1 evidence of record: `docs/product/cafe-package-v2-1-acceptance-report.md`,
  `docs/product/cafe-package-v2-1-founder-acceptance-audit.md`,
  `docs/product/cafe-package-v2-1-final-live-founder-acceptance.md` (2026-08-10,
  stale/superseded — see that file and §2.3),
  `docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`, and the closing
  record `docs/product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md`.
  Do not reuse v2.0 PASS results as proof of changed v2.1 surfaces.
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

### 2.3 Whole-Product Gate and Final Bounded Closure

The Whole-Product Integrity & Completeness Gate completed after PR #240 with
verdict `CAFE_V2_1_READY_AFTER_BOUNDED_FIXES`: **P0 = 0, P1 = 2**. Full
evidence and the durable P2/P3 register are in
`docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`.

The only authorized implementation closure scope is:

1. **F1** — localize the Manager Add/Edit Staff modal.
2. **F2** — localize the Manager Shift Cell Editor.

Implementation merged into `dev` through PR #241 (`ed1de927`); CI and Vercel
passed. **Authenticated Preview QA, independent review, and Final Founder
Acceptance have since completed** (2026-08-16): both F1 and F2 verified
PASS live on `preview.oruwa.jp` (JA rendering confirmed in the Add/Edit
Staff modal and the shift-assignment editor, persisted across reload), no
P0/P1 regression found. Full evidence:
`docs/product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md`.
**Cafe v2.1 is CLOSED on this basis.**

Known P2/P3 findings remain durable **Cafe Hardening / Deferred Debt**. They
are not fixed, forgotten, or release blockers, and they are not automatically
authorized as the next mission. Cafe Product Growth (Checklists, Manuals
integration, report/problem lifecycle, lightweight Training, Weekly Review,
Inventory improvements) is a separate post-v2.1 candidate category. The IA/
navigation and visual/UX reconciliation of the canonical surface against the
Surface A reference (route naming, mobile styling, presentation polish) is
also not started by this closure — it is planned future work
(`docs/strategy/go-to-market-roadmap.md` §3; `../ORUWA-info.md` §15 Horizon
B) and requires its own bounded Product/Founder decision to begin, same as
any other post-v2.1 category.

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

## 5. Exact next gate

**Cafe v2.1 is closed** (§2.3). Preview QA, independent review, and Final
Founder Acceptance all complete as of 2026-08-16 — this repeats no further
action.

1. Do not automatically start Cafe Hardening / Deferred Debt, Cafe Product
   Growth, Platform Foundation, IA/visual reconciliation of the canonical
   surface, or Cafe v2.2 as a consequence of this closure; each requires
   its own bounded Product/Founder decision, per §2.3 and `../ORUWA-info.md`
   §14.
2. The next bounded mission (once selected by the Founder) should update
   this section to name it explicitly, rather than leaving this file
   pointing at a already-closed gate.
