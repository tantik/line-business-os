# STAFF_AUTH_GIT_COMMIT_PUSH_REPORT (2026-08-14)

## 1. New branch name

`feat/cafe-v2-1-staff-auth-provisioning`, created via `git checkout -b feat/cafe-v2-1-staff-auth-provisioning a4c91ec50b2efa17f36a85747019b55a0e00be8d` (a pointer-creation operation only — the working tree was preserved exactly; no stash/reset/checkout-of-files occurred). Post-creation verification confirmed all 57 pre-existing `git status` entries (13 modified + 44 untracked) were still present, unchanged, immediately after the switch.

## 2. Branch base SHA

`a4c91ec50b2efa17f36a85747019b55a0e00be8d` — `feat(cafe): Staff-safe real coworker names via new roster view` (unchanged; this is the same HEAD the old branch `fix/cafe-v2-1-manager-correction-panel-live-sync` still points to).

## 3. Commit 1 — SHA / message / files

**SHA:** `af9ee8b`

**Message:**
```
feat(workforce): Staff Auth Provisioning — invitation-based Staff app access

Adds the full Staff invitation lifecycle for Cafe v2.1: security-hardening
(deactivated-employee write lockout, one-Auth-user-per-tenant uniqueness),
an invitation domain model with atomic accept/upsert RPCs, the
invite-employee Edge Function (the only service_role-holding code in this
repo, scoped to exactly two Supabase Auth Admin API calls), Manager
invite/resend/revoke UI, new-user password-setup flow, and an
existing-user in-app pending-invitation banner. Concurrency-verified
against real Postgres locking (accept+accept, invite+invite,
accept+revoke) with no defect found. Local gates green: pgTAP 816/816,
apps/web tests 991/991, typecheck/lint clean, build succeeds.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

**Files (37 — exact match to `git add`'s explicit path list, `git diff --cached --stat` inspected before committing):**
13 modified (`apps/web/package.json`, `manager-dashboard-client.tsx`, `manager/page.tsx`, `(protected)/layout.tsx`, `employees.test.ts`, `employees.ts`, `packages/db/package.json`, `supabase/config.toml`, `supabase/tests/0002/0006/0008/0009/0013`) + 24 new (`invitation-cell.tsx`, `auth/accept-invite/route.ts` + `set-password/page.tsx` + `SetPasswordForm.tsx`, `AcceptInvitationButton.tsx`, `PendingInvitationBanner.tsx`, `invitation-actions.ts`, `invitations.test.ts`, `invitations.ts`, `staff-auth-concurrency-check.ts`, `supabase/functions/invite-employee/index.ts`, `supabase/functions/.env.example`, migrations `0062`–`0067`, tests `0030`–`0035`).

**Correction to the prior preparation report:** that report's own summary line said "13 modified + 23 new = 36 files"; the actual explicit file list it provided (which is what was used verbatim for staging) contains 24 new files, i.e. 37 total — an arithmetic slip in that report's prose, not a staging discrepancy. Verified: the file list actually used matches this commit's contents exactly, file-for-file.

## 4. Commit 2 — SHA / message / files

**SHA:** `6f9ed12`

**Message:**
```
docs(ai): record Staff Auth Provisioning implementation reports

Handoff, local implementation report, final local concurrency/i18n gate,
and this Git-preparation report for the Staff Auth Provisioning feature
(supabase/migrations/0062-0067 + apps/web invitation flow). Preview/
Production were never touched; nothing has been pushed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

**Files (4, exact match):**
```
docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md
docs/ai/STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT_2026-08-14.md
docs/ai/STAFF_AUTH_PROVISIONING_FINAL_LOCAL_GATE_2026-08-14.md
docs/ai/STAFF_AUTH_GIT_PREPARATION_REPORT_2026-08-14.md
```

## 5. Post-commit `git status`

