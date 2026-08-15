# STAFF_AUTH_CLEAN_BRANCH_REPORT (2026-08-14)

## 1. Current origin/dev SHA

`d372d41c3ff54070b215abd85b53006b81661250` — `Merge pull request #224 from tantik/fix/cafe-v2-1-manager-correction-panel-live-sync` (unchanged for the whole session; no new merges landed on `dev` while this work was in progress).

## 2. Two contaminating commit SHAs / messages

Both live on the (untouched, preserved) `fix/cafe-v2-1-manager-correction-panel-live-sync` branch, on top of the same PR #224 tip, pushed **after** that PR had already merged:

- `0cd5ecd4ce793cbf2132592a5906eeaa625bf7fb` — `fix(cafe): remove "Me" pseudo-name from Staff schedule, canonical self numbering` (2026-08-13 18:37:29 +0900)
- `a4c91ec50b2efa17f36a85747019b55a0e00be8d` — `feat(cafe): Staff-safe real coworker names via new roster view` (2026-08-13 19:40:56 +0900)

Confirmed via `git merge-base --is-ancestor <sha> origin/dev`: **neither is an ancestor of current `origin/dev`.**

## 3. Dependency audit result

**No functional/runtime dependency found.** Method: grepped the entire `af9ee8b` diff for every symbol the two commits introduce (`listWorkforceStaffRoster`, `WorkforceStaffRosterEntry`, `ApiWorkforceStaffRosterRow`, `ROSTER_SELECT`, `workforce_staff_roster`) and every Staff Auth migration/source file for the same — zero matches anywhere except one incidental textual one (§ below). Also cross-checked file-overlap: of the two commits' touched files, only two overlap with `af9ee8b`'s own file list (`supabase/tests/0006_api_has_permission.sql`, `supabase/tests/0008_workforce_staff_recipes_rls.sql`) — both are shared **test allowlist files**, not application code.

One **harmless textual context conflict** was found and predicted correctly before cherry-picking: `af9ee8b`'s diff to `supabase/tests/0006_api_has_permission.sql` appends its own allowlist entry (`'workforce_employee_invitations'`) immediately after the `'workforce_staff_roster'` entry that `a4c91ec` had added — pure line-adjacency in a shared array literal, not a code dependency. `supabase/tests/0008_...` overlapped by file but not by line range (a4c91ec's hunks were 40+ lines away from af9ee8b's), so it auto-merged with zero conflict.

**Empirical confirmation this was correctly diagnosed as non-dependency, not assumed:** the clean branch's `supabase db reset` applied migrations `...0060 → 0062 → 0063...` — migration `0061` (the roster view a4c91ec introduces) is **completely absent** from this branch, and every subsequent Staff Auth migration still applied without error. If `0062`+ had actually needed anything from `0061`, this reset would have failed loudly. It didn't.

## 4. Clean branch name / base SHA

`feat/cafe-v2-1-staff-auth-provisioning-clean`, created via `git checkout -b feat/cafe-v2-1-staff-auth-provisioning-clean origin/dev`. Base SHA: `d372d41c3ff54070b215abd85b53006b81661250` (identical to `origin/dev`, verified with `git rev-parse` on both immediately after creation).

The original `feat/cafe-v2-1-staff-auth-provisioning` branch (and the older `fix/cafe-v2-1-manager-correction-panel-live-sync`) were **not modified, deleted, rebased, or force-pushed** — both remain exactly as they were, preserved as recovery/reference.

## 5. Cherry-picked commits

- `git cherry-pick af9ee8b` → new SHA `7ea25f8` (same tree content as af9ee8b except the one resolved conflict, same 37 files, same commit message/date/author preserved by cherry-pick).
- `git cherry-pick 6f9ed12` → new SHA `e404282` (applied cleanly, zero conflicts, all 4 doc files identical).

## 6. Conflict status

One conflict, exactly as predicted in §3: `supabase/tests/0006_api_has_permission.sql`. Resolution applied (minimal, documented):

**Removed** (HEAD's side lost, correctly, since the referenced view doesn't exist on this branch):
```sql
-- Staff-safe coworker roster (0061_workforce_staff_roster_visibility.sql):
-- 1 new read-only view, added in a later, separate migration.
'workforce_staff_roster',
```

