# Backup & Disaster Recovery Runbook (MVP)

- Status: Active (MVP / first real clients)
- Phase: 1H Stage 1 — Operations Docs Foundation
- Scope: Documentation only. This runbook defines policy and procedure. It does
  NOT create or run any backup script, migration, or Cloud operation.

> This document is a plan and a checklist. The backup scripts, restore
> automation, and storage target referenced here are implemented in later
> stages. Until then, treat the "future daily logical backup" steps as the
> target process, not an existing one.

## 1. MVP backup policy

| Parameter | MVP target | Notes |
| --------- | ---------- | ----- |
| Backup frequency | **Once per day** | A single daily logical backup is enough for MVP and first clients. |
| RPO (max data loss) | **Up to 24 hours** | Acceptable for MVP. Worst case = data created since the last daily backup is lost on restore. |
| RTO (time to restore service) | **~20–40 minutes** | Target for a restore-in-place recovery (see §6). |
| PITR / near-zero RPO | **Future upgrade** | Point-in-time recovery is NOT required now. It is a planned upgrade once paid infrastructure and real load justify it. |

The policy is deliberately minimal and cheap. Do not provision paid/dedicated
backup infrastructure ahead of real demand. Upgrade RPO/RTO only when client
commitments require it.

## 2. What IS covered

- **GitHub repository and migrations.** All application code, `supabase/migrations`,
  and `supabase/seed` live in Git (`tantik/line-business-os`). This is the source
  of truth for schema and app logic.
- **Supabase database** — through the **future daily logical backup** (full
  logical dump of the database). This captures tenant data across all schemas.
- **Supabase Auth DB data** — covered **only if** the full database dump includes
  the auth schema. The backup process must explicitly include it for auth users
  to be recoverable.
- **Vercel rollback path** — once a deployment exists, the previous successful
  deployment can be promoted/rolled back via Vercel. This covers bad app
  deployments without a DB restore.
- **Environment variable inventory** — the names and locations of required
  configuration are documented in `docs/operations/env-inventory.md` so a lost
  environment can be reconstructed. **Values are never stored in Git.**

## 3. What is NOT covered yet

- **Supabase Storage files / uploaded client files.** No storage backup process
  exists yet. Do not promise file recovery to clients.
- **LINE external state.** Messages, channel state, and anything held by LINE is
  outside our backup scope.
- **Third-party services.** OpenAI/AI, email, and any external provider state are
  not backed up here.
- **Unpaid / unavailable infrastructure.** Anything not yet provisioned (e.g.
  managed PITR, paid backup storage) is explicitly out of scope until adopted.

## 4. Recovery scenarios

### 4.1 Bad app deployment

Symptom: app is broken after a deploy; database is healthy.

1. Do NOT touch the database.
2. Roll back to the previous known-good Vercel deployment.
3. Verify sign-in and dashboard load.
4. Record what shipped and why it failed.

This is the fastest recovery and the most common one. No data loss.

### 4.2 Database data loss

Symptom: data is corrupted, deleted, or otherwise wrong; code/deploy is fine.

1. Stop or restrict writes if feasible to prevent further damage.
2. Identify the most recent good daily backup and confirm its timestamp.
3. Restore using the preferred strategy in §6.
4. Re-verify tenant isolation (a restored DB must still enforce RLS).
5. Communicate the RPO impact (up to 24h of data may be lost).

### 4.3 Lost local environment

Symptom: a developer/operator machine is lost or reset.

1. Re-clone the repository from GitHub.
2. Reinstall toolchain and dependencies.
3. Recreate local configuration from `docs/operations/env-inventory.md`,
   pulling actual values from the password manager / provider dashboards.
4. Never restore values from chat logs, screenshots, or unencrypted notes.

### 4.4 Full rebuild

Symptom: total loss; rebuild the platform from scratch.

Rebuild order:

1. **Code** — restore from GitHub.
2. **Configuration** — rebuild env from the inventory + secret stores.
3. **Schema** — apply `supabase/migrations` in order to a fresh database.
4. **Data** — restore the latest daily DB backup.
5. **Deploy** — redeploy the app and re-point configuration.
6. **Verify** — run the verification checklist in §7.

## 5. Backup contents & safety

- Backups can contain **PII** (encrypted PII columns, plus operational data).
  Treat every backup as sensitive.
- Backups must be **encrypted at rest** and stored in an access-controlled
  location. The storage target is decided in the pre-client checklist (§7).
- Never email, paste, or attach a database backup to chat tools.
- Backup files must never be committed to Git.

## 6. Preferred restore strategy

| Strategy | When to use | RTO impact |
| -------- | ----------- | ---------- |
| **Restore-in-place (preferred)** | The existing project/database is intact enough to accept a restore. | Fits the **20–40 minute** RTO target. |
| **New project restore** | The original project is unusable or must be replaced. | **Longer**; requires re-provisioning, re-pointing configuration, and more manual setup. Use only when restore-in-place is not possible. |

Default to **restore-in-place** to meet RTO. Choose a new-project restore only
when forced, and budget extra time for manual reconfiguration.

## 7. Pre-client checklist

Complete every item before onboarding the first real client:

- [ ] Daily backup process is defined and runnable.
- [ ] Latest backup timestamp is known and monitored.
- [ ] Backup storage target is decided (encrypted, access-controlled).
- [ ] Environment variable inventory is complete
      (`docs/operations/env-inventory.md`).
- [ ] Rollback/restore owner is known (a named person).
- [ ] A restore rehearsal is planned (dry-run a restore at least once).

## 8. Strong warnings

- **No secrets in Git.** Ever.
- **No database URLs in docs.** Do not paste connection strings anywhere in this
  repository.
- **No real user UUIDs in docs.** Use placeholders only.
- **Backups may contain PII** and must be encrypted and stored safely.
- **No API keys, passwords, JWTs, or refresh tokens** in docs, chat, or commits.

## 9. Out of scope for this stage

This runbook does NOT implement backup scripts, restore automation, scheduling,
or any Cloud operation. Those are later stages and require their own approved
tasks.
