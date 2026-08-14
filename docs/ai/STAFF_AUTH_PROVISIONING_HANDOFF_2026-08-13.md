# STAFF_AUTH_PROVISIONING — Continuation Handoff (2026-08-13)

Written mid-task, on explicit user instruction to stop and hand off. **No code changes made after this point.** This file is the resumption context for a fresh Claude Code session.

## 1. Where this sits

- **Branch:** `fix/cafe-v2-1-manager-correction-panel-live-sync` (unchanged — no new branch was created for this task)
- **HEAD:** `a4c91ec50b2efa17f36a85747019b55a0e00be8d` ("feat(cafe): Staff-safe real coworker names via new roster view")
- **Nothing has been committed or pushed.** All work described below is uncommitted, in the working tree only.
- Local Supabase (`supabase db reset`) has the new migrations applied and pgTAP green as of the last run. **Preview/Cloud has NOT been touched in any way** — no migration, no user, no deploy. This is correct and required (task brief explicitly forbids Preview until Founder approval, section 24).

## 2. Task goal (source: user's original brief, "ORUWA Cafe v2.1 — Staff Auth Provisioning Implementation")

Implement Staff-app access provisioning for Cafe v2.1: security-hardening → invitation → employee binding → two-staff acceptance, in phases, stopping before Preview for a written approval report. Full original brief is in the conversation history that produced this session; not reproduced here in full, but the founder decisions relevant to what's built so far are in §3.

## 3. Founder decisions in force (authoritative, do not re-litigate)

1. `workforce.employees.id` remains the canonical employee identity — never replaced by name/email/Auth id/etc.
2. One Auth user → **at most one** `workforce.employees` row **per tenant**; the same user MAY be an employee in a different tenant. Invariant: `unique (tenant_id, user_id) where user_id is not null`.
3. One person, one tenant → one employee row, even with multiple duties.
4. Manager role and employee identity are separate; granting Manager must not auto-create an employee row.
5. Employee contact email may be used as the invitation/login email initially; changing the employee's contact email later must never silently mutate the Supabase Auth login email.
6. **No LINE Login in this task.**
7. Preview QA target (not yet reached): `staff2@mame-to-cha.test` / `LocalSmoke123!` → 佐藤 健, created **through the new product flow**, not manual SQL. Existing `staff@mame-to-cha.test` → 田中 愛 must stay unchanged.
8. **User-confirmed mid-session:** for an invited email that already belongs to an existing Supabase Auth user (e.g. already staff at another tenant), **no new email is sent**. The invitation row is still created (target resolved via existing-user lookup), and on that person's next authenticated session anywhere in ORUWA, an in-app "you have a pending invitation" banner lets them accept with one click via the same bind RPC. This was a deliberate architecture choice made with the user via AskUserQuestion, not an assumption.
9. **User-confirmed mid-session:** the privileged Supabase Auth Admin API calls (`inviteUserByEmail`, `listUsers`, resend) must run in a **new Supabase Edge Function**, not in `apps/api` (which exists only as an undeployed local dev spike — see §7) and never in `apps/web` (hard, test-enforced rule: `apps/web` may never import `createServiceClient` or read `SUPABASE_SERVICE_ROLE_KEY`, per `.cursor/rules/01-security.mdc` and multiple `.test.ts` source-scans in `apps/web/src/lib/**`).

## 4. Phases completed (DB layer only — see §6 for exactly what's NOT done)