**Kept** (af9ee8b's own addition, unmodified):
```sql
'inventory_check_sessions', 'inventory_check_session_items',
-- Staff invitation facade (0065_workforce_employee_invitations_facade.sql):
-- 1 new view (SELECT + UPDATE, no new grant beyond 0064's own
-- anticipated authenticated grant), added in a later, separate migration.
'workforce_employee_invitations'
```

This is a negative-assertion allowlist (`table_name not in (...)`, asserting a count of 0 unexpected views) — an allowlisted name that doesn't correspond to an actual view causes no test failure either way, but leaving the stale `'workforce_staff_roster'` entry in would have been factually wrong documentation for a branch that doesn't contain that view. Removing it is the accurate resolution. No other file required manual resolution; `employees.ts`, `employees.test.ts`, and `supabase/tests/0008_...` all auto-merged cleanly with zero manual intervention.

## 7. Exact diff vs origin/dev

`git diff origin/dev...HEAD --stat` → **41 files changed, 4325 insertions(+), 8 deletions(-)** (37 from the code commit + 4 from the docs commit). Re-verified against the **pushed remote** state too: `git diff origin/dev...origin/feat/cafe-v2-1-staff-auth-provisioning-clean --stat` gives an identical 41-file result, and GitHub's own PR API (`gh pr view 225 --json files`) independently reports `fileCount: 41` — three independent confirmations of the same scope.

## 8. Confirmation unrelated commits are absent

`git diff origin/dev...HEAD --stat | grep -iE "roster|preview-staff-schedule|staff-schedule-actions|test-helpers|mame-to-cha/page|staff-view|i18n.staff"` → **zero matches.** None of `0cd5ecd`'s or `a4c91ec`'s files (`i18n.staff.ts`, `preview-staff-schedule.tsx`/`.test.ts`, `staff-schedule-actions.ts`, `staff-view.tsx`, `mame-to-cha/page.tsx`, `test-helpers.ts`, migration `0061`) appear anywhere in this branch's diff against `dev`.

## 9. DB reset result

`pnpm exec supabase db reset` → **exit 0.** Migration sequence applied: `...0059 → 0060 → 0062 → 0063 → 0064 → 0065 → 0066 → 0067` — `0061` genuinely absent, confirming §3's dependency-audit conclusion empirically, not just by static analysis.

## 10. pgTAP result / count

`Files=34, Tests=802, Result: PASS`. (One fewer file, 14 fewer tests, than the contaminated branch's `35/816` — the missing file is `0029_workforce_staff_roster_visibility.sql`, which belongs to the excluded roster feature and correctly does not exist on this branch. All Staff Auth test files — `0030`–`0035` — present and passing.)

## 11. Concurrency result

`packages/db/scripts/staff-auth-concurrency-check.ts` run fresh against the clean base's freshly-reset DB: **all invariants held**, all 4 scenario-runs (A, B, C×2 dispatch orders) — identical outcome pattern to every prior run on the contaminated branch (accept wins the accept/accept race nondeterministically call-1-or-call-2; invite/invite loser fails with `23505`; accept consistently wins accept/revoke in this environment, revoke always loses cleanly with 0 rows affected). No regression, no new failure mode introduced by rebasing onto the clean base.

## 12. Web tests result / count

`tests 984, pass 984, fail 0`. (7 fewer than the contaminated branch's 991 — the difference is entirely `a4c91ec`'s own new/expanded tests for the roster feature, e.g. in `preview-staff-schedule.test.ts`, which correctly don't exist on this branch. All 9 Staff Auth invitation tests — `listWorkforceEmployeeInvitations`, `listMyPendingWorkforceInvitations`, `revokeWorkforceEmployeeInvitation`, `acceptWorkforceEmployeeInvitation`, `inviteOrResendWorkforceEmployee` and their sub-cases — present and passing, individually confirmed by name.)

## 13. Typecheck

`pnpm --filter @line-os/web typecheck` → exit 0, clean. `pnpm --filter @line-os/db typecheck` → exit 0, clean (covers the concurrency script).

## 14. Lint

`pnpm --filter @line-os/web lint` → exit 0, clean. `pnpm --filter @line-os/db lint` → exit 0, clean.

## 15. Build

`pnpm --filter @line-os/web build` → succeeded, `/auth/accept-invite` and `/auth/accept-invite/set-password` present in the route manifest, no warnings.

## 16. Secret / scope audit

- `git status --porcelain` (post-cherry-pick): only the pre-existing unrelated cluster (19 entries) remains untracked — identical set to every prior report, `-`, `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`, `docs/AI_PLAYBOOK.md`, `docs/QA_ACCESS.md`, `docs/architecture/engineering-decisions.md`, 9 `docs/product/cafe-*.md` files, `icon/`, `packages/db/src/types.generated.ts`, `supabase/migrations/0060_...`, `supabase/tests/0028_...`.
- `git check-ignore -v supabase/functions/.env` → still `.gitignore:15:.env` (ignored).
- `git log --all --oneline -- supabase/functions/.env` → empty (never committed, any branch, any time).
- `git log --all --oneline -- packages/db/src/types.generated.ts` → empty (never committed).
- `git diff origin/dev...HEAD | grep` for the specific smoke-test secrets used during earlier live verification (generated PII key, smoke passwords, `SUPABASE_SERVICE_ROLE_KEY=`) → zero matches.
- Migration integrity: `git diff origin/dev...HEAD --stat -- supabase/migrations` shows `6 files changed, 856 insertions(+)` — **zero deletions, zero modifications** to any pre-existing migration; all six (`0062`–`0067`) are pure new-file additions.

**Result: clean** on every axis.

## 17. Push result

```
* [new branch]      feat/cafe-v2-1-staff-auth-provisioning-clean -> feat/cafe-v2-1-staff-auth-provisioning-clean
branch 'feat/cafe-v2-1-staff-auth-provisioning-clean' set up to track 'origin/feat/cafe-v2-1-staff-auth-provisioning-clean'.
```
Succeeded. The original `feat/cafe-v2-1-staff-auth-provisioning` branch was **not** deleted or force-pushed, and was not pushed again this session — it remains on `origin` exactly as left in the prior session, preserved as instructed.

## 18. PR number / URL

**#225** — https://github.com/tantik/line-business-os/pull/225 (base `dev`, head `feat/cafe-v2-1-staff-auth-provisioning-clean`). Verified via `gh pr view 225 --json` before treating it as confirmed: `baseRefName: "dev"`, `headRefName: "feat/cafe-v2-1-staff-auth-provisioning-clean"`, `fileCount: 41` — matching §7's local computation exactly. PR base was **not guessed**: confirmed by `gh pr list --state merged` showing every recent `fix/cafe-v2-1-*`/`feat/*` PR (including PR #224, the direct ancestor of this work) targets `dev`.

## 19. CI status

All required checks **passed**:
```
typecheck / test / build / lint    pass   1m45s
Vercel                             pass   (Deployment has completed)
Vercel Preview Comments            pass
```
The GitHub Actions job's own step log confirms each sub-step individually: Typecheck ✓, Test ✓, Build ✓, Verify preview server actions ✓, Lint ✓. This is the repo's real CI, running against the actual pushed branch — not a re-statement of local results.

Note on Vercel: the "Vercel" and "Vercel Preview Comments" checks are this repository's own standard, pre-existing automatic PR-preview-deploy integration (visible on every other PR in this repo's history, e.g. PR #224) — it fires automatically whenever any PR is opened, and was not separately triggered, configured, or interacted with beyond opening the PR itself as explicitly authorized. No Supabase Preview command, Edge Function deploy, or cloud migration was run by this session at any point — Vercel's app-preview deploy is unrelated to and does not touch the Supabase Preview project.

## 20. Exact remaining untracked files, classified

Unchanged from every prior report, re-verified on this branch:

**PRE_EXISTING_UNRELATED_DO_NOT_TOUCH** (19, all confirmed by filesystem mtime predating this entire task):
```
-
ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md
docs/AI_PLAYBOOK.md
docs/QA_ACCESS.md
docs/architecture/engineering-decisions.md
docs/product/cafe-audit-commercial-weakness-template.md
docs/product/cafe-audit-competitive-comparison-template.md
docs/product/cafe-audit-demo-readiness-checklist.md
docs/product/cafe-audit-feature-value-matrix.md
docs/product/cafe-audit-product-audit.md
docs/product/cafe-audit-production-factory-checklist.md
docs/product/cafe-audit-sales-readiness-checklist.md
docs/product/cafe-audit-world-competitive-research-plan.md
docs/product/cafe-commercial-competitive-audit-plan.md
docs/product/cafe-product-principles.md
docs/product/cafe-v2-2-candidate-backlog.md
icon/
packages/db/src/types.generated.ts   (stale — see note below, unchanged from prior reports)
supabase/migrations/0060_workforce_recipe_tenant_wide_update_fix.sql
supabase/tests/0028_workforce_recipe_tenant_wide_update.sql
```
Plus, new this pass: `docs/ai/STAFF_AUTH_GIT_COMMIT_PUSH_REPORT_2026-08-14.md` is now untracked in the working tree (it documents the now-superseded contaminated-branch commit/push — it was never committed on that branch either, since that step ended at "STOP" before any further action). It has not been added to any commit; classified **STAFF_AUTH_DOCUMENTATION**, left uncommitted per your instruction not to broaden either commit's scope. This report (`STAFF_AUTH_CLEAN_BRANCH_REPORT_2026-08-14.md`) is likewise not yet committed anywhere.

**`packages/db/src/types.generated.ts`**: remains untouched and uncommitted, exactly as instructed. Known technical debt, unchanged from the prior two reports — still stale relative to `0065`–`0067`, still does not block anything (nothing in the committed code imports from it for the new objects).

## 21. Recommendation

**`READY_FOR_PREVIEW_PREPARATION`**

Basis: the clean branch's diff against `origin/dev` is verified, three ways over, to contain exactly the 41 Staff Auth files and nothing else; the dependency audit found zero functional coupling to the excluded commits and this was empirically proven (not just argued) by a successful `db reset` with migration `0061` genuinely missing; every local gate was rerun from scratch on the clean base and passed (pgTAP 802/802, concurrency 4/4 scenario-runs clean, web tests 984/984, typecheck/lint clean ×2, build succeeds); real CI on the actual PR passed end-to-end; the secret/scope audit is clean; the unrelated cluster and `types.generated.ts` remain untouched; no historical migration was modified.

"Preparation" (not "ready to deploy") because Preview itself — the actual Supabase Preview project migration, Edge Function deployment, and Preview secrets setup — has still never been touched or attempted, per every instruction in this session and the two before it. That remains a distinct, separately-authorized next step (see the prior local-implementation report's §27 for the itemized list of what that would require).

PR #225 is open, green, and unmerged, awaiting your review and merge decision.

Nothing merged. Preview untouched. Production untouched. Edge Function not deployed. No cloud migration run. Stopping here.
