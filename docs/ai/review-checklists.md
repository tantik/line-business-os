# Review checklists

Per-lens focus areas and reject-criteria, plus evidence/severity standards,
for use alongside `docs/ai/oaes-project-profile.md` "Roles are review
lenses" and `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §11 (QA model).
This document adds detail those two intentionally keep terse; it does not
restate their content and does not define a new role/authority model —
`ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §2 owns that.

Use only the lenses relevant to a given change. Database work always
requires Security + Database/RLS. Customer-facing Cafe UI always requires
Frontend/UX + QA (`oaes-project-profile.md`).

## Product Manager lens

Focus: Japanese SMB usefulness, MVP value, onboarding friction, customer
trust, monetization path, operational/support burden, priority vs. effort.

Reject or challenge: features with unclear customer value; complexity that
delays MVP; work that does not support pilot-customer readiness.

## CTO / Architect lens

Focus: single multi-tenant SaaS fit, tenant isolation, modular product
design, cost control, long-term maintainability, practical MVP scope,
scaling toward 300+ tenants.

Reject or challenge: a separate project per customer; customer-specific
forks without strong reason; over-engineered infrastructure too early;
architecture that blocks tenant isolation; unclear production/Cloud impact.

## Security lens

Focus: no `service_role` in frontend; no secrets/tokens/PII in logs, docs,
or CLI output; no unsafe admin flow; no tenant-isolation bypass; no
uncontrolled privileged action.

Reject or challenge: `service_role` usage in app/frontend code; printing
secrets or raw customer identifiers; uncontrolled Cloud writes; mass actions
without confirmation; missing audit trail for a sensitive operation.

## Database / RLS lens

Focus: `tenant_id` on tenant-scoped tables, `location_id` where physical
locations matter, RLS enabled and correct, safe `api`-facade design, no
accidental internal-schema exposure, migration rollback, pgTAP coverage.

Reject or challenge: a business table without `tenant_id` where tenant scope
is required; an RLS bypass without strong justification; destructive SQL
without explicit approval; a migration without a rollback plan; a Cloud/prod
DB change without approval.

## Frontend / UX lens

Focus: no secrets/`service_role` on frontend; safe confirmation UX for
destructive actions; Japanese localization readiness; tenant/location
context clarity; accessibility and mobile usability; visible pending/loading
state for any real wait; explicit empty/error states, not a blank screen.

Reject or challenge: frontend privileged-key exposure; unclear tenant
selection; a destructive action with no confirmation step; a UI that can
cause accidental customer impact.

## QA lens

Focus: test coverage, manual verification steps, edge cases, regression
risk, CI expectations, documentation consistency.

Reject or challenge: missing validation for risky behavior; no regression
check; a PR without enough verification evidence.

Evidence levels (canonical definition:
`ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §6 — VERIFIED / INFERRED / UNKNOWN
/ NOT TESTED). For product/QA acceptance reporting specifically, the
following related vocabulary remains useful and is not redundant with §6:
`LIVE VERIFIED`, `STATIC VERIFIED`, `MEASURED`, `HYPOTHESIS`, `NOT VERIFIED`.
Never present static evidence as live acceptance.

Defect severity:
- **P0** — security boundary, tenant leak, auth bypass, serious data
  corruption/loss, secret exposure.
- **P1** — core workflow broken or severe product blocker.
- **P2** — significant UX/performance/error-handling problem but usable.
- **P3** — polish/backlog.

Do not inflate severity.

Every confirmed defect should record: ID, module, severity, exact
reproduction, expected, actual, evidence, Console/Network evidence if
relevant, fixture/data involved, rollback status, release impact.

Improvement classification — every finding falls into exactly one:
- **A. Release fix** — confirmed defect required before current release/freeze.
- **B. Approved product/UX improvement** — measured, high-value, worth doing now.
- **C. Next version/backlog** — useful but not required to close current release.
- **D. Keep current implementation** — current solution is already appropriate.

Do not mix bugs and wishlist items.

## Release / merge-readiness lens

Focus: scope match, diff review, validation evidence, security constraints,
tenant-isolation impact, docs consistency, CI status.

Reject or challenge: unreviewed risky changes; missing validation; a mismatch
between PR scope and actual diff; a dirty working tree; failing checks;
unclear Cloud/prod impact.

CI green means the code passed automated checks — it does not by itself
prove security, tenant isolation, privacy, or product correctness.

## Founder Acceptance order (for a full Cafe acceptance pass)

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

For each functional area, verify (where the feature supports it): read,
create, edit, validation, delete/deactivate/archive, confirmation/cancel,
refresh persistence, rollback, error behavior, loading state. Do not require
an unsupported CRUD operation just because CRUD exists conceptually
elsewhere.

Status wording must distinguish **Engineering PASS**, **Founder Technical
Freeze**, and **Commercial Release** — they are not synonyms.

## Illustrative example: what counts as a specific approval

Bad: `Do it.`

Good: `Approved to run this local-only migration test against local Supabase
only. Do not touch Cloud or production.`

Approval is specific and narrow — approval for one action does not authorize
the next gate (`ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §9).
