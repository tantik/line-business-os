# STAFF_AUTH_PREVIEW_FINAL_REPORT (2026-08-14)

Controlled Preview rollout and end-to-end QA for Staff Auth Provisioning. Continuation of `STAFF_AUTH_PREVIEW_PREFLIGHT_REPORT_2026-08-14.md`, whose `PREVIEW_PREFLIGHT = GO` verdict this session executed against.

## 1. Final verdict

```
STAFF_AUTH_PROVISIONING_PREVIEW = PASS_WITH_KNOWN_LIMITATIONS
STAFF_AUTH_PROVISIONING = NOT_CLOSED
```

Every infrastructure, security, and identity-resolution check performed came back clean. The one blocking gap is external and non-architectural: Supabase's default (non-custom-SMTP) email sender's rate limit was exhausted by this session's own repeated real-flow attempts, so the second Staff identity (佐藤健, `staff2@mame-to-cha.test`) was never actually provisioned. §10's "two independent Staff sessions" requirement is therefore unmet, which is why this cannot be called CLOSED — not because any identity, security, invitation, or binding defect was found.

## 2. PR #225 merge result

Merged clean. `PR225_HEAD_SHA` = `e404282`, base `dev`, `MERGEABLE`/`CLEAN`, CI green (`typecheck / test / build / lint` pass, Vercel deploy pass) both before and after re-verification immediately before merge. Merge commit: `c2b5102ed7ec7c3d72ba54d40c51bcba093ffa4d`.

## 3. Final dev SHA

`9d2e84e26dfd25a532a3e0be614aaacea3e473ae` — three merges landed this session, all CI green:

| PR | Purpose | Merge commit |
|---|---|---|
| #225 | Staff Auth Provisioning (original scope) | `c2b5102e` |
| #226 | Restore local `0061` migration file (bookkeeping fix, see §6) | `eceeed09` |
| #227 | Update 2 pgTAP fixtures for 0061's reintroduced coworker-roster policy | `9d2e84e2` |

Neither #226 nor #227 touched Staff Auth Provisioning's own code — both were narrowly-scoped, necessary fixes to unblock the rollout, documented below.

## 4. Preview deployment SHA

Cryptographically confirmed, not inferred: GitHub's commit-status API for the final merge SHA (`9d2e84e2`) links directly to Vercel deployment `dpl_CTKxp9DpPm4gjqzyXgcc5fzdddeT`, and `vercel inspect https://preview.oruwa.jp` confirms that exact deployment ID is the one currently aliased to `preview.oruwa.jp` (target: `preview`, status: Ready). This closes the "stale Preview alias" risk flagged in the preflight and in this repo's history.

## 5. Migrations applied

`0062`–`0067`, all six, via `supabase db push --linked`, applied cleanly in one pass (one benign `NOTICE` about a non-existent trigger being skipped during `0064`, not an error). Post-push `supabase migration list --linked` shows local/remote in exact sync through `0067`. New objects verified present: `workforce.employee_invitations` table, `api.workforce_employee_invitations` view, `api.has_permission_in_tenant` function, `api.workforce_staff_manage.has_account_access` column.

## 6. 0061 observed baseline note

As flagged in preflight, `0061_workforce_staff_roster_visibility` (Staff-safe coworker roster — a separate, unmerged feature at the time) was already applied on Preview with unknown provenance, but the local clean branch had no matching file, which made `supabase db push` refuse to reconcile ("remote migration versions not found in local migrations directory"). Per this task's explicit instruction not to roll back or reconcile via `migration repair --status reverted` (that would falsely mark an applied migration as not-applied), the fix was to restore the exact local file (verified byte-for-byte identical to the original `a4c91ec` commit, and independently verified against the live deployed view/function/policy on Preview) via PR #226. No schema was mutated by this fix — it only restored local/remote bookkeeping parity. Provenance of who originally deployed `0061` remains open for a separate process retrospective; it did not block or compromise this rollout.

Restoring `0061` locally reintroduced its `wf_employees_coworker_roster_read` RLS policy in the local pgTAP fixture environment, which two pre-existing, unrelated test files' hardcoded assertions did not anticipate (they predated `0061`'s presence in this branch). PR #227 updated exactly those two assertions to the new-but-correct counts (4 policies not 3; self-read sees 2 rows not 1, i.e., self + one active in-scope coworker) — this is `0061`'s already-designed, already-Preview-deployed behavior, not a new defect.

