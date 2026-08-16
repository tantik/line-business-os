# ORUWA AI PLAYBOOK

> **Reviewed 2026-08-15 (ORUWA AI Governance Consolidation, Phase 2B) — not
> yet fully safe to delete.** Not a canonical entry point; untracked. §2–3
> (project essentials, non-negotiable rules) duplicate `AGENTS.md`/security-
> requirements.md — no migration needed. §7 (QA environment / canonical
> routes) is now **stale**: it names the preview-host Manager/Staff routes as
> canonical, but `(protected)/dashboard/workforce/**` was ratified canonical
> by PR #228 and `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`
> — do not follow §7's routes. §9–11 (Founder Acceptance order, defect/
> evidence standard, improvement classification) were migrated to
> `docs/ai/review-checklists.md`. §12–15 (Claude Code operating rules,
> ChatGPT Work/Browser QA rules, DoD) are superseded by
> `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`. **§4–6 (engineering decision
> standard, performance patterns, UX implementation standard) are unique,
> not duplicated elsewhere in this repository, and were NOT migrated by this
> mission** — they are substantive engineering/UX standards outside this
> mission's governance/state-consolidation scope, and no existing canonical
> document is an obvious fit. This file is therefore **not** SAFE_TO_DELETE
> in Phase 2C until a Founder decision names a destination for §4–6 (e.g. a
> new `docs/architecture/frontend-engineering-standards.md`) or confirms
> they may be dropped. Full disposition:
> `docs/ai/ORUWA_AI_GOVERNANCE_CONSOLIDATION_AUDIT.md`.

## 1. Purpose and scope

This is the reusable operating contract for ChatGPT Work / Browser QA, Claude
Code, Codex, reviewers, and future AI agents working in this repository.

It does NOT replace product specifications, ADRs, `docs/ai/current-task.md`,
or release/acceptance reports. A future prompt can say: "Read
`docs/AI_PLAYBOOK.md`, then perform this task: ..." instead of restating
project context.

## 2. Project essentials

- ORUWA Business OS (repo: LINE Business OS) — a single multi-tenant SaaS
  platform for Japanese SMBs.
- Next.js App Router (`apps/web`), NestJS (`apps/api`), background jobs
  (`apps/worker`).
- Supabase/PostgreSQL with PostgreSQL Row Level Security (RLS) as the primary
  tenant-isolation boundary.
- Hosted on Vercel.
- `tenant_id` on every business table; `location_id` when data belongs to a
  physical branch/store/location.
- Product code ships as reusable modules/packages (`packages/core|db|line|ai|
  ui|config|workforce|booking`) inside one shared Core — never tenant-specific
  forks or standalone repos/apps.
- Demo and client-template are tenants (differ by `tenant.kind`, `settings`,
  seed data only), not separate codebases.
- Cafe is the current first product package.

## 3. Non-negotiable architecture/security rules

MUST:
- Enforce tenant isolation in the database via RLS, not frontend filtering.
- Give every business table `tenant_id uuid not null`; add RLS in the same
  migration that creates the table.
- Derive `tenant_id`/tenant context from the authenticated user's membership
  server-side (`packages/core/src/tenant-context.ts`).
- Keep permission/RBAC checks server-side (`packages/core/src/permissions.ts`).
- Keep app-facing API/facade boundaries (e.g. `api` schema) narrow and
  intentional; internal schemas stay internal.
- Encrypt PII (email, phone, address, customer name, employee name, LINE user
  id) via `@line-os/db/crypto`; searchable PII uses `*_encrypted` + `*_hash`
  blind index.
- Verify LINE webhook signatures against the raw body before processing.
- Audit every business-data mutation with `writeAudit`.
- AI proposes changes; a human approves; backend applies through the normal
  permission/RLS path; the result is audited. AI never writes business data
  directly.

MUST NOT:
- Never import `createServiceClient` / read `SUPABASE_SERVICE_ROLE_KEY` in
  `apps/web`. The frontend uses only the anon key + RLS.
- Never trust a client-supplied `tenant_id`, `location_id`, or role.
- Never make a migration, RLS policy, auth, secret, role/permission, or
  billing change without explicit human approval.
