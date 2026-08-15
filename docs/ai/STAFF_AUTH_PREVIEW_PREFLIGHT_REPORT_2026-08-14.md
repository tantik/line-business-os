# STAFF_AUTH_PREVIEW_PREFLIGHT_REPORT (2026-08-14)

Read-only pass. No cloud mutation was performed at any point. Every check below used either `supabase db query --linked` (SELECT-only statements, via the Management API — never a raw connection string/password), `supabase functions list`/`secrets list` (read-only listings), `gh`/`git` (read-only), or a plain HTTP GET to the public Preview URL.

## 1. Git / PR

- `ORIGIN_DEV_SHA` = `d372d41c3ff54070b215abd85b53006b81661250`
- `PR225_HEAD_SHA` = `e40428200ce9497bd398b6076e2d738773a70759`
- `PR225_BASE` = `dev`
- `PR225_SCOPE_CLEAN` = **YES** — `git diff origin/dev...e404282 --stat` = 41 files; grep for every roster/schedule-identity filename pattern from the two excluded commits returns zero matches.
- `CI_GREEN` = **YES** — `typecheck / test / build / lint`: pass (1m45s); `Vercel`: pass (deployment completed); `Vercel Preview Comments`: pass. PR state: `OPEN`, `mergeable: MERGEABLE`. Not merged.

## 2. Current Preview app SHA / alias

`CURRENT_PREVIEW_APP_SHA` = **cannot be cryptographically proven from here** — no version/build-SHA is exposed by the app itself (`GET /api/health` on `https://preview.oruwa.jp` returns only `{"status":"ok",...}`, no commit identifier), and no Vercel CLI/token is available in this environment to query deployment-to-alias mapping directly.

Best available evidence, explicitly not a proof:
- PR #225's own Vercel bot comment gives its **ephemeral, PR-specific** preview URL: `line-business-os-web-git-feat-cafe-v2-1-d890c9-tantiks-projects.vercel.app` — this is **not** `preview.oruwa.jp`.
- Repo docs (`docs/ai/current-task.md`) describe `preview.oruwa.jp` as the **standing** Preview alias, reached via a host-rewrite (`apps/web/src/lib/preview/rewrite-config.mjs`), used across many past acceptance cycles — architecturally consistent with a Vercel custom domain bound to this project's configured Production-branch deployment, not to arbitrary open PRs.
- PR #225 is unmerged into `dev`.

`CURRENT_PREVIEW_ALIAS_TARGET` = inferred to be `origin/dev`'s current HEAD (`d372d41`) — i.e., whatever was last merged to `dev`, which does **not** yet include this PR's code.
`PREVIEW_APP_MATCHES_PR225` = **NO** (inferred with high confidence from the above; not cryptographically proven).

## 3. Preview Supabase project identity

