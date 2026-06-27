# Environment Variable Inventory

- Status: Active
- Phase: 1H Stage 1 — Operations Docs Foundation
- Scope: **Variable names only.** This document lists what configuration exists,
  what each variable is for, where it lives, and whether it is public or secret.

> **This file contains NO values.** Never paste a real value, key, URL, password,
> token, or JWT into this document or any committed file. Values live only in:
>
> - a **password manager** (for operator/human access), and/or
> - the **provider dashboard** (Supabase, Vercel, etc.), and/or
> - a **gitignored local file** (`apps/web/.env.local`, root `.env`, etc.).
>
> `.env.local` and other local env files remain **gitignored** and must never be
> committed.

## Legend

- **Visibility**
  - `public` — safe to ship to the browser (still relies on RLS for safety).
  - `secret` — server-only; never reaches the browser; bypasses or unlocks
    sensitive access.
- **When**
  - `now` — needed for the current phase / first clients.
  - `future` — reserved for a later module or deployment target; not required yet.

## 1. Local development

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `NODE_ENV` | Runtime mode (`development` / `test` / `production`). | Process env / host config | public | now |
| `DATABASE_URL` | Postgres connection string for server-side tooling (migrations, seed, jobs). | Root gitignored env / password manager | **secret** | now |
| `PII_ENCRYPTION_KEY` | Key for encrypting PII columns (`*_encrypted`). | Server-only secret store / password manager | **secret** | now |
| `PII_HASH_PEPPER` | Pepper for PII blind-index hashes (`*_hash`). | Server-only secret store / password manager | **secret** | now |
| `API_PORT` | Port for the local API app. | Process env (non-sensitive) | public | future |
| `WEB_ORIGIN` | Allowed web origin for the API (CORS / links). | Process env (non-sensitive) | public | future |

## 2. Supabase

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL used by the browser client. | Web app env (public) / Vercel project env | public | now |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key for the browser (safe **only with RLS**). | Web app env (public) / Vercel project env | public | now |
| `SUPABASE_URL` | Supabase project API URL for server code (`apps/api`, `apps/worker`, `packages/db`). | Server secret store / password manager | secret-adjacent (server) | now |
| `SUPABASE_ANON_KEY` | Anon key for server-side anon-context clients. | Server secret store | public-equivalent (server) | now |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** key. Bypasses RLS. **Server-only.** Never import in `apps/web`. | Server secret store / password manager | **secret** | now |
| `SUPABASE_PROJECT_REF` | Supabase project reference id (for CLI / Cloud ops). | Password manager / CI secret | secret-adjacent | future |
| `SUPABASE_DB_PASSWORD` | Database password (cannot be re-read; reset if lost). | Password manager only | **secret** | future |
| `SUPABASE_ACCESS_TOKEN` | Personal access token for CLI/CI Cloud operations. | Password manager / CI secret only | **secret** | future |

> `service_role` is server-only. An ESLint guardrail blocks reading
> `SUPABASE_SERVICE_ROLE_KEY` in the web client; do not work around it.

## 3. Vercel (future deployment)

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | Same public Supabase URL, set in the Vercel project. | Vercel project env (public) | public | future |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same public anon key, set in the Vercel project. | Vercel project env (public) | public | future |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for any server runtime (route handlers / server actions) — only if/when server writes are deployed. | Vercel project env (secret, server scope) | **secret** | future |
| Server secrets (`PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`, `DATABASE_URL`) | Required by any deployed server runtime that touches PII or the DB directly. | Vercel project env (secret, server scope) | **secret** | future |

> When deploying, set public (`NEXT_PUBLIC_*`) and secret variables in the Vercel
> dashboard. Never commit them. Scope secrets to server runtimes only.

## 4. OpenAI / AI (future)

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `OPENAI_API_KEY` | API key for the future AI module (proposals only; AI never writes business data directly). | Server secret store / provider dashboard | **secret** | future |

> Exact AI provider variable names are finalized when the AI module is built.
> Listed here so the backup/rebuild process accounts for it.

## 5. LINE (future)

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `LINE_CHANNEL_SECRET` | Secret for verifying LINE webhook signatures against the raw body. | Server secret store / provider dashboard | **secret** | future |
| `LINE_CHANNEL_ACCESS_TOKEN` | Token for calling LINE Messaging APIs. | Server secret store / provider dashboard | **secret** | future |
| `LINE_LIFF_ID` | LIFF app id (server-side reference). | Server config | public-ish | future |
| `NEXT_PUBLIC_LIFF_ID` | LIFF app id exposed to the browser. | Web app env (public) | public | future |