- Never run destructive SQL, a Supabase Cloud write (`db push`, `db pull`,
  `link`, migration repair), or a production/Vercel deploy without explicit
  human approval.
- Never send a LINE broadcast or mass message, or touch real customer PII/
  onboarding, without explicit human approval.
- Never modify legacy reference repos (`cafe-shift`, `line-app`) destructively
  or copy them wholesale.

## 4. Engineering decision standard

For implementation or recommendation work:

1. Inspect the current implementation first — do not assume.
2. Establish evidence before proposing a change.
3. Check whether a current, modern implementation provides a real, measurable
   advantage over what exists.
4. Prefer the simplest production-grade solution.
5. Prefer native platform/browser capabilities when they are sufficient.
6. Do not introduce libraries/frameworks for fashion or novelty.
7. Measure before optimizing.
8. Preserve proven working architecture.

For UX/technical decisions, benchmark interaction and engineering patterns
used by strong modern products (e.g. Linear, Notion, GitHub, Figma, Slack,
Google Workspace, Apple, Stripe, Shopify, Vercel) — never copy their visual
design, only proven patterns with measurable benefit for ORUWA.

Every recommendation must state: evidence, expected benefit, complexity,
risk, and why it fits ORUWA. If no meaningful benefit exists: **keep the
current implementation.**

## 5. Proven performance patterns

- Avoid duplicate data fetches for the same data in one request/render cycle.
- Avoid unnecessary request waterfalls; parallelize independent work.
- Do not resolve the same auth/tenant/membership context twice in one request.
- State needed across a modal's close/reopen cycle must live above the
  component that unmounts on close, not inside it.
- Do not regenerate signed URLs on every modal open; reuse until they expire.
- Use delta/targeted refresh when only one record changed, not a full refetch.
- Image/list loading must be viewport-aware, not an arbitrary "first N eager"
  rule; prefer native lazy loading when it is sufficient.
- Reserve image geometry (explicit width/height or aspect-ratio) to avoid
  layout shift.
- Any visible operation that takes noticeable time needs clear pending/loading
  feedback.
- Do not add caching, virtualization, queues, or similar infrastructure
  without evidence that it is actually needed.

## 6. UX implementation standard

- Modals/dialogs: use the shared `Modal` component; consistent open/close/
  Escape/backdrop behavior everywhere.
- Focus/keyboard: sensible focus trap and return-focus-on-close; Escape
  closes non-destructive dialogs.
- Forms: label every field, validate before submit, preserve user input on
  validation failure.
- Destructive actions require an explicit confirmation step; never require
  optimistic UI for dangerous/non-reversible actions.
- Loading: skeletons or spinners for real waits — **the UI must never appear
  frozen during a real wait.**
- Empty states and error states must be explicit, not a blank screen.
- Mutations that succeed give visible success feedback.
- Responsive/mobile usability and basic accessibility (contrast, focus
  visibility, tap targets) apply to every customer-facing screen.
- Never degrade existing UX in service of new architecture — architecture
  should stay invisible to the operator using the product; anything a system
  does automatically (translation, auto-numbering, background recalculation)
  should be observable only in its effect, never its mechanism, on a screen a
  non-technical operator uses.

## 7. QA environment

Repository: `D:\Dev\line-business-os`

Preview: https://preview.oruwa.jp

Canonical routes:
- Manager: https://preview.oruwa.jp/mame-to-cha/manager
- Staff: https://preview.oruwa.jp/mame-to-cha
- Recipes: https://preview.oruwa.jp/mame-to-cha/recipes

Legacy `/mame-to-cha/staff` permanently redirects to the canonical Staff route
(`/mame-to-cha`) and must not be treated as the primary route.

Do NOT use `/demo/*` as evidence for DB-backed Cafe acceptance — it is a
frontend-only UX reference, not a live data path.

QA accounts:
- Manager email: `manager@mame-to-cha.test`
- Staff email: `staff@mame-to-cha.test`

QA passwords are temporary and must be supplied out-of-band in the current
task prompt. Do not store passwords in this or any committed file. These
accounts are Preview-only disposable QA accounts.

## 8. Browser QA execution rules

Before reporting live evidence:
- Confirm real browser/computer-use capability is actually available.
- If unavailable, STOP and say so — never simulate browser actions or invent
  observations.