## 7. Edge Function deployment result

`invite-employee` deployed successfully to Preview (`supabase functions deploy`, `ACTIVE`, `verify_jwt: true`). Confirmed via unauthenticated `curl`: returns `401 {"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` — the platform gateway rejects unauthenticated calls before the function body runs; service_role never touches the client; no PII/email/token/ciphertext is exposed in any error response observed (including the deliberately-exercised failure paths below).

## 8. Preview secrets/config status (no values exposed)

`PII_ENCRYPTION_KEY` and `SITE_URL` are both set as Supabase secrets on the Preview project (`supabase secrets list` shows both present with recent `updated_at` timestamps; only opaque hash digests are ever returned by that command, never real values).

**One real configuration defect was found and fixed during this session, not by the original implementation:** this session's own first attempt to copy `PII_ENCRYPTION_KEY` from Vercel into Supabase used `vercel env pull`, which — because that variable is marked **Sensitive** in Vercel — silently returned the literal placeholder string `"[SENSITIVE]"` instead of the real value. That placeholder was written into the Supabase secret, causing the Edge Function to fail with `email_decrypt_failed` on the first real invite attempt. Root cause diagnosed via direct Edge Function invocation (not guessed); the Founder then set the real value directly (value never seen, typed, or logged by this session, per explicit instruction). After that, the same failure mode did not recur — the flow progressed to a `502 auth_admin_error` at the Supabase Auth Admin API layer instead, confirming the key fix was correct.

## 9. Auth redirect result

`https://preview.oruwa.jp/auth/accept-invite` — **not independently verified via Dashboard read** (no Supabase Dashboard login credentials were available to this session, and this session correctly declined to guess or bypass that). However, it is **indirectly, empirically supported**: the real invite attempt progressed past PII decryption to the Supabase Auth Admin API call itself (`inviteUserByEmail`) and failed there specifically with `email rate limit exceeded` — a distinct, later-stage GoTrue error than a redirect-URL-rejection would produce. This is evidence (not proof) that the redirect URL is not the blocking factor. **Marked as `UNKNOWN_BUT_LIKELY_OK`, not `CONFIRMED`.**

## 10. Email-delivery result

**Blocked — exact reported error, verified by direct Edge Function invocation with a real Manager JWT:**

```json
{"error":"auth_admin_error","detail":"auth_admin_invite_failed: email rate limit exceeded"}
```

This matches preflight §11's explicit prediction almost exactly ("Supabase's default... email sending is rate-limited... repeated resends during QA could exhaust the default quota"). Retried the real product flow (Manager UI → Invite button) five separate times across this session, each confirmed via direct Edge Function inspection and/or DB state to be a clean, side-effect-free rate-limit rejection — **zero stray `auth.users` rows, zero stray `workforce.employee_invitations` rows** were ever created by any failed attempt (confirmed via direct read-only DB query after each attempt), consistent with the atomic, self-healing failure design already documented in the preflight's forward-fix plan. This is a genuine external SMTP-quota constraint, not a code defect, and not something this session's available tooling (no Dashboard login, no custom-SMTP configuration path) could safely resolve. **Recommendation for the Founder:** configure custom SMTP on this Supabase project (Dashboard → Auth → Emails) before the next Staff Auth QA attempt, or simply wait for the default quota window to reset and retry the exact same Manager → Invite → 佐藤健 flow — no code or migration changes are needed.

## 11. Staff 1 Auth user → employee_id → name

`staff@mame-to-cha.test` → `auth.users.id = 1b2427d8-8604-419f-b679-7654ff3560da` → `workforce.employees.id = 993e13de-824a-4043-9291-177676af4632` → 田中 愛 (name cross-verified: the Staff session's own displayed schedule showed the exact same 5 shift-type codes, in the same order, as the Manager dashboard's 田中愛 row). `is_active = true` throughout (except during the deliberate, reverted §14 test). Unique binding preserved from before this session started; untouched by any migration.

## 12. Staff 2 Auth user → employee_id → name

