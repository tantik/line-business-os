# STAFF_AUTH_PROVISIONING — Final Local Gate (2026-08-14)

Follow-up to `STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT_2026-08-14.md`. Architecture unchanged and not redesigned. This pass adds empirical concurrency verification, localizes only the newly introduced Staff Auth UI copy to JA, and performs a final scope/secret audit.

## 1. Concurrency test implementation / method

No new testing framework. `packages/db/scripts/staff-auth-concurrency-check.ts` — a standalone `tsx` script using the `pg` driver (already a `packages/db` dependency) to open **two genuine, independent Postgres connections/transactions** against the local Supabase instance only (loopback-host guard, mirrors `mame-to-cha-auth.ts`'s `assertLocalSupabaseUrl` pattern — refuses to run against any non-`127.0.0.1`/`localhost` host).

Each scenario: creates its own isolated fixture rows (fresh tenant/location/manager/employee, random UUIDs), primes both connections with the real JWT-claim role-hop (`set_config('request.jwt.claims', ...)` + `set local role authenticated`, the same pattern every pgTAP file already uses), fires the two competing calls via `Promise.all` so they genuinely overlap in wall-clock time and let Postgres's own row-level locking arbitrate the real interleaving, then — critically — **inspects final database state directly via SQL**, not just which call returned success/error, then deletes its own fixture rows. Run via:

```
pnpm --filter @line-os/db exec tsx scripts/staff-auth-concurrency-check.ts
```

Run **6 times total** across this session (once during development, 5 back-to-back repeats to check for nondeterminism, once more as part of the final gate in §8) against fresh `db reset` state at least twice. All runs: all invariants held, zero failures.

## 2. Results — A. accept + accept on the same pending invitation

Two connections, both authenticated as the same invited person, both call `api.accept_employee_invitation` on the same pending invitation simultaneously.

**Observed across all runs:** exactly one call succeeds, the other fails with `invitation_not_acceptable` (the loser sees `status <> 'pending'` after the winner's row-lock releases). **Which** of the two connections wins was genuinely nondeterministic across repeated runs (verified: call 1 won in some runs, call 2 in others — real lock contention, not an artifact of dispatch order).

**Final-state invariants verified, every run:**
- exactly one accept succeeded (the other failed)
- the invitation is `accepted` exactly once (`accepted_at` set exactly once, never overwritten)
- `workforce.employees.user_id` bound to the person exactly once, deterministically
- exactly one **active** `core.tenant_memberships` row for (tenant, person)
- exactly one `core.role_assignments` row for (tenant, person, employee role) — no duplicate grant

## 3. Results — B. invite/upsert + invite/upsert for the same employee

Two connections, both authenticated as the Manager, both call `api.upsert_employee_invitation` for the same unbound employee simultaneously, each with a **different** target user id and invitation id (simulating two near-simultaneous Invite/Resend clicks that each independently resolved a target via the Edge Function's own Auth Admin API call).

**Observed:** one call succeeds (inserts), the other fails with Postgres `23505` (unique-violation on `workforce_employee_invitations_one_pending_per_employee`) — the loser's `select ... for update` found no row yet (nothing to wait on), so both raced to `INSERT` and the database's own unique index was the final arbiter.

**Final-state invariants verified, every run:**
- **never more than one row** in `workforce.employee_invitations` for this employee (the exact named invariant from the brief) — confirmed by direct `select` after both calls settled
- the surviving row's outcome was either "both calls safely converged on one row" or "the loser failed with exactly `23505`, never any other error code" — verified explicitly, not merely "no crash"

## 4. Results — C. accept + revoke collision

Two connections: one authenticated as the invited person calling `api.accept_employee_invitation`; the other authenticated as the Manager issuing the exact `UPDATE api.workforce_employee_invitations SET status='revoked', revoked_at=now() WHERE invitation_id=...` the Manager UI itself sends. Run in **both dispatch orders** (accept-issued-first and revoke-issued-first) to try to exercise both possible winners.

**Observed:** in every run, in both dispatch orders, **accept won** — its `select ... for update` consistently acquired the row lock before the view-mediated `UPDATE` did, at this data scale. Revoke's `UPDATE` matched 0 rows in every observed run (the row was no longer `pending` by the time it evaluated its predicate) and returned cleanly, never erroring.

**Final-state invariants verified, every run:**
- final invitation status is exactly one of `accepted`/`revoked` — never both, never neither
- (accept-won path, the only one empirically observed): employee is bound; revoke affected exactly 0 rows (lost cleanly — it never overwrote an already-accepted row, no partial/corrupted state)

**Honest gap, not glossed over:** the "revoke wins" branch's specific final-state assertions (`employee is NOT bound`, `no active tenant membership was granted`) are written into the script and would run if revoke ever won, but were **not empirically exercised** in these runs — accept's query is consistently faster at this scale regardless of dispatch order. This is not a defect: the revoke predicate's correctness (`status = 'pending'` required, 0-row no-op otherwise) is independently proven by the existing `0032`/`0033` pgTAP suites (a revoke against a non-pending row affects 0 rows), so the logical guarantee is covered even though this specific empirical interleaving wasn't observed. Flagged in §12 as a residual risk rather than claimed as fully closed.

## 5. Exact final-state invariants observed (summary)

All of the brief's required invariants were checked against **actual post-hoc database state**, not returned errors alone, and held in every run:

- never more than one accepted binding (A)
- never duplicate pending invitation rows (B)
- `workforce.employees.user_id` remains deterministic (A, C)
- no cross-tenant/same-tenant double-bind was exercisable in these scenarios by construction (each fixture is a fresh, isolated tenant) — the structural guarantee (0063's unique index) is unchanged and already covered by `0031`'s pgTAP
- invitation state remains internally consistent (status/accepted_at/revoked_at never contradict each other, checked directly in A and C)
- no partial membership/role/employee binding state (A: membership+role+bind are all-or-nothing per winner; C: revoke-won path's own assertions, written but not empirically triggered — see §4)
- the losing concurrent operation always failed safely: a named, expected error (`invitation_not_acceptable`, `23505`) or a clean 0-row no-op — never a crash, never a partial write, never an unhandled exception propagating out of the database

**No race-condition defect was found.** No architectural change was made. The scripts and any fixes required were purely additive verification.

## 6. JA UI changes (new Staff Auth controls only)

Existing Manager dashboard copy is unchanged (per the prior report's own documented scope decision). Localized exactly the newly introduced concepts and their copy:

| File | Change |
|---|---|
| `manager-dashboard-client.tsx` | Column header `Access` → `アクセス` |
| `invitation-cell.tsx` | `Active access`→`アクセス有効`, `Invited`→`招待中`, `Expired`→`期限切れ`, `Invite`→`招待する`, `Resend`→`再送信`, `Revoke`→`取り消す`, `Sending...`→`送信中…`, revoke confirm dialog→`この招待を取り消しますか？`, all invite/revoke error copy → JA |
| `AcceptInvitationButton.tsx` | Error copy → JA (was already partly JA; removed an English pass-through fallback) |
| `SetPasswordForm.tsx` | Error copy → JA (same fix) |

**One correctness fix bundled into this localization pass** (not a redesign): all four components previously did `result.message ?? '<JA fallback>'` — i.e., on error they would display whichever came first, and the underlying `message` field (produced by this codebase's *shared*, English-only `pg-error.ts` mapper or by the action layer's own guard clauses) would win, silently producing **mixed-language errors** in a supposedly JA-first flow. Every one of these four call sites now displays fixed JA copy per status and never surfaces the underlying English `message` string. This does not touch `pg-error.ts` itself or any other screen that uses it.

## 7. Files changed by this final pass

New:
```
packages/db/scripts/staff-auth-concurrency-check.ts
docs/ai/STAFF_AUTH_PROVISIONING_FINAL_LOCAL_GATE_2026-08-14.md   (this file)
```
Modified:
```
packages/db/package.json                                          (new script entry)
apps/web/src/app/(protected)/dashboard/workforce/manager/manager-dashboard-client.tsx   (アクセス header)
apps/web/src/app/(protected)/dashboard/workforce/manager/invitation-cell.tsx            (JA copy)
apps/web/src/components/workforce/AcceptInvitationButton.tsx                            (JA copy, dropped English fallback)
apps/web/src/app/auth/accept-invite/set-password/SetPasswordForm.tsx                    (JA copy, dropped English fallback)
```
(`invitation-cell.tsx` and the `apps/web/src/app/auth/`/`apps/web/src/components/workforce/` directories were already untracked/new from the prior local-implementation pass; they remain untracked, just with their content changed.)

## 8. Complete final test counts / results

- **pgTAP**: `Files=35, Tests=816, Result: PASS` (fresh `db reset` immediately before this run).
- **Concurrency check**: 4 scenario-runs (A, B, C×2 dispatch orders) this final pass, 0 failures; 6 total runs across the whole session, 0 failures ever observed.
- **apps/web (`node --test`)**: `tests 991, pass 991, fail 0`.

## 9. Typecheck / lint / build results

- `pnpm --filter @line-os/web typecheck` → exit 0, clean.
- `pnpm --filter @line-os/db typecheck` → exit 0, clean (covers the new concurrency script).
- `pnpm --filter @line-os/web lint` → exit 0, clean.
- `pnpm --filter @line-os/db lint` → exit 0, clean.
- `pnpm --filter @line-os/web build` → succeeded; `/auth/accept-invite` and `/auth/accept-invite/set-password` present in the route manifest, no new warnings.

## 10. Git diff scope classification

**Modified (tracked):**

| File | Classification |
|---|---|
| `apps/web/package.json` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/app/(protected)/dashboard/workforce/manager/manager-dashboard-client.tsx` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/app/(protected)/dashboard/workforce/manager/page.tsx` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/app/(protected)/layout.tsx` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/lib/workforce/employees.test.ts` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/lib/workforce/employees.ts` | STAFF_AUTH_PROVISIONING |
| `packages/db/package.json` | STAFF_AUTH_PROVISIONING |
| `supabase/config.toml` | STAFF_AUTH_PROVISIONING |
| `supabase/tests/0002_security_rls.sql` | STAFF_AUTH_PROVISIONING |
| `supabase/tests/0006_api_has_permission.sql` | STAFF_AUTH_PROVISIONING |
| `supabase/tests/0008_workforce_staff_recipes_rls.sql` | STAFF_AUTH_PROVISIONING |
| `supabase/tests/0009_workforce_api_facade.sql` | STAFF_AUTH_PROVISIONING |
| `supabase/tests/0013_workforce_cafe_write_facade.sql` | STAFF_AUTH_PROVISIONING |

**Untracked (new):**

| Path | Classification |
|---|---|
| `-` | PRE_EXISTING_UNRELATED |
| `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md` | PRE_EXISTING_UNRELATED |
| `apps/web/src/app/(protected)/dashboard/workforce/manager/invitation-cell.tsx` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/app/auth/` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/components/workforce/` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/lib/workforce/invitation-actions.ts` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/lib/workforce/invitations.test.ts` | STAFF_AUTH_PROVISIONING |
| `apps/web/src/lib/workforce/invitations.ts` | STAFF_AUTH_PROVISIONING |
| `docs/AI_PLAYBOOK.md` | PRE_EXISTING_UNRELATED |
| `docs/QA_ACCESS.md` | PRE_EXISTING_UNRELATED |
| `docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md` | STAFF_AUTH_PROVISIONING |
| `docs/ai/STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT_2026-08-14.md` | STAFF_AUTH_PROVISIONING |
| `docs/ai/STAFF_AUTH_PROVISIONING_FINAL_LOCAL_GATE_2026-08-14.md` | STAFF_AUTH_PROVISIONING |
| `docs/architecture/engineering-decisions.md` | PRE_EXISTING_UNRELATED |
| `docs/product/cafe-*.md` (9 files) | PRE_EXISTING_UNRELATED |
| `icon/` | PRE_EXISTING_UNRELATED |
| `packages/db/scripts/staff-auth-concurrency-check.ts` | STAFF_AUTH_PROVISIONING |
| `packages/db/src/types.generated.ts` | PRE_EXISTING_UNRELATED *(see note below)* |
| `supabase/functions/` | STAFF_AUTH_PROVISIONING *(contains `.env` — gitignored, see §11)* |
| `supabase/migrations/0060_workforce_recipe_tenant_wide_update_fix.sql` | PRE_EXISTING_UNRELATED |
| `supabase/migrations/0062`–`0067` (6 files) | STAFF_AUTH_PROVISIONING |
| `supabase/tests/0028_workforce_recipe_tenant_wide_update.sql` | PRE_EXISTING_UNRELATED |
| `supabase/tests/0030`–`0035` (6 files) | STAFF_AUTH_PROVISIONING |

**SUSPICIOUS_REVIEW_REQUIRED: none.**

**Note on `packages/db/src/types.generated.ts`**: pre-existing/untouched per the standing instruction, but it is now factually **stale** relative to schema (0065–0067 added a view, an RPC, and a column that this generated-types file does not know about). Not regenerated this session because doing so would modify a file on the explicit do-not-touch list. Flagging so it isn't mistaken for "already handled" — regenerating it (`pnpm db:onboard-tenant`-adjacent `gen:types` script) is a reasonable pre-Git step for the Founder to authorize separately, since it's a pure codegen refresh, not hand-written.

## 11. Secret / credential audit result

**Clean.** Specifically checked:
- `grep`-searched every STAFF_AUTH_PROVISIONING file (new + modified) for the throwaway smoke-test values generated/used during live verification in the prior session (a base64 PII key, two smoke-test passwords, a ciphertext hex blob, any `eyJ...` JWT) — the **only** match anywhere in the working tree is `supabase/functions/.env`, and `git status --porcelain --ignored=matching supabase/functions/` confirms it as `!!` (ignored), with `git check-ignore -v` resolving it to `.gitignore:15 .env`. It will not be picked up by `git add .` or any other broad-add.
- `supabase/functions/.env.example` (tracked-intended) contains only placeholder text (`replace-with-...`), no real value.
- No hardcoded password, service-role key, invitation token, or ciphertext appears in any `.ts`/`.tsx`/`.sql`/`.md` file that would be committed.
- `packages/db/scripts/staff-auth-concurrency-check.ts`'s default connection string (`postgres:postgres@127.0.0.1:54322`) is the well-known, publicly documented local Supabase CLI default — not a secret, and the script fails closed (throws) against any non-loopback host before issuing a single query.
- The two `eyJ...`-matching hits found via a broader repo grep are `apps/web/.env.local` (pre-existing, gitignored, standard local dev anon key) and `.next/` build cache artifacts (gitignored, ephemeral) — neither is new, neither would be committed, neither was touched this session.

## 12. Remaining risks

Carried over from the prior report, updated:

1. ~~Concurrency reasoning is analytical, not empirically tested~~ → **now empirically tested** (§2–5); residual: the "revoke wins" specific final-state branch in scenario C was written but never empirically triggered in 6 runs (§4) — the underlying guarantee is still covered by existing pgTAP, but a true empirical observation of that exact interleaving remains open if the team wants it closed completely (e.g. by artificially slowing one query, which would then be testing an artificial scenario rather than real timing).
2. Edge Function still has no automated regression test (unchanged from prior report — out of scope for this pass, which was DB-level concurrency, not Edge Function testing).
3. i18n: the *new* Staff Auth controls are now fully JA (this pass closes that gap); the surrounding Manager dashboard remains English by design, unchanged from the prior report's documented scope call.
4. `packages/db/src/types.generated.ts` is now stale relative to the new schema (§10 note) — cosmetic/DX only, does not affect runtime correctness (nothing in this diff imports from it for the new tables/views).
5. Preview-specific items from the prior report (§24.4–6 there: Preview secrets, Supabase invite-link TTL confirmation, `inviteUserByEmail` resend semantics on Cloud) are unchanged and still open.

## 13. Final recommendation

**READY_FOR_GIT.**

No race-condition defect was found; no architectural change was made or needed. The one behavioral fix bundled into this pass (dropping the English-message pass-through in four new UI components, §6) is a correctness fix within the already-approved architecture, not a redesign. All local gates are green: pgTAP 816/816, concurrency invariants held across 6 runs (0 failures), apps/web tests 991/991, typecheck/lint clean in both affected packages, production build succeeds. The git diff/status audit found no `SUSPICIOUS_REVIEW_REQUIRED` file and no credential/secret that would enter a future commit. Nothing has been committed, pushed, or merged — that step is intentionally left for explicit Founder authorization.