During QA:
- Use isolated Manager and Staff browser profiles.
- Keep Console/Network available when investigating runtime/performance
  issues.
- Use clearly named, disposable fixtures.
- Never use direct DB writes to clean up QA data unless separately approved.
- Record rollback state for any fixture created.

## 9. Founder Acceptance scope

Full acceptance order:

1. Authentication/session
2. Manager
3. Schedule
4. Staff management
5. Recipes/SOP
6. Inventory
7. Settings
8. Staff experience
9. Staff shift requests
10. Manager/Staff role boundaries
11. Localization JA/EN
12. Runtime Console/Network
13. Performance/perceived performance
14. Loading/feedback
15. Responsive/mobile critical smoke
16. Data hygiene/rollback
17. Targeted regression after fixes

For each functional area, verify (where supported by the feature): read,
create, edit, validation, delete/deactivate/archive, confirmation/cancel,
refresh persistence, rollback, error behavior, loading state. Do not require
an unsupported CRUD operation just because CRUD exists conceptually elsewhere.

## 10. Defect and evidence standard

Evidence levels: `LIVE VERIFIED`, `STATIC VERIFIED`, `MEASURED`,
`HYPOTHESIS`, `NOT VERIFIED`. Never present static evidence as live
acceptance.

Every confirmed defect must include: ID, module, severity, exact
reproduction, expected, actual, evidence, Console/Network evidence if
relevant, fixture/data involved, rollback status, release impact.

Severity:
- **P0** — security boundary, tenant leak, auth bypass, serious data
  corruption/loss, secret exposure.
- **P1** — core workflow broken or severe product blocker.
- **P2** — significant UX/performance/error-handling problem but usable.
- **P3** — polish/backlog.

Do not inflate severity.

## 11. Improvement classification

Every finding falls into exactly one category:

- **A. Release fix** — confirmed defect required before current release/freeze.
- **B. Approved product/UX improvement** — measured, high-value, worth doing now.
- **C. Next version/backlog** — useful but not required to close current release.
- **D. Keep current implementation** — current solution is already appropriate.

Do not mix bugs and wishlist items.

## 12. Claude Code operating rules

- Recover repository state first (branch, HEAD, working tree, remote
  relationship) before planning implementation.
- Preserve unrelated/untracked files.
- Use a feature branch for meaningful changes.
- Investigate before implementing when root cause is not proven.
- Keep scope narrow; avoid unrelated refactors.
- Add/update tests for behavior changes.
- Run actual repository scripts — typecheck, lint, tests, build, and other
  relevant verification — rather than assuming they pass.
- Inspect the diff before commit.
- Never fabricate test results.
- Do not merge unless explicitly authorized.
- For risky DB/auth/security changes: plan and get review first;
  implementation only after approval.

## 13. ChatGPT Work / Browser QA rules

This role is primarily for live browser acceptance, independent QA, UX
analysis, performance observation, evidence collection, and product
benchmarking. It must not fix code during an acceptance run.

It must distinguish, explicitly, between: Facts, Observations, Hypotheses,
Recommendations.

If Work/session limits are approaching, STOP before context is lost and
produce a complete handoff containing: completed tests; PASS/FAIL/BLOCKED;
confirmed defects; fixtures; rollback state; browser/auth state; exact next
test; tests not to repeat.

## 14. Required output for a full Cafe acceptance

A full acceptance report must end with:

1. Executive result
2. Coverage matrix
3. Confirmed release defects
4. Approved improvements
5. Deferred/backlog
6. Performance measurements
7. Runtime findings
8. Test-data/rollback report
9. Exact remediation specification
10. Remediation order
11. Targeted regression plan

Status wording must distinguish **Engineering PASS**, **Founder Technical
Freeze**, and **Commercial Release** — they are not synonyms.

## 15. Definition of done for an AI task

A task is not done because code was written. It is done when, as applicable:

- Requested behavior exists.
- Tests pass.
- Security boundaries remain intact.
- No unrelated changes were made.
- Evidence is recorded.
- Rollback/cleanup is handled.
- Required manual/live verification is explicitly identified (not silently
  skipped).
- Remaining uncertainty is stated honestly.
