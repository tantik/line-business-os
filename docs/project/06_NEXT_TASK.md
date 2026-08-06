# ORUWA Next Task

Status: **Active - evidence closure**

Exactly one task: **Close remaining Cafe Package v2.1 acceptance gates.**

<!-- AUTO:NEXT_TASK:START -->
## Automated continuation

- Updated: 2026-08-06 14:10:51 +09:00.
- Significant event: **StageTransition** - PR #191 merged: Cafe v2.1 Preview evidence reconciled and S2 role gate passed.
- Evidence: GitHub PR #191; merge commit 1bb58c3; CI and Vercel PASS; canonical Manager direct Staff URL failed closed with no-profile screen and zero console errors.
- Next task: **Establish a separate authenticated Staff Preview session and execute the blocked Staff/role gates; record the Founder decision for P1-4 before Cafe Freeze**

Reverify Git and the linked task-specific sources before implementation. This block never authorizes production, database, security, billing, messaging, or destructive actions.
<!-- AUTO:NEXT_TASK:END -->

## Repository starting point

- Base: latest `origin/dev` (verified `c078aa83ca121e0edee54f0e79d9c22adb1edb11` on 2026-08-06).
- Current checked-out branch is the already-merged PR #186 head and must not be treated as a fresh implementation branch.
- Reverify branch, status, log, HEAD, and `origin/dev` before acting.

## Read first

- [Cafe v2.1 acceptance report](../product/cafe-package-v2-1-acceptance-report.md).
- [Product Review](../product/cafe-package-v2-1-product-review.md).
- [Architecture Review](../architecture/cafe-package-v2-1-architecture-review.md).
- [OAES profile](../ai/oaes-project-profile.md).

## Required work

1. Reconcile every acceptance row as PASS, FAIL, BLOCKED, or N/A with current evidence.
2. Run isolated authenticated Staff acceptance and Manager/Staff role checks.
3. Complete critical Manager, Staff, Recipes, and Inventory regression smoke.
4. Complete missing Recipes/Staff performance observations without presenting browser timing as DB/server profiling.
5. Verify the schedule-publish confirmation when a safe draft fixture exists, or retain BLOCKED.
6. Present the P1-4 audit-logging options and obtain a Founder decision.
7. Update the acceptance report and stale [`docs/ai/current-task.md`](../ai/current-task.md) in a separately reviewed documentation/evidence change.
8. Run the applicable full gate before declaring readiness; record Founder Freeze acceptance separately.

## Exclusions

- Do not start Cafe v2.2, Commercial Release, Platform Foundation implementation, or new product research.
- Do not stage existing untracked research, handoff, or generated files.
- Do not perform production/Cloud data writes, migrations, RLS, auth, secrets, billing, or destructive actions without the required explicit approval.

## Definition of done

- Acceptance report is current, internally consistent, and evidence-linked.
- Required local checks and authenticated role-isolated Preview checks are recorded truthfully.
- Every remaining gap is closed or explicitly BLOCKED with owner and next action.
- Audit decision is recorded in its proper source.
- Founder acceptance is explicit; technical PASS is not called Commercial Release.
- Only scoped files enter any future commit.

After PASS: create a narrow documentation/evidence commit and PR to `dev`, verify CI/deployment as applicable, then perform a short post-merge authenticated smoke. Do not begin v2.2 automatically.