```
## feat/cafe-v2-1-staff-auth-provisioning...origin/feat/cafe-v2-1-staff-auth-provisioning
?? -
?? ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md
?? docs/AI_PLAYBOOK.md
?? docs/QA_ACCESS.md
?? docs/architecture/engineering-decisions.md
?? docs/product/cafe-audit-*.md (7 files), cafe-commercial-competitive-audit-plan.md,
   cafe-product-principles.md, cafe-v2-2-candidate-backlog.md
?? icon/
?? packages/db/src/types.generated.ts
?? supabase/migrations/0060_workforce_recipe_tenant_wide_update_fix.sql
?? supabase/tests/0028_workforce_recipe_tenant_wide_update.sql
```
Working tree is clean of every Staff Auth file (all committed); only the pre-existing unrelated cluster remains untracked, exactly as before.

## 6. Unrelated cluster — confirmed untouched

Every entry in §5's remaining list is identical, byte-for-byte in *listing* (not re-hashed, but unchanged in `git status` classification and never staged/added/committed at any point in this session) to the set documented in the two prior reports. None of these 19 entries appear in either commit (`git show --stat` for both commits, §3/§4, contains zero matches). None were read, edited, or moved.

## 7. Secret audit result

**PASS.**
- `git check-ignore -v supabase/functions/.env` → `.gitignore:15:.env` (still ignored, post-commit).
- `git log --all --oneline -- supabase/functions/.env` → empty (never committed, on any branch).
- `git log --all --oneline -- packages/db/src/types.generated.ts` → empty (never committed).
- `git show af9ee8b 6f9ed12 | grep` for the specific throwaway smoke-test values used during earlier live verification (a generated PII key, two smoke-test passwords, `SUPABASE_SERVICE_ROLE_KEY=`) → zero matches in either commit's diff.
- `git show af9ee8b -- apps/web | grep "SUPABASE_SERVICE_ROLE_KEY|createServiceClient"` → zero matches (confirms the committed `apps/web` diff itself, not just the pre-commit working tree, holds the service_role boundary).

## 8. Push result

```
* [new branch]      feat/cafe-v2-1-staff-auth-provisioning -> feat/cafe-v2-1-staff-auth-provisioning
branch 'feat/cafe-v2-1-staff-auth-provisioning' set up to track 'origin/feat/cafe-v2-1-staff-auth-provisioning'.
```
Succeeded. The old branch (`fix/cafe-v2-1-manager-correction-panel-live-sync`) was **not** pushed or otherwise touched this session.

## 9. PR — not created; ambiguity found, reported instead of guessed

Per your instruction ("Do not guess the PR base... if ambiguous, stop after push and report"), I checked the convention empirically (`gh pr list --state merged`) rather than assuming: **every recent `fix/cafe-v2-1-*` PR targets `dev`**, including PR #224 (head = `fix/cafe-v2-1-manager-correction-panel-live-sync`, the branch we branched from), merged 2026-08-13T08:32:11Z UTC. So the **branch-name convention** (`dev` as base) is unambiguous by itself.

However, a **different, more important ambiguity** surfaced while confirming this, and is why no PR was opened:

`fix/cafe-v2-1-manager-correction-panel-live-sync` had **two more commits pushed to it AFTER PR #224 was merged**:
- `87ddebe` (17:26:47 JST) — the tip that was actually merged as PR #224. **Already in `origin/dev`.**
- `0cd5ecd` (18:37:29 JST) — pushed after the merge. **NOT in `origin/dev`.**
- `a4c91ec` (19:40:56 JST) — our branch's base commit. **NOT in `origin/dev`.**