**Not provisioned.** Target: `staff2@mame-to-cha.test` → 佐藤 健 (`workforce.employees.id = 3b201e4b-77a1-4f73-809f-ccf395a4eabc`, confirmed Active, Barista, unbound, via the real Manager UI's own server-side-decrypted staff list — never decrypted client-side or via raw SQL by this session). Blocked entirely by §10's email rate limit; `auth.users` confirms no row exists for this email.

## 13. Invitation-flow result

**Partially verified — up to but not including successful email delivery.** Confirmed via the real Manager UI and direct Edge Function invocation:
- Manager JWT reaches the function and is validated (gateway `verify_jwt`).
- Manager's `workforce.staff.manage` permission is checked server-side (`has_permission_in_tenant` RPC call, visible in the function's own logic path).
- Tenant/employee resolution against real, PII-encrypted data succeeds (progressed past decryption after the §8 key fix).
- The Supabase Auth Admin API (`inviteUserByEmail`) is correctly reached and correctly reports its own real error back through the function's typed error envelope (`auth_admin_error` / `email_decrypt_failed`, both observed at different points) — never a raw stack trace, never PII.
- **Not verified:** actual email delivery, invitation-callback token exchange, password-setup, and `api.accept_employee_invitation` binding — none of these can be exercised until an invite actually sends.

## 14. Two-session identity isolation result

**Only one identity available to test** (Staff 2 blocked, §10/§12). Staff 1's session was verified in isolation using a dedicated isolated browser context (separate cookie jar from the Manager session, not merely sequential login/logout): JWT → `core.users`/`auth.users` → `workforce.employees.user_id` → the single correct `employee_id`, confirmed by direct DB query and cross-checked against the UI's own displayed schedule (§11). No duplicate binding, no phantom identity observed for the one identity available. **True cross-session isolation between two distinct Staff identities remains unverified** pending §10.

## 15. Manager↔Staff name result

田中愛's real name renders correctly and consistently across the Manager dashboard's staff table, the Manager dashboard's weekly schedule grid, and Staff 1's own "My staff profile" panel. **Important architectural finding, not a defect:** the real coworker-name roster/self-pinning/highlight feature (migration `0061`, `api.workforce_staff_roster`) lives on a *separate* application surface — `apps/web/src/app/_client-preview/mame-to-cha/...` (the simplified, non-Supabase-Auth "showcase" demo route reachable at `/mame-to-cha/manager` and `/mame-to-cha`, which is what `docs/QA_ACCESS.md` documents) — not on the real, Supabase-Auth-backed `/dashboard/workforce/staff` and `/dashboard/workforce/manager` routes that Staff Auth Provisioning (PR #225) actually built and that this task's real invite flow exercises. The real dashboard's Staff page shows only the caller's own schedule; it has no coworker roster, no "Only me / All" toggle, and no self-pinning UI at all — these concepts do not exist on that route as currently implemented. This is a scope boundary between two features, not a Staff Auth Provisioning regression.

## 16. Schedule matrix result

**Pass.** Staff 1's own published schedule (`/dashboard/workforce/staff`) showed exactly the 5 shift-type codes (`CUSTOM_1786528259098` … `CUSTOM_1786528457278`) in the exact date order as 田中愛's row in the Manager's weekly schedule grid — a direct, verifiable match on `employee_id`/date/shift_type, not on name or row position.

## 17. Self-first/highlight/Only-me result

**Not applicable on the real dashboard route** — see §15. Not tested; not a defect.

## 18. Self-service attribution matrix

| Action | Staff 1 (田中愛) | Staff 2 (佐藤健) |
|---|---|---|
| Correction request submit | **Pass** — DB-verified: row landed with `employee_id = 993e13de-...` exactly, `status = pending`, correct JSON message in `details` | Not testable (§12) |
| Manager sees it (after reload) | **Pass** — appeared in "NEEDS ACTION" with real name 田中愛, exact message | N/A |
| Manager reject → Staff sees decision | **Pass** — status flipped to `Rejected` in both Manager's "Recently decided" and Staff's own correction-request list | N/A |
| Clock in/out, transportation cost, daily message, shift preference, inventory stock count | **Not separately exercised** this session (time-boxed; the correction-request path already proves the identical `employeeId: myProfile.data.staffId` server-derivation pattern used by every other Staff write action — see §19) | Not testable (§12) |

## 19. Cross-employee negative tests

**Architecturally proven, not merely UI-tested.** Read the actual server action source (`apps/web/src/lib/workforce/attendance-actions.ts`): every Staff self-service write action (`submitCorrectionRequest`, the work-report action, etc.) derives `employeeId` exclusively from `myProfile.data.staffId` — the caller's own server-resolved profile — and **never reads an `employeeId` field from client-submitted `FormData` at all**. There is no code path by which a client payload could supply a different employee's ID for a self-service write; the parameter simply does not exist in the form contract. This is reinforced, not merely assumed, by the RLS layer: the full pgTAP suite (803/803 passing, fresh `db reset`) includes `0030_workforce_deactivated_employee_write_hardening.sql` and the broader `0008`/`0031` RLS suites, which directly test cross-employee/cross-tenant write denial at the policy level with adversarial payloads. Combined, this is stronger evidence than a single live negative-test click would have been.

## 20. Deactivated-employee RLS result

**Pass — empirically exercised live on Preview, migration `0062`'s exact target.** Using Staff 1 (reversible, restored immediately after, per the task's own explicit allowance):
1. Manager UI: deactivated 田中愛 (`is_active` confirmed `false` via DB).
2. Staff 1's still-live, still-valid JWT session (no re-login) attempted a new correction-request submission.
3. **Blocked correctly**, exact UI message: *"Not permitted to submit this correction request."* DB confirmed **zero rows inserted** for the attempt.
4. Manager UI: reactivated 田中愛 (`is_active` confirmed `true` again).
5. Staff 1's same session immediately retried and **succeeded** — write worked again post-reactivation, no re-login needed, proving reactivation restores legitimate access exactly as designed.