### Phase 1 — Deactivated-employee RLS hardening ✅ DONE, tests green
- `supabase/migrations/0062_workforce_deactivated_employee_write_hardening.sql`
- New `workforce.is_own_active_employee()` (adds `is_active = true` to the existing `is_own_employee()`), applied ONLY to self-scope WRITE policies (attendance self insert/update, shift_requests self insert, shift_exchanges request/accept/cancel + the trigger's self-actor branches, `api.cancel_workforce_shift_exchange`). SELECT policies untouched — history stays readable after deactivation.
- Tests: `supabase/tests/0030_workforce_deactivated_employee_write_hardening.sql` — proves active-employee writes still work, deactivated-employee writes are rejected, and nothing is deleted (employee row, attendance, requests, exchanges all survive and remain readable).

### Phase 2 — `(tenant_id, user_id)` uniqueness ✅ DONE, tests green
- `supabase/migrations/0063_workforce_employee_user_tenant_uniqueness.sql` — partial unique index `wf_employees_one_per_tenant_per_user on workforce.employees (tenant_id, user_id) where user_id is not null`.
- Conflict audit run locally (`select tenant_id, user_id, count(*) ... having count(*) > 1`): **0 rows** — safe to apply locally. **This same audit MUST be re-run against Preview's actual data before that migration ever touches Preview** — not yet done, out of scope until Preview approval.
- Tests: `supabase/tests/0031_workforce_employee_user_tenant_uniqueness.sql` — same user twice in one tenant rejected; same user in a second tenant allowed; multiple NULL-`user_id` (uninvited) employees allowed.

### Phase 3 — Verify Supabase Auth API semantics ✅ DONE (documented, not written to a file — see conversation)
Verified via official docs + `auth-js` source + GitHub issues (repo uses `@supabase/supabase-js@2.108.2`):
- `admin.inviteUserByEmail(email, {redirectTo, data})` creates a new unconfirmed user + sends its own email; **errors "already registered" for an existing confirmed user**.
- `admin.generateLink(...)` does **not** send email itself ("links and OTPs to be sent via a custom email provider") — this repo has no email-sending infra, which is WHY decision 8 (§3) landed on the no-new-email in-app-banner design instead of `generateLink`.
- Confirmed (GitHub #45210, open/unresolved): clicking an invite link runs `exchangeCodeForSession` and establishes a **real session before any password is set** — a known Supabase-wide gap, not fixable from ORUWA's side. Mitigation is UX-only: force straight to a password-setup screen immediately after the callback, don't route anywhere else first.
- Existing repo precedent for "try `createUser`, catch already-registered, fall back to `listUsers` pagination" already exists and is tested: `packages/db/scripts/mame-to-cha-auth.ts` (`findOrCreateLocalAuthUser`). Intended to be adapted (not reused as-is — that file is Node/local-only-guarded, the Edge Function is Deno) for the new Edge Function's existing-user branch.

### Phase 4 — Invitation/binding DB model — ✅ DB migration + RPC + tests DONE. Edge Function NOT started.
- `supabase/migrations/0064_workforce_employee_invitations.sql`:
  - `workforce.employee_invitations` table: `id, tenant_id, employee_id (composite FK -> workforce.employees(tenant_id,id)), target_user_id (FK core.users, NOT NULL — always resolved server-side before insert, never client-trusted), status (pending/accepted/revoked check), invited_by, created_at, updated_at, expires_at (default now()+7 days — ORUWA's own independent business-rule window, separate from whatever Supabase's own token TTL is), accepted_at, revoked_at`. Partial unique index: one `pending` row per employee at a time. RLS: manager (tenant-wide `workforce.staff.manage`) reads all; the invited person reads their own rows (any status) — this is what powers the decision-8 banner. Only direct-client write allowed is a Manager revoking a still-pending row (plain RLS UPDATE, no service_role needed). No INSERT policy for `authenticated` at all — every insert is service_role (Edge Function) only.
  - `workforce.accept_employee_invitation(p_invitation_id)` — **SECURITY DEFINER**, lives in `workforce` schema (NOT `api`) — this followed an important mid-session correction, see §8. Validates the invitation is `pending`+unexpired+targeted at `core.current_user_id()`, checks the employee isn't already bound, then atomically: ensures `core.users` row, ensures/activates `core.tenant_memberships`, grants the system `employee` role assignment (scoped to the employee's own `location_id`), binds `workforce.employees.user_id`, marks the invitation `accepted`. One implicit transaction — any failure leaves nothing partial.
  - `api.accept_employee_invitation(p_invitation_id)` — thin `SECURITY INVOKER` SQL passthrough to the above, satisfying this repo's ADR 0008 ("no SECURITY DEFINER object in `api` schema") **by construction**, same shape as `api.permanently_delete_employee` (0056) and `api.has_permission` (0019).
- Tests: `supabase/tests/0032_workforce_employee_invitations.sql` — RLS visibility (manager/self/third-party/cross-tenant), manager revoke, happy-path accept (binds employee, activates membership, grants role), and negative cases: reuse of an accepted invitation, a different user accepting someone else's invitation, revoked invitation, expired invitation, already-bound employee cannot be silently rebound, bogus invitation id, and the legitimate same-user-two-tenants case.

**Full local pgTAP suite as of the last run: `Files=32, Tests=785, Result: PASS`** (all green, including the 3 pre-existing test files that needed allow-list updates — see §5).

## 5. Files created or modified (uncommitted)

New migrations:
- `supabase/migrations/0062_workforce_deactivated_employee_write_hardening.sql`
- `supabase/migrations/0063_workforce_employee_user_tenant_uniqueness.sql`
- `supabase/migrations/0064_workforce_employee_invitations.sql`

New tests:
- `supabase/tests/0030_workforce_deactivated_employee_write_hardening.sql`
- `supabase/tests/0031_workforce_employee_user_tenant_uniqueness.sql`
- `supabase/tests/0032_workforce_employee_invitations.sql`

Modified tests (grant-allow-list updates required because 0064 added a new `workforce.employee_invitations` table with `SELECT, UPDATE` grants to `authenticated` — these are the repo's own "no unexpected grant" regression tests, not new tests written for this task):
- `supabase/tests/0002_security_rls.sql`
- `supabase/tests/0008_workforce_staff_recipes_rls.sql`
- `supabase/tests/0009_workforce_api_facade.sql`

**Pre-existing unrelated untracked files** (per the task brief's own instruction: "there is a known unrelated untracked-file cluster. Do not touch it.") — confirmed still untouched, listed here only so a fresh session doesn't mistake them for this task's output:
`-` (a literal file named `-`), `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`, `docs/AI_PLAYBOOK.md`, `docs/QA_ACCESS.md`, `docs/architecture/engineering-decisions.md`, `docs/product/cafe-*.md` (several), `icon/`, `packages/db/src/types.generated.ts`, `supabase/migrations/0060_workforce_recipe_tenant_wide_update_fix.sql`, `supabase/tests/0028_workforce_recipe_tenant_wide_update.sql`. **Do not stage, commit, or modify these.**

## 6. What is explicitly NOT done yet (do not assume otherwise)

- **Supabase Edge Function** (`supabase/functions/...`) for `invite`/`resend` — not started. This is the ONLY place `service_role` may be used (per decision 9, §3). Needs: verify caller's token + `workforce.staff.manage` permission (via a user-scoped client, not service_role, for that check), read+decrypt the employee's `email_encrypted` (manager-only `api.workforce_staff_manage` view, existing), then service_role `admin.inviteUserByEmail`; on "already registered" error, paginate `admin.listUsers` to resolve the existing user id (adapt, don't copy, `mame-to-cha-auth.ts`'s pattern — that file is Node-only-guarded and not directly importable into a Deno function); insert/reuse the `workforce.employee_invitations` row.
- **Manager UI** — no changes yet to the Staff management screens (Invite / Resend / Revoke actions, access-status display). Existing patterns to follow: `apps/web/src/lib/workforce/employees.ts` (manager-only decrypt pattern via `readPiiEnv()` + `@line-os/db/crypto`).
- **Employee acceptance UI** — no new route yet for (a) the post-invite-email callback that calls `exchangeCodeForSession` then `api.accept_employee_invitation`, forcing straight to password setup next (per the known Supabase session-before-password gap, §3 Phase 3 finding), and (b) the "pending invitation for me" banner for the existing-user/decision-8 path.
- **i18n strings** (JA-first, per section 9 of the original brief) — not started.
- **staff2 QA account** — not created. Per the brief this must go through the new product flow, not manual SQL, and only after the UI exists.
- **apps/web Vitest/unit tests** for any of the above — not started (none of this layer exists yet to test).
- **Full local verification gate** (typecheck/lint/build across the whole repo, not just pgTAP) — not run in this session; only `supabase test db` was run repeatedly.
- **The final `STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT`** (required by the brief before any Preview approval ask) — not written. This handoff is not that report; do not treat it as satisfying that requirement.
- **Preview**: nothing done, nothing approved. Per the brief and per `.cursor/rules`, Preview migration/deploy requires an explicit separate approval step after the full local report — this handoff does not constitute or request that approval.

## 7. Key architecture findings from this session (do not re-derive, re-verify only if suspicious)

- `apps/api` exists in the repo but is an explicit, self-documented **"LOCAL/DEV-ONLY SPIKE ENDPOINT... Not a permanent API surface"** — no Preview deployment, `LINE_OS_API_INTERNAL_URL` only ever set to `localhost:3001`. Do not route the invite feature through it without a separate, explicit decision to promote it to a real deployed service (the user already declined that option in favor of an Edge Function — §3 decision 9).
- `apps/web` → `apps/api` calling pattern exists as a precedent (`apps/web/src/lib/api/auth-boundary-smoke.ts` + `apps/api/src/auth-boundary/*`) but is itself only a spike; useful as a *shape* reference (bearer-token forwarding, safe-response mapping) for the new Edge Function's request/response contract, not as something to extend directly.
- `workforce.employees.email_encrypted` / `email_hash` **already exist** (migration 0049) — the invitation flow does NOT need its own email storage; the Edge Function decrypts the existing employee row server-side (manager-already-entered contact email = invitation email, per decision 5).
- `core.tenant_memberships.status` already has an `invited` enum value and an activate-on-accept SQL pattern already exists (currently only in the **never-committed, always-rollback** `packages/db/scripts/onboard-write.ts` dry-run tool) — `workforce.accept_employee_invitation` mirrors that exact SQL shape (see migration 0064's comments) but is the **first live (non-dry-run) identity-binding write path in this codebase**. Treat it with proportionate care in review.
- **ADR 0008 ("no SECURITY DEFINER object in `api` schema") is a real, test-enforced repo invariant**, discovered the hard way mid-session: my first draft of the accept RPC put the `SECURITY DEFINER` function directly in `api`, which broke 6 pre-existing pgTAP files that assert "api schema contains no SECURITY DEFINER function" (0002, 0005, 0006, 0008, 0009, 0012). Fixed by moving the DEFINER logic to `workforce.accept_employee_invitation` and making `api.accept_employee_invitation` a thin SECURITY INVOKER passthrough — exact same shape as `workforce.permanently_delete_employee` / `api.permanently_delete_employee` (0056), which is the canonical precedent to imitate for any future privileged RPC in this codebase.

## 8. Exact point this session stopped

Just after confirming `supabase test db` was fully green (`Files=32, Tests=785, Result: PASS`) following the ADR-0008 fix and the three grant-allow-list test updates. The user's stop instruction arrived immediately after that tool result. **No further tool calls were made after receiving the stop instruction** except read-only `git status`/`git rev-parse` calls to gather facts for this handoff, and writing this handoff file itself.

## 9. Prohibited actions (carried over from the original brief — still binding)

- No Production changes of any kind, ever, in this task.
- No Preview migration/deploy/user-creation/Auth-modification without explicit Founder approval **after** the full local implementation report (not yet written).
- Never edit historical migrations — only new forward-only ones.
- Never touch the unrelated untracked-file cluster (§5).
- Never commit QA credentials (`LocalSmoke123!` etc.) to tracked source, migrations, or fixtures.
- Never expose `service_role` to `apps/web` or any browser-reachable code.
- Never trust `tenant_id`/`employee_id` from client input for the binding step (the current RPC design already respects this — preserve it in the Edge Function too).

## 10. Recommended next step for the resuming session

1. Read this handoff fully, then re-read `supabase/migrations/0064_workforce_employee_invitations.sql` and `supabase/tests/0032_workforce_employee_invitations.sql` in full to confirm the DB layer's actual current state (don't trust this summary blindly — verify per the memory/handoff discipline of checking claims against current files).
2. Run `pnpm exec supabase db reset && pnpm exec supabase test db` locally to reconfirm green before writing any more code (state may have been correct as of stop, but always re-verify rather than assume).
3. Proceed to the Edge Function (`supabase/functions/invite-employee/` or similar name) per §6's first bullet — this is the next concrete unimplemented piece, and everything else (Manager UI, acceptance UI) depends on its request/response contract existing first.
4. Continue phases in the original brief's order (Phase 5 UI, Phase 6 stop-before-Preview report) — do not skip ahead to Preview under any circumstance without the written local-implementation report and explicit Founder approval.