This means `feat/cafe-v2-1-staff-auth-provisioning` — built on `a4c91ec` per the Founder's explicit instruction — carries **two unrelated, not-yet-merged commits** ("remove Me pseudo-name / canonical self numbering" and "Staff-safe real coworker names via new roster view") as ancestors that are not yet part of `dev`. Opening a PR from this branch straight to `dev` right now would show a diff containing those two unrelated commits' changes mixed in with the Staff Auth work — exactly the scope-contamination problem the dedicated-branch decision was meant to avoid, just one layer deeper (in the branch's inherited history rather than its own new commits).

**This was not guessed past — reporting it now, PR not opened.** Two ways to resolve it, for you to choose (neither executed):
1. Open a PR for `fix/cafe-v2-1-manager-correction-panel-live-sync` (or whatever those 2 pending commits should become) first, get **that** merged into `dev`, then a PR from `feat/cafe-v2-1-staff-auth-provisioning` → `dev` would show a clean, Staff-Auth-only diff (git would only show commits not already in `dev`).
2. Open the Staff Auth PR now with an explicit note in the PR description that the diff also contains those 2 pre-existing, already-reviewed-elsewhere-pending commits, so reviewers aren't confused — less clean, but unblocks review immediately if the other branch's merge is expected to lag.

## 10. CI status / checks

No CI run exists for this branch yet, and **none will trigger from the push alone** — confirmed by reading `.github/workflows/ci.yml` directly rather than assuming: it triggers on `pull_request` (any) and on `push` to `dev` or `feature/**` only. This branch is `feat/cafe-v2-1-staff-auth-provisioning` (singular `feat/`, not `feature/`) — it does not match either push trigger. `gh run list --branch feat/cafe-v2-1-staff-auth-provisioning` returned empty, consistent with this. CI will only run once a PR is opened (§9) or if a maintainer manually dispatches it.

## 11. Failures or warnings

None functional. Cosmetic-only: `git add`/`git commit` emitted `warning: ... LF will be replaced by CRLF the next time Git touches it` for every new file (this repo's `.gitattributes`/Windows checkout config normalizes line endings on Windows) — expected, harmless, not an error.

## 12. Known stale generated-types note

`packages/db/src/types.generated.ts` remains **untouched and uncommitted**, exactly as instructed — confirmed never in either commit (§7) and still present as an untracked file in the working tree (§5). It is stale relative to migrations 0065–0067 (missing the new `api.workforce_employee_invitations` view, `api.upsert_employee_invitation`/`api.has_permission_in_tenant` RPC signatures, `api.workforce_staff_manage.has_account_access`). This is recorded here as **known technical debt only** — nothing in the committed Staff Auth code imports from this file for those new objects, so it does not block anything.

## 13. Exact current repository state

- Branch: `feat/cafe-v2-1-staff-auth-provisioning`, HEAD `6f9ed12` (docs commit), tracking `origin/feat/cafe-v2-1-staff-auth-provisioning` (in sync, 0 ahead/0 behind).
- `git log --oneline -3`: `6f9ed12 docs(ai): record...` → `af9ee8b feat(workforce): Staff Auth Provisioning...` → `a4c91ec feat(cafe): Staff-safe real coworker names...` (unchanged base).
- Old branch `fix/cafe-v2-1-manager-correction-panel-live-sync`: untouched, still at `a4c91ec`, still in sync with its own `origin` copy — not renamed, not deleted, not pushed to again.
- Working tree: only the pre-existing unrelated cluster remains untracked (§5/§6); no staged changes; `git status` clean otherwise.
- Preview: untouched (no `supabase db push`, no `supabase link`, no cloud command run).
- Production: untouched.
- No merge was performed. No PR was opened or merged.

## 14. Recommendation

**`STOP_AND_FIX`** — not because anything committed or pushed is unsafe (the commits, secret audit, and unrelated-cluster isolation are all clean, §3–§7), but because of the **branch-history ambiguity in §9**: this branch's own base carries 2 unrelated, unmerged commits that would contaminate a Staff-Auth-scoped PR diff into `dev` if opened right now. Recommend resolving §9's two options (merge the pending schedule-identity/roster-naming work into `dev` first, or explicitly scope the PR description to note the extra commits) before opening the PR — a quick Founder call, not further engineering work.

Nothing merged. Nothing deployed. Preview/Production untouched. Stopping here for your review.