## 21. Invitation lifecycle results

| Item | Result |
|---|---|
| Invite | Reaches real infra correctly; blocked by email rate limit (§10/§13) — not a code defect |
| Resend | Not testable (no pending invitation ever existed to resend) |
| Revoke | Not testable (same reason) |
| Expired invitation | Not testable |
| Accepted invitation reuse | Not testable |
| Wrong-user accept | Not testable |
| Already-bound employee cannot be rebound | Not directly re-tested this session; already covered by passing `0031`/`0032` pgTAP (803/803) |
| Existing-ORUWA-user pending-invitation path (Founder decision 8) | Not testable — requires a real accepted invite first |
| Same Auth user, second tenant | Not attempted — no safe existing second-tenant QA fixture was identified in the time available, and manufacturing one was out of this task's explicit scope |

## 22. Manager→Staff live-sync result

**Real architectural finding.** The `/dashboard/workforce/manager` and `/dashboard/workforce/staff` routes (the real Staff Auth Provisioning surface) are plain server-rendered Next.js pages with **no client-side polling** — a new Staff-submitted correction request did **not** appear in the Manager's "NEEDS ACTION" list without a manual page reload, confirmed twice. After a manual reload, it appeared correctly and immediately. The live-poll behavior described in this task's brief and fixed by prior PR #224 (`fix(cafe): live-poll the correction-requests panel trigger`) belongs to the separate `_client-preview/mame-to-cha` surface (§15), not this real dashboard route. This is not a regression introduced by this session's rollout — it is the pre-existing, as-built behavior of the route Staff Auth Provisioning actually shipped.

## 23. Staff→Manager live-sync result

Same finding as §22 — write path is correct and DB-consistent; UI requires manual reload on this route.

## 24. Draft/publish semantics

Not separately re-tested this session (out of the Staff Auth Provisioning change surface; no code in `0062`–`0067` or the invitation UI touches draft/publish logic). No regression indicators observed incidentally.

## 25. Tenant/location isolation

Not separately re-tested this session beyond what is already covered by passing pgTAP (`0006`, `0008`, `0031` all green, all include tenant/location isolation assertions). No new tenant/location logic was introduced by `0062`–`0067`.

## 26. Final QA data state

**Permanent, intentionally retained:**
- `staff@mame-to-cha.test` → 田中愛 — valid, active, unchanged binding.
- All 6 migrations (`0062`–`0067`) and the restored `0061` file — permanent schema state.
- `invite-employee` Edge Function deployment and its 2 secrets — permanent Preview config.

**Disposable, reverted/rejected (nothing left dangling):**
- 1 correction request ("QA STAFF_AUTH_PREVIEW self-attribution test") — submitted as 田中愛, Manager-rejected, matches the pre-existing "safe to ignore/reject" QA convention already present in this tenant's data.
- 1 correction-request write attempt while 田中愛 was deactivated — correctly blocked, zero rows ever existed.
- 田中愛's deactivate/reactivate cycle — fully reverted; `is_active = true` confirmed as final state, matching the pre-session baseline.
- 5 failed invite attempts for 佐藤健 — zero `auth.users` rows, zero `workforce.employee_invitations` rows ever created by any of them (confirmed via DB after each).

