# STAFF_AUTH_GIT_PREPARATION_REPORT (2026-08-14)

Read-only preparation pass. **Nothing has been staged, committed, or pushed.** No branch was created, renamed, or switched.

## 1. Current branch / HEAD

- Branch: `fix/cafe-v2-1-manager-correction-panel-live-sync`
- HEAD: `a4c91ec50b2efa17f36a85747019b55a0e00be8d` — `feat(cafe): Staff-safe real coworker names via new roster view`
- In sync with `origin/fix/cafe-v2-1-manager-correction-panel-live-sync` (same SHA, not ahead/behind).
- `git merge-base --is-ancestor a4c91ec origin/main` → **not yet in `main`** (confirmed empirically, not assumed).
- Branch's own last 3 commits (`a4c91ec`, `0cd5ecd`, `87ddebe`) are all about **Staff schedule identity / live-sync / roster naming** — a different, already-scoped feature from Staff Auth Provisioning. This branch is one of ~90 single-purpose `fix/cafe-v2-1-*` branches in this repo's history, each merged via its own dedicated PR (`git branch -vv` shows the convention clearly: one feature, one branch, one PR, almost always squash-merged to one commit in `main`'s log).

**⚠ This is a real branch-scope problem — see §5.**

## 2. Actual Git state (verified directly, not from the reports)

`git status --porcelain`, `git diff --stat`, and full `git diff` were run and read in full for every modified tracked file. Every untracked file/directory was enumerated. Results are folded into §3.

## 3. File classification (verified against the actual diff/filesystem, not the reports)

### A. STAFF_AUTH_REQUIRED

**Modified (tracked) — diff content verified, all small/additive:**
```
apps/web/package.json                                                        (+1 line: registers invitations.test.ts)
apps/web/src/app/(protected)/dashboard/workforce/manager/manager-dashboard-client.tsx  (+28/-1: Access column + invitation cell wiring)
apps/web/src/app/(protected)/dashboard/workforce/manager/page.tsx            (+4: fetch invitations, pass to client)
apps/web/src/app/(protected)/layout.tsx                                      (+8/-1: mounts PendingInvitationBanner)
apps/web/src/lib/workforce/employees.test.ts                                 (+3: has_account_access in 2 mocks)
apps/web/src/lib/workforce/employees.ts                                      (+6/-1: has_account_access field/select)
packages/db/package.json                                                     (+1: staff-auth-concurrency-check script)
supabase/config.toml                                                         (+12: [functions.invite-employee])
supabase/tests/0002_security_rls.sql                                         (+14: employee_invitations grant allowlist)
supabase/tests/0006_api_has_permission.sql                                   (+6/-1: workforce_employee_invitations view allowlist)
supabase/tests/0008_workforce_staff_recipes_rls.sql                          (+5: grant allowlist)
supabase/tests/0009_workforce_api_facade.sql                                 (+4/-1: employee_invitations table allowlist)
supabase/tests/0013_workforce_cafe_write_facade.sql                          (+8/-2: has_account_access column allowlist)
```
Verified: every diff is purely additive to an allowlist/wiring point, or a small new UI wire-up. **No assertion was weakened, no existing check removed.** (Full diffs for 0009 and 0013 — the two most allowlist-sensitive files — read in full this pass; both are append-only.)

**New (untracked) — exact files, not directories:**
```
apps/web/src/app/(protected)/dashboard/workforce/manager/invitation-cell.tsx
apps/web/src/app/auth/accept-invite/route.ts
apps/web/src/app/auth/accept-invite/set-password/page.tsx
apps/web/src/app/auth/accept-invite/set-password/SetPasswordForm.tsx
apps/web/src/components/workforce/AcceptInvitationButton.tsx
apps/web/src/components/workforce/PendingInvitationBanner.tsx
apps/web/src/lib/workforce/invitation-actions.ts
apps/web/src/lib/workforce/invitations.test.ts
apps/web/src/lib/workforce/invitations.ts
packages/db/scripts/staff-auth-concurrency-check.ts
supabase/functions/invite-employee/index.ts
supabase/functions/.env.example
supabase/migrations/0062_workforce_deactivated_employee_write_hardening.sql
supabase/migrations/0063_workforce_employee_user_tenant_uniqueness.sql
supabase/migrations/0064_workforce_employee_invitations.sql
supabase/migrations/0065_workforce_employee_invitations_facade.sql
supabase/migrations/0066_api_has_permission_in_tenant_facade.sql
supabase/migrations/0067_workforce_staff_manage_account_access.sql
supabase/tests/0030_workforce_deactivated_employee_write_hardening.sql
supabase/tests/0031_workforce_employee_user_tenant_uniqueness.sql
supabase/tests/0032_workforce_employee_invitations.sql
supabase/tests/0033_workforce_employee_invitations_facade.sql
supabase/tests/0034_api_has_permission_in_tenant_facade.sql
supabase/tests/0035_workforce_staff_manage_account_access.sql
```
Note: `supabase/functions/invite-employee/index.ts` and `supabase/functions/.env.example` are listed **individually**, not as `supabase/functions/`, because that directory also contains `supabase/functions/.env` (real local secret material) — see §6/§9 for why the directory itself must never be given to `git add`.

### B. STAFF_AUTH_DOCUMENTATION
```
docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md
docs/ai/STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT_2026-08-14.md
docs/ai/STAFF_AUTH_PROVISIONING_FINAL_LOCAL_GATE_2026-08-14.md
```
(This report, `STAFF_AUTH_GIT_PREPARATION_REPORT_2026-08-14.md`, is being written now and is not yet part of the working tree at the time of this classification — see §12.)

### C. PRE_EXISTING_UNRELATED_DO_NOT_TOUCH

Verified by **filesystem mtime**, not just by trusting the handoff doc's own claim:
```
-                                                              (mtime Aug 11 19:32 -- before this task existed)
ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md                (Aug 10 19:36)
docs/AI_PLAYBOOK.md                                            (Aug 10 19:36)
docs/QA_ACCESS.md                                               (Aug 10 19:36)
docs/architecture/engineering-decisions.md                     (Aug 10 19:36)
docs/product/cafe-audit-*.md, cafe-commercial-*.md,
  cafe-product-principles.md, cafe-v2-2-candidate-backlog.md   (all Aug 10 19:36, 9 files)
icon/ (4 files)                                                 (Aug 10 19:36)
packages/db/src/types.generated.ts                              (Aug 10 19:36 -- see §7 for the staleness consequence)
supabase/migrations/0060_workforce_recipe_tenant_wide_update_fix.sql   (untracked, pre-dates this task per the prior handoff)
supabase/tests/0028_workforce_recipe_tenant_wide_update.sql           (untracked, pre-dates this task per the prior handoff)
```
All confirmed with `ls -la` timestamps predating this session (and the prior Staff Auth session) by 2–4 days. None were modified, staged, or touched by any command run in this or the prior two sessions.

### D. SUSPICIOUS_REVIEW_REQUIRED

**None.** Every changed/untracked file resolves cleanly to A, B, or C above. No file with an unclear origin, unexpected binary content, or ambiguous purpose was found.

## 4. Migration numbering / historical-integrity check

- Sequence on disk: `...0059(tracked) → 0060(untracked, unrelated) → 0061(tracked) → 0062–0067(untracked, ours)`. No gap, no duplicate number, no collision.
- `git status --porcelain` shows **zero** files under `supabase/migrations/` in the `M` (modified) column — every migration touched by this feature is a brand-new file (`??`). **No historical migration was edited.**
- Cross-checked against both prior reports' own claims: consistent.

## 5. Branch safety determination — ⚠ meaningful scope problem found

**The Staff Auth Provisioning work should NOT be committed directly onto `fix/cafe-v2-1-manager-correction-panel-live-sync`.**

Reasoning:
- This repository's own history is unambiguous: one branch = one feature = one PR (dozens of `fix/cafe-v2-1-<specific-thing>` branches, each merged individually). `fix/cafe-v2-1-manager-correction-panel-live-sync`'s own HEAD and its 2 prior commits are about Manager/Staff schedule live-sync and roster naming — unrelated to Staff Auth Provisioning in subject matter.
- Staff Auth Provisioning is large (7 migrations, an Edge Function, new routes, new UI, ~35 new/changed test files) and security-sensitive (the first `service_role`-holding code in this repo, per the Founder's own decision 9). Bundling it into a branch/PR named after a different, already-possibly-in-review feature would make the PR title, diff scope, and review expectations all mismatched — a reviewer opening a PR called "manager correction panel live sync" would not expect to review a new Edge Function and Auth flow.
- If `fix/cafe-v2-1-manager-correction-panel-live-sync` already has an open PR upstream (likely, given it's pushed and in sync with `origin`), pushing this large unrelated addition would silently expand that PR's scope for anyone already reviewing it.

**Safest correction (not executed — flagged for Founder/your decision):**
1. From the current HEAD (`a4c91ec`, unchanged), create a **new** branch, e.g. `feat/cafe-v2-1-staff-auth-provisioning`.
2. Stage and commit the Staff Auth work there (commands in §9 work identically regardless of which branch is checked out).
3. Leave `fix/cafe-v2-1-manager-correction-panel-live-sync` exactly as it is now (already pushed, matching `origin`) so its own existing/future PR is untouched.

This is a **recommendation only** — no branch was created, switched, or renamed by this pass, per your explicit instruction.

## 6. Secret / staging-safety audit on the proposed file set

- `supabase/functions/.env` (real local key material) is **not** in either proposed file list in §9 — confirmed by re-reading §3's exact file lists line-by-line.
- `git check-ignore -v supabase/functions/.env` → `.gitignore:15:.env` (ignored). `git status --porcelain --ignored=matching -- supabase/functions/` shows it as `!!`.
- `supabase/functions/.env.example` (in the proposed list) contains only placeholder text (`replace-with-base64-32-byte-key`, `http://localhost:3000`) — read in full this pass, confirmed no real value.
- `supabase/functions/invite-employee/index.ts` (in the proposed list) — re-grepped this pass for `password|secret|SmokeTest|` + the specific throwaway key/ciphertext values used during live verification: only one match, a comment describing a security property ("No email/password/token is ever included..."), not a literal secret.
- `packages/db/scripts/staff-auth-concurrency-check.ts`'s default DB connection string (`postgres:postgres@127.0.0.1:54322`) is the publicly documented Supabase CLI local default, not a secret; the script itself refuses to run against any non-loopback host.
- No `.env`, `.env.local`, or any file matching `.gitignore`'s secret patterns appears anywhere in the proposed file lists.
- **Result: clean.** The proposed file set contains no credential, token, ciphertext, or QA password.

## 7. Generated-types stale-state note (informational, not a blocker)

`packages/db/src/types.generated.ts` remains on the do-not-touch list this pass, exactly as instructed — it was **not** read, regenerated, or modified. Consequence, stated plainly: it is now stale relative to 0065–0067 (missing the new `api.workforce_employee_invitations` view, `api.upsert_employee_invitation`/`api.has_permission_in_tenant` RPC signatures, and `api.workforce_staff_manage.has_account_access`). This is a DX/codegen-freshness gap only — nothing in the Staff Auth diff imports from this file for those new objects (the new `invitations.ts`/`employees.ts` code hand-types its own row shapes, matching this codebase's existing convention for every other `api` view). Regenerating it is a separate, low-risk, pure-codegen step (`gen:types` script) that a human can authorize independently whenever convenient — it is not gating this commit.

## 8. Commit structure decision

**Two commits**, matching this repository's own observed convention of separating feature commits from documentation/record-keeping commits (e.g. `docs(cafe): record Cafe v2.1 Founder Acceptance audit` as its own commit, distinct from the `fix(cafe): ...` commits carrying the actual change) — not an arbitrary split:

1. **Code commit** — all migrations, the Edge Function, apps/web wiring, and every test (pgTAP + apps/web + the concurrency script). This is the atomic, revertable, independently-buildable unit: reverting it alone fully removes the feature and leaves the tree in a working state (verified — nothing outside this file set depends on it, and nothing in this file set depends on anything outside it plus already-`main`-bound code).
2. **Docs commit** — the three narrative reports. Separating these means a future `git revert` of the code commit doesn't also delete the record of what was decided/verified and why, and mirrors this repo's own doc-commit precedent.

## 9. Exact staging commands (explicit paths only — no `git add .` / `-A`)

**Commit 1 — code:**
```
git add \
  "apps/web/package.json" \
  "apps/web/src/app/(protected)/dashboard/workforce/manager/manager-dashboard-client.tsx" \
  "apps/web/src/app/(protected)/dashboard/workforce/manager/page.tsx" \
  "apps/web/src/app/(protected)/layout.tsx" \
  "apps/web/src/lib/workforce/employees.test.ts" \
  "apps/web/src/lib/workforce/employees.ts" \
  "packages/db/package.json" \
  "supabase/config.toml" \
  "supabase/tests/0002_security_rls.sql" \
  "supabase/tests/0006_api_has_permission.sql" \
  "supabase/tests/0008_workforce_staff_recipes_rls.sql" \
  "supabase/tests/0009_workforce_api_facade.sql" \
  "supabase/tests/0013_workforce_cafe_write_facade.sql" \
  "apps/web/src/app/(protected)/dashboard/workforce/manager/invitation-cell.tsx" \
  "apps/web/src/app/auth/accept-invite/route.ts" \
  "apps/web/src/app/auth/accept-invite/set-password/page.tsx" \
  "apps/web/src/app/auth/accept-invite/set-password/SetPasswordForm.tsx" \
  "apps/web/src/components/workforce/AcceptInvitationButton.tsx" \
  "apps/web/src/components/workforce/PendingInvitationBanner.tsx" \
  "apps/web/src/lib/workforce/invitation-actions.ts" \
  "apps/web/src/lib/workforce/invitations.test.ts" \
  "apps/web/src/lib/workforce/invitations.ts" \
  "packages/db/scripts/staff-auth-concurrency-check.ts" \
  "supabase/functions/invite-employee/index.ts" \
  "supabase/functions/.env.example" \
  "supabase/migrations/0062_workforce_deactivated_employee_write_hardening.sql" \
  "supabase/migrations/0063_workforce_employee_user_tenant_uniqueness.sql" \
  "supabase/migrations/0064_workforce_employee_invitations.sql" \
  "supabase/migrations/0065_workforce_employee_invitations_facade.sql" \
  "supabase/migrations/0066_api_has_permission_in_tenant_facade.sql" \
  "supabase/migrations/0067_workforce_staff_manage_account_access.sql" \
  "supabase/tests/0030_workforce_deactivated_employee_write_hardening.sql" \
  "supabase/tests/0031_workforce_employee_user_tenant_uniqueness.sql" \
  "supabase/tests/0032_workforce_employee_invitations.sql" \
  "supabase/tests/0033_workforce_employee_invitations_facade.sql" \
  "supabase/tests/0034_api_has_permission_in_tenant_facade.sql" \
  "supabase/tests/0035_workforce_staff_manage_account_access.sql"
```

**Commit 2 — docs:**
```
git add \
  "docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md" \
  "docs/ai/STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT_2026-08-14.md" \
  "docs/ai/STAFF_AUTH_PROVISIONING_FINAL_LOCAL_GATE_2026-08-14.md" \
  "docs/ai/STAFF_AUTH_GIT_PREPARATION_REPORT_2026-08-14.md"
```

After each `git add`, run `git status` and `git diff --cached --stat` to confirm the staged set matches exactly before committing — no file outside the lists above should appear.

## 10. Exact commit messages

**Commit 1:**
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

**Commit 2:**
```
docs(ai): record Staff Auth Provisioning implementation reports

Handoff, local implementation report, final local concurrency/i18n gate,
and this Git-preparation report for the Staff Auth Provisioning feature
(supabase/migrations/0062-0067 + apps/web invitation flow). Preview/
Production were never touched; nothing has been pushed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## 11. Secret/staging-safety final check result

**PASS** — see §6 for full detail. No credential, service-role key, invitation token, QA password, `.env` content, ciphertext, or generated/build junk is present in either proposed file list.

## 12. On this report's own file

This report itself (`docs/ai/STAFF_AUTH_GIT_PREPARATION_REPORT_2026-08-14.md`) did not exist at the moment §2's `git status` was captured; it is being written now and is included in Commit 2's file list above as the natural fourth document. If you want it excluded from Commit 2 (e.g., to keep this specific preparation record out of history), simply drop its line from that `git add` command.

---

# STAFF_AUTH_GIT_PREPARATION_REPORT — summary

- **Current branch / HEAD:** `fix/cafe-v2-1-manager-correction-panel-live-sync` @ `a4c91ec50b2efa17f36a85747019b55a0e00be8d`, in sync with `origin`, not yet in `main`.
- **Staff Auth files:** 13 modified + 23 new = 36 files (§3.A), all verified additive/clean.
- **Documentation files:** 3 existing reports + this one (§3.B).
- **Unrelated files excluded:** 15 files/dirs, all verified untouched by filesystem mtime (§3.C).
- **Suspicious files:** none (§3.D).
- **Historical migration integrity:** **PASS** — zero migrations modified, sequence 0059→0067 has no gap/collision (§4).
- **Secret audit:** **PASS** — `.env` confirmed ignored, no secret in the proposed file set (§6, §11).
- **Generated-types stale-state:** noted, not touched, not blocking (§7).
- **Recommended commit structure:** 2 commits — code, then docs (§8–§10).
- **Verdict: `STOP_AND_REVIEW`** — not because the files or content are unsafe (they are clean), but because of the **branch-scope mismatch** in §5: this feature should land on a new branch (e.g. `feat/cafe-v2-1-staff-auth-provisioning`) cut from the current HEAD, not directly onto `fix/cafe-v2-1-manager-correction-panel-live-sync`. Once you decide how to handle that (new branch vs. deliberately keeping it here), the file lists, commands, and messages above are ready to use as-is.

Nothing staged. Nothing committed. Nothing pushed. Stopping here for your review.