## 6. Backup

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `DATABASE_URL` | **Backup source** connection for the local backup tool (`pnpm db:backup`). Same variable as §1; read from env, never logged, passed to `pg_dump` via `PG*` env vars. | Root gitignored env / password manager | **secret** | now |
| `BACKUP_ENCRYPTION_KEY` | Base64-encoded **32-byte** key to encrypt backup artifacts at rest with AES-256-GCM (backups may contain PII). | Password manager / secret store only | **secret** | now |
| `BACKUP_OUTPUT_DIR` | **Optional** output folder override for encrypted backups. If omitted, the tool uses the **repo-root** `backups/` directory (gitignored), even when run via `pnpm db:backup` (cwd = `packages/db`). | Backup tooling config (non-sensitive) | public | now |
| `BACKUP_RETENTION_COUNT` | Optional number of daily backups to keep. Defaults to `7`; never below 7. | Backup tooling config (non-sensitive) | public | now |
| `BACKUP_STORAGE_TARGET` | Destination for offsite/external backup upload (decided in the DR pre-client checklist). | Backup tooling config / secret store | secret-adjacent | future |

> The local backup tool (`pnpm db:backup`) uses `DATABASE_URL`,
> `BACKUP_ENCRYPTION_KEY`, and the optional `BACKUP_OUTPUT_DIR` /
> `BACKUP_RETENTION_COUNT`. `BACKUP_OUTPUT_DIR` is optional; when omitted, the
> tool writes to the repo-root `backups/` directory. `BACKUP_STORAGE_TARGET`
> remains a placeholder until offsite/scheduled backup is built (later stage).
> Names only — never values.

## 7. Onboarding (Stage 3c-4a commit gates + backup-artifact validation; committed writes are a future stage)

> **No new environment variables** are introduced by Stage 3c-4a. The commit
> gates are CLI flags, and `--backup-artifact <path>` is a **CLI argument
> (a filesystem path), not a secret** — it is validated by file metadata only
> (existence, regular file, non-empty, `.dump.enc` name, modified within 24h) and
> is never decrypted, uploaded, or printed in full. `DATABASE_URL` is still
> required only for the DB-connected **dry-run** mode; the **commit** path in
> Stage 3c-4a is refused **before** `DATABASE_URL` is read (there is no `COMMIT`),
> so commit never connects.


| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `DATABASE_URL` | Onboarding **local dry-run transaction** source connection (same variable as §1). It is guarded (local-host + port `54322`) and, **if set** in dry-run, used by the CLI to open **one** local `pg.Client`, run `BEGIN` → load state → execute the write path → **always `ROLLBACK`**. The transaction is exercised against the real local schema but **persists zero rows**; there is **no `COMMIT`**. Read from env **only inside the transaction runner**, **never logged**, and **never** pointed at Cloud. | Root gitignored env / password manager | **secret** | now |
| `PII_ENCRYPTION_KEY` | Used by the onboarding **write path** to encrypt the owner email (`core.users.email_encrypted`). Required **only when an owner email is provided** and would be written/backfilled in the dry-run transaction. Unit tests use **synthetic** values only; a real local dry-run still rolls back and persists nothing. | Server-only secret store / password manager | **secret** | now (write path) |
| `PII_HASH_PEPPER` | Used by the onboarding **write path** for the owner email blind index (`core.users.email_hash`). Required **only when an owner email is provided** and would be written/backfilled in the dry-run transaction. Unit tests use **synthetic** values only. | Server-only secret store / password manager | **secret** | now (write path) |

> The onboarding CLI (`pnpm db:onboard-tenant`) runs a **local dry-run
> transaction**: it parses/validates inputs, guards `DATABASE_URL` (**local
> only**), and — when set in dry-run — opens one local `pg.Client`, executes the
> write path inside a transaction, and **always `ROLLBACK`s**, persisting **no
> rows** and never touching Cloud. There is **no `COMMIT`** anywhere in the write
> path, and `--commit --yes` still exits non-zero without connecting.
> `PII_ENCRYPTION_KEY` and `PII_HASH_PEPPER` are needed **only when an owner
> email would be written/backfilled**; the unit tests use **synthetic** values
> and make **no real DB connection**. `DATABASE_URL`, `PII_ENCRYPTION_KEY`, and
> `PII_HASH_PEPPER` values are **never logged or printed**, and error messages
> name the missing variable only (never its value, never the raw email). No
> **new** variable names are introduced by onboarding. Names only — never
> values.

## Rules (always)

- **Do not commit values.** Names only in this repo.
- **Store values** in a password manager and/or the provider dashboard.
- **`.env.local` (and other local env files) stay gitignored** — never commit
  them.
- Never paste secrets, DB URLs, API keys, passwords, JWTs, or refresh tokens into
  docs, chat tools, or commits.
- `service_role` and all `secret` variables are **server-only**.