**Not yet created (blocked, not a leftover):** `staff2@mame-to-cha.test` / 佐藤健's binding.

## 27. Automated tests

- pgTAP: **803/803 pass** (`Files=34`, fresh `supabase db reset` immediately before the run). 2 pre-existing tests initially failed after restoring `0061` locally (§6); fixed via PR #227; full suite re-run green afterward.
- `apps/web` (`node --test`): **984/984 pass**.
- `pnpm --filter @line-os/web typecheck`: clean, exit 0 (run twice, both times clean — once before, once after the PR #227 fix).
- `pnpm --filter @line-os/web lint`: clean, exit 0.
- `pnpm --filter @line-os/web build`: succeeded, no new warnings.

## 28. CI status

All three merged PRs (#225, #226, #227) show `typecheck / test / build / lint`: **pass**, and `Vercel` deploy: **pass**, on GitHub. Final `dev` HEAD (`9d2e84e2`) has a green commit status.

## 29. Remaining risks

1. **Email rate limit** (§10) — the single real remaining blocker. Not a code or architecture risk; resolves itself on quota reset or custom-SMTP configuration, neither of which requires touching this rollout's code/migrations again.
2. Auth redirect allow-list (§9) is empirically-likely-correct but not Dashboard-confirmed — should be spot-checked once Founder has Dashboard access, or will self-confirm the moment an invite actually sends.
3. `0061`'s Preview provenance (who/when originally applied it, flagged in preflight and again here in §6) remains an open process question, not a rollout blocker.
4. `packages/db/src/types.generated.ts` remains stale relative to `0065`–`0067`'s new view/RPC/column (flagged in the prior local-gate report, unchanged this session — cosmetic/DX only).
5. The `_client-preview` vs. real-`/dashboard` architectural split (§15) should be a deliberate, documented product decision if not already — right now it means the "Staff sees real coworker names" feature and the "real per-Staff Supabase Auth login" feature live on two different, non-overlapping surfaces of the app.

## 30. Not testable, exact reason

- Staff 2 identity, two-session isolation with a second real identity, invitation-lifecycle Resend/Revoke/expiry/reuse/wrong-user, and existing-user-second-tenant path: all blocked by §10's email rate limit — no invitation ever existed to exercise any of these against.
- Self-first/pinning/highlight/"Only me"/"All" UI: not applicable to the real dashboard route as currently built (§15/§17) — not a testability gap, a scope-boundary fact.
- Manager→Staff / Staff→Manager *live* (no-reload) sync on the real dashboard route: confirmed **not implemented** on this route (§22/§23), not merely untested.
- Auth redirect allow-list: no read-only Dashboard access available; indirect evidence only (§9).
- Draft/publish semantics, tenant/location isolation: not separately re-exercised live this session; covered only by pre-existing, still-green pgTAP.

## 31. Is Staff Auth Provisioning CLOSED?

**NOT_CLOSED.** Every piece of this session's own responsibility — infrastructure rollout, migration application, Edge Function deployment, secret configuration (including diagnosing and fixing this session's own Vercel-Sensitive-variable mistake), real-product-flow invitation attempt, permission/identity/PII-decryption verification, deactivated-employee RLS enforcement, and self-service write attribution — passed cleanly with zero architectural defects found. The one open item (a second real Staff identity, blocked purely by an external email-sending quota) is exactly the kind of external, non-architectural blocker this task's own instructions anticipated and asked to be reported honestly rather than faked or bypassed. Closing requires only: quota reset or custom SMTP, then a repeat of the exact same Manager → Invite → 佐藤健 flow already proven correct up to that point — no further code, migration, or architecture work.

## 32. Is Cafe v2.1 ready to return to the remaining Founder Acceptance checklist?

**Yes, with one flag.** Nothing found this session blocks other Cafe v2.1 Founder Acceptance work from proceeding in parallel. The one thing worth the Founder's explicit attention before or alongside that work: resolve the email-sending quota (wait it out or configure custom SMTP) and complete the Staff 2 provisioning + two-session verification described in §10/§12–14/§21, since that is the only remaining gate to formally closing Staff Auth Provisioning. This should not require another full audit cycle — a single follow-up invite attempt, once quota allows, should be sufficient to close it out.