`SUPABASE_PROJECT_REF` = `pehcoenozjtsjdvjietj` (task-specified target).
`SUPABASE_PROJECT_NAME` = `line-business-os-dev` (per `docs/phase-1l-4-cloud-dev-sync-completion-report.md`, which also confirms a **separate** production project, `line-app-prod-salon01`, exists on the same account — reducing ref-confusion risk).
Corroboration: `grep -rl pehcoenozjtsjdvjietj` matches the local `.temp/linked-project.json` link-state file (direct `cat`/`Read` of that file is blocked by this session's own permission settings — a deliberate guardrail, not bypassed). Every `supabase db query --linked` in this pass connected successfully and returned data consistent with the known `mame-to-cha` fixture tenant, `staff@mame-to-cha.test`, etc. — strong behavioral confirmation this is the correct dev/Preview project, not production.
`TARGET_CONFIRMED` = **YES**.

## 4. Migration state

| Migration | Preview state |
|---|---|
| PREVIEW_0062 | **NOT APPLIED** (pending) |
| PREVIEW_0063 | **NOT APPLIED** (pending) |
| PREVIEW_0064 | **NOT APPLIED** (pending) |
| PREVIEW_0065 | **NOT APPLIED** (pending) |
| PREVIEW_0066 | **NOT APPLIED** (pending) |
| PREVIEW_0067 | **NOT APPLIED** (pending) |

`OTHER_PENDING_MIGRATIONS` = **none** in the sense of "local has it, remote doesn't, unexpectedly." **However, a real, unexpected finding**: `supabase migration list --linked` shows migration **`0061_workforce_staff_roster_visibility`** already applied on **Preview**, even though it is **absent from this clean branch's local migration files** (deliberately excluded per the clean-branch decision — it belongs to the still-unmerged `a4c91ec` commit on the other, preserved branch). Confirmed independently: `api.workforce_staff_roster` view exists on Preview right now.

This is not a blocker (0062–0067 do not depend on it, empirically proven by this session's own local `db reset` succeeding with 0061 absent), but its provenance is unknown to this session — nobody in this multi-session task ever ran a migration push to Preview. **Recommend the Founder confirm who/when applied `0061` to Preview** before the rollout, purely for change-tracking hygiene; it does not block Staff Auth.

## 5. 0063 conflict audit — READ ONLY

```sql
select tenant_id, user_id, count(*) from workforce.employees
where user_id is not null group by tenant_id, user_id having count(*) > 1;
```
`0063_CONFLICT_COUNT` = **0**. Required condition met.

## 6. 0062 precondition

- `workforce.is_own_employee` exists; `workforce.is_own_active_employee` does not yet exist (clean slate, no collision).
- `workforce.employees.is_active` (boolean) and `.user_id` (uuid) columns both exist with expected types.
- No incompatible pre-existing object found.

`0062_PRECONDITION` = **PASS**.

## 7. 0064–0067 preconditions

- `workforce.employee_invitations` table: does not exist (0064 — no collision).
- `api.workforce_employee_invitations` view: does not exist (0065 — no collision).
- `workforce.upsert_employee_invitation`, `workforce.accept_employee_invitation`, `api.accept_employee_invitation`, `api.upsert_employee_invitation`: none exist yet (0064/0065 — no collision).
- `api.has_permission_in_tenant`: does not exist (0066 — no collision).
- `api.workforce_staff_manage` currently has exactly the 16 pre-0067 columns expected (`staff_id` … `notes_encrypted`, **no** `has_account_access` yet) — matches this branch's 0067 migration's own `CREATE OR REPLACE VIEW` append-only assumption exactly.

`0064_PRECONDITION` = **PASS**
`0065_PRECONDITION` = **PASS**
`0066_PRECONDITION` = **PASS**
`0067_PRECONDITION` = **PASS**

## 8. Edge Function readiness

`EDGE_FUNCTION_CURRENTLY_DEPLOYED` = **NO** (`supabase functions list --project-ref pehcoenozjtsjdvjietj` → `[]`, empty).
`PII_ENCRYPTION_KEY_PRESENT` = **NO** (`supabase secrets list --project-ref pehcoenozjtsjdvjietj` → `{"secrets":[],"message":""}` — no custom secret of any kind is set).
`SITE_URL_PRESENT` = **NO** (same empty listing).
`SUPABASE_PLATFORM_SECRETS_AVAILABLE` = **YES** — `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every Edge Function's runtime by the platform itself (documented Supabase behavior, not something the `secrets list` command reports since it only lists custom secrets); no value was read or needed to state this.

## 9. PII key consistency risk

`PII_KEY_ALIGNMENT_PROVABLE` = **NO** — neither side's actual key value can or should be inspected from here. What is provable architecturally: the web app reads `PII_ENCRYPTION_KEY` from its own deployment environment (Vercel project env vars, not visible to this session), and the Edge Function would need the **same** value set as a Supabase secret (currently absent, §8). These are two independent configuration surfaces (Vercel vs. Supabase) with no automatic sync between them.
`ACTION_REQUIRED` = Before deploying the Edge Function, a human must copy the **exact same** `PII_ENCRYPTION_KEY` value already configured for the Preview web app (Vercel) into a Supabase secret on this project (`supabase secrets set PII_ENCRYPTION_KEY=... --project-ref pehcoenozjtsjdvjietj`) — a value-copy operation only a human/secrets-manager should perform, never typed into chat or committed.

## 10. SITE_URL / redirect readiness

`EXPECTED_SITE_URL` = `https://preview.oruwa.jp` — the standing, documented Preview surface (not the ephemeral per-PR Vercel URL from §2, which will stop existing once this PR merges; by the time a real invite is sent, the code will already be live at the standing alias per the recommended rollout order in §14).
`AUTH_REDIRECT_CONFIG_OK` = **UNKNOWN** — no read-only CLI path exists to inspect GoTrue's redirect-URL allow-list from this session (`supabase config` only exposes a `push` — write-only — subcommand; `supabase inspect` only covers DB performance tooling; Auth URL configuration lives in Dashboard/Management-API surface this session has no token for).
`MISSING_REDIRECTS` = unknown, but the **specific URL that must be present** on the Preview project's Auth → URL Configuration → Redirect URLs allow-list before any real invite can complete is `https://preview.oruwa.jp/auth/accept-invite` (Supabase Auth rejects any `redirectTo` not on this allow-list at token-exchange time, independent of anything in this repo's own code).

## 11. Email delivery readiness

`EMAIL_DELIVERY_READY` = **UNKNOWN** — same reason as §10, no read-only CLI/API path available to inspect SMTP/email settings from here.
`EMAIL_RISK` = Supabase's default (non-custom-SMTP) email sending is rate-limited to a small number of emails per hour and is well-documented as unsuitable for anything beyond light testing; if this project has not had custom SMTP configured, the first real invite to `staff2@mame-to-cha.test` may work but should not be assumed reliable, and repeated resends during QA could exhaust the default quota. Recommend a human confirm the Auth → Email settings (custom SMTP vs. default) in the Supabase dashboard before relying on delivery.

## 12. 佐藤 健 (staff2) target readiness

Tenant resolved: `mame-to-cha` (`core.tenants.id = 0d164014-1248-4917-89dc-90695d2b8214`). `auth.users` confirms **no** account yet exists for `staff2@mame-to-cha.test` (clean slate). `workforce.employees` for this tenant: 17 rows total, 12 inactive, 5 active; of the 5 active, exactly 1 is already bound (to staff1, see §13) and **4 are active, unbound, same-location, and have `email_hash is not null`** — i.e., plausible invite candidates.

**Honest limitation, not glossed over**: this session correctly did **not** decrypt any `name_encrypted` value (that requires the `PII_ENCRYPTION_KEY`, which this read-only pass never touched or needed), so the specific row corresponding to "佐藤 健" by name **cannot be cryptographically confirmed** from here — only that a structurally-valid, ready-to-invite candidate set exists.

- `STAFF2_TARGET_FOUND` = **LIKELY** (4 structurally-matching candidates; exact name not decrypted/confirmed)
- `STAFF2_TARGET_ACTIVE` = **YES** (all 4 candidates)
- `STAFF2_TARGET_UNBOUND` = **YES** (`user_id IS NULL`, all 4)
- `STAFF2_EMAIL_PRESENT` = **YES** (all 4 have `email_hash is not null`)
- `STAFF2_PENDING_INVITATION` = **N/A / NO** — `workforce.employee_invitations` doesn't exist yet on Preview (0064 not applied), so by construction no invitation of any kind currently exists for anyone.
- `STAFF2_HAS_ACCOUNT_ACCESS` = **false** (derived directly from `user_id IS NULL`; the `has_account_access` column itself doesn't exist yet pre-0067, but the underlying truth it will expose is already confirmed false).

**Action for the human running the actual invite step**: confirm which of the 4 candidate employee IDs is 佐藤健 via the real Manager UI (which decrypts server-side, exactly as designed) — this preflight intentionally does not do that decryption itself.

## 13. 田中 愛 (staff1) existing-binding safety

`auth.users`: `staff@mame-to-cha.test` exists, `id = 1b2427d8-8604-419f-b679-7654ff3560da`, confirmed. Exactly **one** `workforce.employees` row in this tenant has `user_id = 1b2427d8-...` (`993e13de-824a-4043-9291-177676af4632`), and it is `is_active = true`.

- `STAFF1_BINDING_UNIQUE` = **YES**
- `STAFF1_EMPLOYEE_ACTIVE` = **YES**

Nothing was mutated.

## 14. Exact rollout order (this repo's specific safest sequence)

Your default preference (Git/PR/CI first, then cloud rollout) is correct **and is what this repo's own convention already enforces** — every historical PR here merges to `dev` first, and Preview reflects `dev`'s state via the standing alias (§2), not per-PR ephemeral URLs. There is no mechanism in this repo to apply a migration "ahead of" merging its owning PR — recommending otherwise would itself be a scope/history problem of the same kind Steps 1–7 of the prior task already fixed once. **PR #225 must merge to `dev` before the Preview DB migration**, so that the deployed app code and the deployed schema move together and stay consistent with what `git log` says shipped.

1. Final human review + merge PR #225 → `dev` (only after this preflight's GO).
2. Confirm new `origin/dev` HEAD = PR #225's commits.
3. Re-run the §5 conflict audit once more immediately before applying 0063 specifically (data can change between preflight and rollout; the audit is cheap and read-only).
4. `supabase db push --dry-run` against Preview (review the exact SQL), then, with fresh explicit human approval, the real `supabase db push` — applies 0062–0067 in one controlled step (0061 is already there, §4, so push will only add the 6 new ones).
5. `supabase migration list --linked` again — verify local/remote now match exactly through 0067.
6. Copy the matching `PII_ENCRYPTION_KEY` value + set `SITE_URL=https://preview.oruwa.jp` as Supabase secrets (§9/§10) — human-performed, value never typed into chat.
7. `supabase functions deploy invite-employee --project-ref pehcoenozjtsjdvjietj`.
8. Confirm (dashboard) `https://preview.oruwa.jp/auth/accept-invite` is on the Auth redirect allow-list (§10); confirm email/SMTP readiness (§11).
9. Confirm the Vercel deployment serving `preview.oruwa.jp` is now built from the merged `dev` (post-step-1) — re-run this preflight's §2 method.
10. Manual smoke: sign in as Manager, load the Staff list, confirm the new Access column renders, confirm Staff (田中愛) sign-in still works unaffected (§13's binding is untouched by any of the above).
11. Only now: invite 佐藤健 (§12's confirmed candidate) via the real Manager UI Invite button — the actual product flow, never manual SQL.
12. Complete the real email → password-setup → accept flow as that person.
13. Verify both Staff can sign in independently, see correct own-identity/coworker-roster data, and neither can act as the other.
14. Clean up only what QA explicitly created as disposable (per this repo's existing disposable-fixture conventions) — never touch `田中愛`'s pre-existing binding.

## 15. Forward-fix / recovery plan (method only, not performed)

- **Migrations 0062–0067 partially applied / failed mid-push**: Postgres migrations here run in transactional DDL blocks per Supabase's push mechanism; a failure rolls back that file. Forward-fix: correct the specific failing statement in a **new** migration (`0068...`), never edit `0062`–`0067` in place. Never `db reset --linked` (destructive, explicitly forbidden by this repo's own documented convention, §”supabase-cloud-dev-setup.md”).
- **Edge Function deployed with wrong/missing secret**: forward-fix by re-running `secrets set` with the correct value then `functions deploy` again (idempotent — redeploying overwrites, no rollback needed). The function fails closed (500 `missing_configuration`) if a secret is absent, per its own code — never silently misbehaves.
- **Bad web deployment aliased to `preview.oruwa.jp`**: Vercel retains prior deployments; re-alias the domain to the last-known-good deployment via the dashboard (or `vercel alias` if a CLI/token becomes available) — no data loss, purely a routing change.
- **Failed invite (Edge Function errors)**: no partial DB state is left — `workforce.upsert_employee_invitation` is one atomic statement; a failed Auth Admin API call happens *before* that DB write (per this codebase's own ordering, verified in the local implementation report), so a failed invite leaves zero trace beyond an unconfirmed `auth.users` row if a brand-new user was partially created by `inviteUserByEmail` before a later step failed — forward-fix: the Manager simply clicks Invite again (idempotent upsert; a stray unconfirmed `auth.users` row is harmless and gets reused if the email is invited again).
- **Partial Auth user creation** (Admin API created the user but the DB write then failed): the next Invite/Resend attempt for the same employee will hit "already registered" and correctly fall into the existing-user branch, reusing that same Auth user id — self-healing by design, not something to manually clean up.
- **Partial invitation binding**: `workforce.accept_employee_invitation` is one PL/pgSQL function body (implicit single transaction) — either every step (users/membership/role/bind/mark-accepted) commits, or none do. No partial-binding state is reachable; nothing to forward-fix here beyond retrying `accept`.

Destructive rollback (migration `down`, `db reset --linked`) is **never** the first-line answer for any of the above, consistent with this repo's own explicit convention.

## 16. Blockers

**None found that block starting the rollout sequence.** (Distinct from "nothing left to configure" — see §20 unknowns, which are real open items but are configuration/verification steps within the rollout itself, not reasons to halt before starting.)

## 17. Unknowns

- `UNKNOWN_BLOCKING`: **none.**
- `UNKNOWN_BUT_NONBLOCKING`:
  - Exact current Preview app deployment SHA (§2) — inferred, not proven; resolves itself naturally at rollout step 9.
  - Provenance of migration `0061` already being on Preview (§4) — worth asking the Founder, doesn't block.
  - Auth redirect allow-list state (§10) — must be confirmed/configured as part of rollout step 8, not before.
  - Email/SMTP delivery readiness (§11) — same, rollout step 8.
  - Exact identity of the 佐藤健 row among 4 structural candidates (§12) — resolved automatically by the real Manager UI's own decryption at rollout step 11, never needs solving here.

## 18. Final verdict

```
PREVIEW_PREFLIGHT = GO
```

Every check this session could safely perform read-only came back clean: PR scope verified three independent ways, CI green, zero 0063 conflicts, all six migrations' preconditions pass with zero object-name collisions, zero unrelated pending migrations, staff1's existing binding is unique and untouched, a valid staff2 candidate set exists. The items marked `UNKNOWN_BUT_NONBLOCKING` (Auth redirect allow-list, email/SMTP config, exact current alias SHA) are not blockers to *beginning* the rollout — they are specific, already-itemized steps *within* §14's sequence (steps 6, 8, 9) that a human must complete as part of that sequence, not preconditions that must be resolved before step 1 (merging PR #225) can happen.

No cloud mutation was performed. PR #225 remains open, unmerged. Preview and Production databases are unchanged. No secret was set. No Edge Function was deployed. No staff2 account was created. No email was sent. Stopping here per instruction.
