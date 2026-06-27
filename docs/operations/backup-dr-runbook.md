# Backup & Disaster Recovery Runbook (MVP)

- Status: Active (MVP / first real clients)
- Phase: 1H Stage 1 — Operations Docs Foundation
- Scope: Documentation only. This runbook defines policy and procedure. It does
  NOT create or run any backup script, migration, or Cloud operation.

> This document is a plan and a checklist. The backup scripts, restore
> automation, and storage target referenced here are implemented in later
> stages. Until then, treat the "future daily logical backup" steps as the
> target process, not an existing one.

> **Incident detection and triage** are handled by
> `docs/operations/incident-response-runbook.md`. The **RTO clock starts when an
> incident is detected**, so monitoring is required to make the RTO target in §1
> meaningful — a daily backup alone does not help if nobody knows the product is
> down.

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

## 9. Local daily backup tool (Stage 2)

A **local, manual** encrypted backup tool is implemented for MVP. It runs
against the **local** database only and must not be pointed at Supabase Cloud
without explicit approval.

### Command

```
pnpm db:backup
```

(Equivalent: `pnpm --filter @line-os/db backup`, i.e. `tsx scripts/backup.ts`.)

### Required / optional environment (names only — never values)

- `DATABASE_URL` — backup **source** connection. Read from env, never logged, and
  passed to `pg_dump` via `PG*` env vars (never as a CLI argument).
- `BACKUP_ENCRYPTION_KEY` — base64-encoded **32-byte** key for AES-256-GCM.
- `BACKUP_OUTPUT_DIR` *(optional)* — output folder override. When unset, the tool
  writes to the **repo-root** `backups/` directory (see "Output location" below).
- `BACKUP_RETENTION_COUNT` *(optional)* — number of backups to keep; defaults to
  `7` and is **never allowed below 7**.

Values live only in a gitignored local env file / password manager — never in
Git, docs, logs, or chat.

### Prerequisites

- **PostgreSQL client tools must be installed and `pg_dump` must be on `PATH`.**
  The tool shells out to `pg_dump`; if it is missing, the backup fails fast with
  a "is it installed and on PATH?" error. Confirm with `pg_dump --version`.
- On **Windows**, the Stage 2B local smoke test used the **PostgreSQL 17
  command-line tools** (`pg_dump (PostgreSQL) 17.6`). Install the PostgreSQL
  client/command-line tools and ensure their `bin` directory is on `PATH`
  (for example `C:\Program Files\PostgreSQL\17\bin` — example only, not a
  required path).

### Output location

- The default output directory is the **repo-root** `backups/` directory. It is
  anchored to the script's own location (`packages/db/scripts/backup.ts`), not to
  the current working directory.
- This holds even when invoked via `pnpm db:backup`
  (`pnpm --filter @line-os/db backup`), which runs with cwd = `packages/db`. The
  artifact still lands in repo-root `backups/`, **not** `packages/db/backups/`.
- Set `BACKUP_OUTPUT_DIR` to override this. An explicit override is used verbatim;
  a relative override resolves against the current working directory.
- Backup artifacts are **gitignored** (`backups/`) and must never be committed.

### Format and scope

- `pg_dump -Fc` (custom/compressed format), restore-portable
  (`--no-owner --no-privileges`).
- Output is encrypted at rest: `linebos-YYYYMMDD-HHmmss.dump.enc`
  (layout: 8-byte magic+version, 12-byte IV, ciphertext, 16-byte GCM tag). The
  plaintext dump is streamed straight into the cipher and never written to disk.
- **Included schemas:** `core`, `audit`, `workforce`, `booking`, `ai`, `public`,
  `api`, and `auth` (so auth users are recoverable).
- **Excluded:** Supabase-managed/secret schemas (`vault`, `pgsodium`, `realtime`,
  `extensions`, `graphql`, `graphql_public`, `supabase_functions`,
  `supabase_migrations`, `cron`, `net`, `pgbouncer`, system catalogs).
- **Not covered:** Supabase Storage files / uploaded files (separate future
  plan — see §3).

### Retention

- Keeps a **minimum of 7** daily backups. Pruning runs **only after** a
  successful backup, touches **only** files matching the backup naming pattern,
  and never reduces retention below 7.

### Warnings

- **Do not run against Cloud** unless explicitly approved.
- **Do not restore to Cloud** without separate, explicit approval (no restore
  tooling exists yet — see §10).
- **No secrets in logs/docs/chat.** The tool prints only safe operational
  messages (start, pg_dump completed, encrypted backup written, retention
  applied, backup path) — never the DB URL, credentials, or row data.

> **TODO (pg_dump version):** The local smoke test used `pg_dump 17.6`. Before
> any production / Cloud backup, confirm the **actual Cloud Postgres version** and
> use a compatible `pg_dump` (generally `pg_dump` >= the server major version).
> Do not assume the local and Cloud Postgres versions match.

## 10. Out of scope for this stage

This runbook's Stage 2 implements only the **local manual** backup tool above.
It does NOT implement restore automation, a scheduled GitHub Actions backup,
external/offsite storage upload, or any Cloud operation. Those are later stages
and require their own approved tasks.

## 11. Forward note — backups vs. onboarding writes

- **A backup is required before any future _committed_ onboarding.** Run a fresh
  `pnpm db:backup` (see §9) and confirm the artifact before the first onboarding
  run that durably persists rows. This is a hard gate for the committed stage.
- **The onboarding dry-run stages persist nothing.** Phase 1H Stage **3c-3a**
  (write SQL builders + fake executor) makes **no DB connection** and writes
  nothing. Stage **3c-3b** (now implemented) wraps the write path in a **local
  dry-run transaction that always `ROLLBACK`s**: the writes execute against the
  local schema and are then discarded, so it leaves the database byte-identical.
  Neither stage commits (there is **no `COMMIT`**) or leaves any durable change,
  so no backup is consumed or required by them. A manual local smoke test should
  confirm before/after row counts are identical (see the onboarding runbook §9).
- Only the later **committed** onboarding stage performs durable writes; that
  stage is when the backup gate above applies.
