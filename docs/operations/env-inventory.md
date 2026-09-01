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
  - `reserved` — declared in code but with no current consumer; kept on purpose.

## 0. Ownership, trust boundaries, and scope of this document

**Trust categories** (each active variable belongs to exactly one):

| Category | Meaning | Lives in |
| -------- | ------- | -------- |
| **Public / browser** | `NEXT_PUBLIC_*` — inlined into the client bundle by Next.js. Never a secret. | `apps/web/.env.local` (local) / Vercel public scope |
| **Server application** | Server-only, non-secret configuration (ports, origins, provider selectors, feature flags). | `apps/web/.env.local` server scope / apps/api process env / Vercel server scope |
| **Privileged server secret** | RLS-bypassing keys, DB credentials, PII keys, LINE secrets, provider API keys. | repo-root `.env` + operator shell / password manager; Vercel server scope only if a runtime that needs them is deployed |
| **Edge Function secret / config** | Consumed by hosted Edge Functions. | Supabase function secrets / `supabase/functions/.env` (local) |
| **Operator / local tooling** | Credentials/config used only by local admin scripts (migrations, seed, backup, fixtures, smoke). No deployed app runtime reads them. | operator shell / password manager only |
| **CI / build** | Required by CI/build/test only. **Currently none** — `.github/workflows/ci.yml` runs with no env and no secrets; tests use synthetic inline values. | — |

**Intentional public/server name splits** (same value, two names — this is by
design, not duplication; do **not** rename to unify):

- `SUPABASE_URL` (server, read by `serverEnv()` for `packages/db` operator
  scripts and `apps/api`/`apps/worker`) vs `NEXT_PUBLIC_SUPABASE_URL` (browser,
  inlined by Next.js). Next.js only inlines a value into the client bundle when
  the name carries the `NEXT_PUBLIC_` prefix, so each trust surface needs its
  own name.
- `SUPABASE_PUBLISHABLE_KEY` (server) vs `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (browser) — same rationale. Both are the low-privilege `sb_publishable_*`
  value; it is never a secret and never bypasses RLS.

**`SITE_URL` vs `WEB_ORIGIN`** (related but distinct; **not** renamed here):

- `SITE_URL` — the URL a Supabase invite email's verification link redirects
  back to. Read by the Edge Functions (`invite-employee`) and mirrored by
  `supabase/config.toml` `[auth] site_url` for local dev.
- `WEB_ORIGIN` — the allowed web origin for `apps/api` (CORS / link building),
  read by `serverEnv()`. `apps/api` is not deployed yet.
- They often hold the same value locally but have different owners and
  consumers; unifying them is deferred to a future deployment-hardening task.

**Scope of this document / repository ENV cleanup.** This file and the
repository ENV cleanup cover **tracked repository surfaces only**
(`.env.example`, `turbo.json`, `supabase/functions/.env.example`, docs). They
do **not** resolve:

- **Local operator ENV drift** — gitignored files on an operator machine
  (`.env`, `.env.local`, `.env.cloud.local`, `apps/web/.env.local*`,
  `supabase/functions/.env`, stale `*.backup` / `*.cloud-backup*` files).
  Reconciling those is a **separate, controlled operator-local task (Step 3B)**,
  never in a repository PR. Step-3B state (operator machine, 2026-09):
  - Normal local `apps/web` development targets the **LOCAL Supabase stack**
    (`pnpm db:start`), per `README.md`. `apps/web/.env.local` requires exactly
    `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (values
    from `supabase status` — the local demo stack output, regenerated on
    restart, not secrets). The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is
    obsolete (Phase 9) and must not appear. `VERCEL_OIDC_TOKEN` is not ORUWA
    config — the Vercel CLI re-establishes it if ever needed.
  - `apps/web/.env.local` reconciled to that shape; two obsolete dated
    `apps/web/.env.local.cloud-backup-2026063*` copies removed.
  - `apps/web/.env.local.cloud-backup` (non-dated) targets **Cloud DEV** and is
    **REPLACE PENDING 3C** — obtaining/validating the current Cloud DEV
    publishable config belongs with external verification.
  - `.env.local.backup` deletion is **BLOCKED** pending proven `PII_ENCRYPTION_KEY`
    / `PII_HASH_PEPPER` recovery (no PASS/FAIL PII smoke exists; values not
    inspectable safely).
  - Root `.env.local` and `.env.cloud.local` stay **deferred with the non-cloud
    Mame reconciliation** (their names feed only deferred `mame-to-cha-*` tooling;
    `MAME_TO_CHA_CLOUD_DATABASE_URL` is still read — fallback-only — by
    `mame-to-cha-showcase.ts`).
  - `apps/web/.env.translation-script.local` cleanup is **deferred** (translation
    generation is not on any active canonical step). Currently configured
    provider category = `google` (name only; no credential value recorded).
  - Local `supabase/functions/.env` is **incomplete** relative to
    `supabase/functions/.env.example` (missing `PII_HASH_PEPPER`,
    `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`). Local Edge development
    is deferred, so this does **not** block Step 3B.
- **External environment verification** — Vercel Preview/Production and Supabase
  Cloud DEV/Production variable sets. A **separate future gate (Step 3C)**;
  Production untouched.

## 1. Local development

> **Generic ORUWA server/operator secret store = repo-root `.env`.** The
> tenant-neutral server/operator variables below (and the Supabase server
> variables in §2) live in the gitignored repo-root **`.env`**, created from
> `.env.example`. Nothing loads it automatically — `serverEnv()` reads
> `process.env` — so the operator loads it into the shell themselves (e.g. a
> dot-sourced `.env`, or exporting the values from a password manager) before
> running `pnpm --filter @line-os/db …`. **Cloud DEV operator runs use the same generic
> variable names** with Cloud DEV values (see `docs/supabase-cloud-dev-setup.md`).
>
> Repo-root `.env.local` is **deprecated non-cloud Mame To Cha pilot/rehearsal
> tooling** (`MAME_TO_CHA_LOCAL_*`) — not a generic ORUWA operator env file. Do
> not add generic variables to it or extend it; it is a deletion candidate
> pending a generic-fixture/onboarding reconciliation. The Cloud-specific Mame
> To Cha tooling (`packages/db/scripts/mame-to-cha-cloud-*`) and its
> `.env.cloud.local` / `MAME_TO_CHA_CLOUD_*` vars were removed Sept 2026.
> `apps/web/.env.local` is the separate web-app env and never holds a
> privileged key.

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `NODE_ENV` | Runtime mode (`development` / `test` / `production`). | Process env / host config | public | now |
| `DATABASE_URL` | Postgres connection string for server-side tooling (migrations, seed, jobs). | Repo-root `.env` (gitignored) / password manager | **secret** | now |
| `PII_ENCRYPTION_KEY` | Key for encrypting PII columns (`*_encrypted`). | Server-only secret store / password manager | **secret** | now |
| `PII_HASH_PEPPER` | Pepper for PII blind-index hashes (`*_hash`). | Server-only secret store / password manager | **secret** | now |
| `API_PORT` | Port for the local API app. | Process env (non-sensitive) | public | future |
| `WEB_ORIGIN` | Allowed web origin for the API (CORS / links). | Process env (non-sensitive) | public | future |

## 2. Supabase

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL used by the browser client. | Web app env (public) / Vercel project env | public | now |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Required** low-privilege browser API key — one `sb_publishable_*` value (current model). Safe **only with RLS**. The public env resolver requires it and fails closed if unset. | Web app env (public) / Vercel project env | public | now |
| `SUPABASE_URL` | Supabase project API URL for server code (`apps/api`, `apps/worker`, `packages/db`). | Repo-root `.env` (gitignored) / password manager | secret-adjacent (server) | now |
| `SUPABASE_PUBLISHABLE_KEY` | **Required** low-privilege server API key — one `sb_publishable_*` value. Sent alongside the caller JWT by `createUserClient()`; RLS still applies. `serverEnv().supabaseUserKey` requires it and fails closed if unset. | Repo-root `.env` (gitignored) | public-equivalent (server) | now |
| `SUPABASE_SECRET_KEY` | **Required** privileged (RLS-bypassing) Supabase key — one `sb_secret_*` value (current model). **Server-only.** Never import in `apps/web`. `serverEnv()` requires it and fails closed if unset. | Server secret store / password manager | **secret** | now |
| `SUPABASE_SECRET_KEYS` | Edge-Functions-only: JSON object of `sb_secret_*` keys that Supabase injects into a hosted function; the `_shared/supabase-secret-key.ts` resolver **requires** the `"default"` entry (no legacy fallback). Not read by any Node/Vercel/CI code. | Supabase Edge Function secrets (managed) | **secret** | now |
| `SUPABASE_PUBLISHABLE_KEYS` | Edge-Functions-only: JSON object of `sb_publishable_*` keys Supabase injects into a hosted function; the `_shared/supabase-publishable-key.ts` resolver **requires** the `"default"` entry for the user-scoped client (caller JWT still the identity; RLS unchanged; no legacy fallback). Not read by any Node/Vercel/CI code. | Supabase Edge Function env (auto-injected) | public-equivalent | now |

> **Legacy retired (Phase 9, Sept 2026):** `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
> `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are no longer read by any
> active ORUWA runtime/tooling and were removed from the schemas /
> `.env.example` / `turbo.json`. Cloud DEV's legacy JWT-based API keys are
> disabled. (The remaining non-cloud `MAME_TO_CHA_LOCAL_*` deprecated pilot
> tooling still names its own separate legacy vars — untouched, deferred for
> deletion. The Cloud-specific `MAME_TO_CHA_CLOUD_*` tooling was removed Sept
> 2026.)
| `SUPABASE_PROJECT_REF` | Supabase project reference id (for CLI / Cloud ops). | Password manager / CI secret | secret-adjacent | future |
| `SUPABASE_DB_PASSWORD` | Database password (cannot be re-read; reset if lost). | Password manager only | **secret** | future |
| `SUPABASE_ACCESS_TOKEN` | Personal access token for CLI/CI Cloud operations. | Password manager / CI secret only | **secret** | future |

> `service_role` is server-only. An ESLint guardrail blocks reading
> `SUPABASE_SERVICE_ROLE_KEY` in the web client; do not work around it.

## 3. Vercel (future deployment)

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | Same public Supabase URL, set in the Vercel project. | Vercel project env (public) | public | future |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same public publishable key, set in the Vercel project. | Vercel project env (public) | public | future |
| `SUPABASE_SECRET_KEY` | Server-only key for any server runtime (route handlers / server actions) — only if/when server writes are deployed. **Founder-verified 2026-08: no privileged key is set in the current Vercel project** (Preview uses the publishable key + RLS only), so the key migration requires no Vercel change. | Vercel project env (secret, server scope) | **secret** | future |
| Server secrets (`PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`, `DATABASE_URL`) | Required by any deployed server runtime that touches PII or the DB directly. | Vercel project env (secret, server scope) | **secret** | future |

> When deploying, set public (`NEXT_PUBLIC_*`) and secret variables in the Vercel
> dashboard. Never commit them. Scope secrets to server runtimes only.

## 4. OpenAI / AI (future) and content translation (apps/web, now)

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `OPENAI_API_KEY` | API key for `apps/web`'s recipe content-translation provider (`OpenAIContentTranslationProvider`) **and**, later, the separate future AI module (proposals only; AI never writes business data directly). Same variable name, two independent consumers in two different Vercel projects/deployments -- not a shared runtime value, just a shared name. Read only in `apps/web/src/lib/content/translation-env.ts`; **never** `NEXT_PUBLIC_`-prefixed, never reachable from a `'use client'` file (enforced by a repo-wide scan test). | Server secret store / Vercel project env (Preview, server-only) / provider dashboard | **secret** | now (translation) / future (AI module) |
| `CONTENT_TRANSLATION_PROVIDER` | Explicit selector for `apps/web`'s recipe translation provider -- `deepl`, `openai`, or `google`. No fallback based on "whichever key happens to be set"; unset or unsupported means auto-translation is off (Manager can still translate manually). No code-level default provider -- an unset value always means manual-only. | Vercel project env (Preview) | public-ish (not a secret, but server-read only) | now |
| `OPENAI_TRANSLATION_MODEL` | Overrides the default OpenAI chat-completions model (`gpt-4o-mini`) used for recipe translation. Optional. | Vercel project env (Preview) | public-ish | now |
| `DEEPL_API_KEY` | API key for `apps/web`'s recipe content-translation provider (`DeepLContentTranslationProvider`), when `CONTENT_TRANSLATION_PROVIDER=deepl`. Server-only, never `NEXT_PUBLIC_`. | Server secret store / Vercel project env (Preview, server-only) | **secret** | now |
| `DEEPL_API_URL` | Optional override of the DeepL endpoint (defaults to the free/pro endpoint resolved from the key format). Read **now** by `apps/web/src/lib/content/translation-env.ts`. | Vercel project env (Preview) | public-ish | now (optional) |
| `GOOGLE_TRANSLATE_API_KEY` | API key for `apps/web`'s recipe content-translation provider (`GoogleContentTranslationProvider`, Google Cloud Translation API Basic v2), when `CONTENT_TRANSLATION_PROVIDER=google`. Server-only, never `NEXT_PUBLIC_`, never reachable from a `'use client'` file (enforced by the same repo-wide scan test); sent via the `x-goog-api-key` request header, never as a URL query parameter. | Server secret store / Vercel project env (Preview, server-only) | **secret** | now |
| `CONTENT_TRANSLATION_AUTO_ENABLED` | Kill switch for automatic translation regardless of provider config (`false`/`0` disables it). Defaults to enabled. | Vercel project env (Preview) | public-ish | now |

> Exact AI-module provider variable names (beyond reusing `OPENAI_API_KEY`) are
> finalized when that module is built. Listed here so the backup/rebuild
> process accounts for it, and so the AI module's implementer knows this name
> is already in use by `apps/web`'s translation feature.

## 5. LINE (future)

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `LINE_CHANNEL_SECRET` | Secret for verifying LINE webhook signatures against the raw body. | Server secret store / provider dashboard | **secret** | future |
| `LINE_CHANNEL_ACCESS_TOKEN` | Token for calling LINE Messaging APIs. | Server secret store / provider dashboard | **secret** | future |
| `LINE_LIFF_ID` | LIFF app id, server-side reference. **RESERVED / CURRENTLY UNUSED** — declared `.optional()` in the `serverEnv()` schema (`packages/config/src/env.ts`) but **no code consumer**; the browser path uses `NEXT_PUBLIC_LIFF_ID`. Kept deliberately for the planned LINE/LIFF server integration (Founder/CTO decision 2026-09) rather than removed-and-later-reintroduced. | Server config | public-ish | reserved |
| `NEXT_PUBLIC_LIFF_ID` | LIFF app id exposed to the browser. Read via direct `process.env.NEXT_PUBLIC_LIFF_ID` in `apps/web/src/app/liff-entry/page.tsx` and inlined into the client bundle by Next.js (hence in `turbo.json` `globalEnv`). The `liff-entry` flow renders a "not configured" state when unset. | Web app env (public) | public | now (feature gated off) |

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

## 7. Onboarding (Stage 3c-4b local-only committed onboarding)

> **No new environment variables** are introduced by Stage 3c-4b. The commit
> gates are CLI flags, and `--backup-artifact <path>` is a **CLI argument
> (a filesystem path), not a secret** — it is validated by file metadata only
> (existence, regular file, non-empty, `.dump.enc` name, modified within 24h) and
> is never decrypted, uploaded, or printed in full. The **local commit** path
> uses the same `DATABASE_URL` as the dry-run: it is read **only inside the
> commit runner**, **after** the backup artifact passes, and is **guarded as
> local** (loopback host + port `54322`) **before any connection**. A non-local /
> Cloud-like `DATABASE_URL` fails **before** connecting; commit never touches
> Cloud.


| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `DATABASE_URL` | Onboarding **local transaction** source connection (same variable as §1), used by both the **dry-run** (always `ROLLBACK`) and the **local commit** path (Stage 3c-4b). It is guarded (local-host + port `54322`) **before** any connection. In commit mode the CLI opens **one** local `pg.Client`, runs `BEGIN` → load state → execute the write path → write changed-only audit rows → **`COMMIT` only when something changed** (an all-reuse run `ROLLBACK`s as a no-op). Read from env **only inside the runner**, **never logged**, **never** pointed at Cloud. | Root gitignored env / password manager | **secret** | now |
| `PII_ENCRYPTION_KEY` | Used by the onboarding **write path** to encrypt the owner email (`core.users.email_encrypted`). Required **only when an owner email is provided** and would be written/backfilled (in dry-run or commit). Unit tests use **synthetic** values only and make no real DB connection. | Server-only secret store / password manager | **secret** | now (write path) |
| `PII_HASH_PEPPER` | Used by the onboarding **write path** for the owner email blind index (`core.users.email_hash`). Required **only when an owner email is provided** and would be written/backfilled (in dry-run or commit). Unit tests use **synthetic** values only. | Server-only secret store / password manager | **secret** | now (write path) |

> The onboarding CLI (`pnpm db:onboard-tenant`) runs either a **local dry-run
> transaction** (always `ROLLBACK`) or, when **all** Stage 3c-4a gates pass
> (`--commit --yes --i-understand-this-writes-local-db --target local
> --backup-artifact <path>`), a **local committed transaction**. Order of
> precedence for commit: validate gates → validate the backup artifact → read +
> guard `DATABASE_URL` (local only) → prepare owner PII → connect → transact.
> `PII_ENCRYPTION_KEY` and `PII_HASH_PEPPER` are needed **only when an owner
> email would be written/backfilled**, and their absence fails **before** any
> connection. The backup artifact is a **CLI path**, never an env variable.
> `DATABASE_URL`, `PII_ENCRYPTION_KEY`, and `PII_HASH_PEPPER` values are **never
> logged or printed**, and error messages name the missing variable only (never
> its value, never the raw email, never the DB URL). No **new** variable names
> are introduced by onboarding. Names only — never values.

### Stage 3d (first real local owner onboarding) — env clarifications

Stage 3d is documentation/procedure only and introduces **no new environment
variables**. For the first real local owner onboarding procedure (see
`docs/operations/client-onboarding-runbook.md` §12):

- **No new env vars** are added or required by Stage 3d.
- `DATABASE_URL` is the **local** connection used by both the backup tool
  (`pnpm db:backup`) and the onboarding commands (`pnpm db:onboard-tenant`,
  dry-run and gated local commit). It is read from env, guarded as local
  (`127.0.0.1:54322`), and **never logged**.
- `BACKUP_ENCRYPTION_KEY` is **required to create the backup** (`pnpm db:backup`).
  The committed onboarding run does **not** read or need this key — it only
  validates the artifact's file metadata.
- `PII_ENCRYPTION_KEY` / `PII_HASH_PEPPER` are **not required** for the first
  real local run because the **owner email is omitted** (no PII is written). They
  are needed only when an owner email is supplied (a later, separate stage).
- The **backup artifact path is a CLI argument** (`--backup-artifact <path>`),
  **not an environment variable**, and is never a secret.

### Stage 3e (first real local owner onboarding executed) — env clarifications

Stage 3e **executed** the first real local owner onboarding (see
`docs/operations/client-onboarding-runbook.md` §13) and introduces **no new
application environment variables**. It does surface two **local runtime
configuration** facts and a set of **temporary** shell values that must be
cleared after a run. As always: **names only — never values**.

**Local PostgREST (Data API) runtime config — exposure boundary.** These control
which schemas the **local** Supabase Data API exposes. The app-facing Data API
must expose **only** the safe `api` facade (plus `public`); internal schemas
(`core`, `audit`, `workforce`, `booking`, `ai`) must remain internal.

| Variable | Purpose | Correct local value (Stage 3e) | Visibility | When |
| -------- | ------- | ------------------------------ | ---------- | ---- |
| `PGRST_DB_SCHEMAS` | Schemas the local Data API exposes. Must be the safe facade only. | `public,api` | public (local config) | now (local) |
| `PGRST_DB_EXTRA_SEARCH_PATH` | Extra Postgres search path for the local Data API. | `public` | public (local config) | now (local) |

> **Stale-state warning (Stage 3e finding).** A **stale/wrong** local runtime was
> observed exposing internal schemas through the Data API:
> `PGRST_DB_SCHEMAS=public,core,audit,workforce,booking,ai`. This is a
> misconfiguration — internal schemas must **not** be reachable via the Data API.
> Fix it by restarting the local Supabase stack (`npx supabase stop` then
> `npx supabase start`) so the correct schema exposure reloads. These are
> **local-only** runtime settings; they are not app secrets and carry no values
> here.

**Local vs Cloud web env (verify before testing).** Confirm
`NEXT_PUBLIC_SUPABASE_URL` points at the intended target by inspecting the
**host only** — **never print the anon key**. During Stage 3e the web env was
temporarily pointed at local for verification and then **restored to Cloud** from
`apps/web/.env.local.cloud-backup` (a gitignored local backup of the env file;
not committed, contains no values in Git).

**Key-type clarity (Stage 3e finding).** For local Auth + Data API checks, use
the **publishable** key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` /
`SUPABASE_PUBLISHABLE_KEY`). Do **not** use the **Storage Access Key** (wrong
key type) and **never** use the privileged `SUPABASE_SECRET_KEY` for onboarding
or app-facing reads.

**Temporary shell values to clear after a run.** These are set only for the
duration of a local onboarding run and must be cleared afterward. They hold
sensitive material or run-specific identity and must never be committed, logged,
or pasted into chat.

- Temporary **environment variables** to clear: `DATABASE_URL`, `PGPASSWORD`,
  `BACKUP_ENCRYPTION_KEY`.
- Temporary **PowerShell variables** to clear: `OwnerAuthUserId`,
  `BackupArtifact`, `TenantName`, `TenantSlug`, `LocationName`, `Modules`.

After clearing, verify `git status` is clean (no env file or artifact was
committed).

## 8. Operator scripting / fixtures (local-only, no deployed runtime)

> These are **operator / local tooling** variables (trust category in §0). No
> deployed app runtime reads them; set them in the operator shell for the
> duration of a run and clear them afterward. **Names only — never values.**

| Variable | Purpose | Where it should live | Visibility | When |
| -------- | ------- | -------------------- | ---------- | ---- |
| `LINE_OS_API_INTERNAL_URL` | `apps/web` → `apps/api` base URL for the local/dev auth-boundary smoke helper (`apps/web/src/lib/api/auth-boundary-smoke.ts`). Server-read only; **never** `NEXT_PUBLIC_`-prefixed. | `apps/web/.env.local` (local dev) | public-ish (URL) | now (dev-only) |
| `STAFF_AUTH_CONCURRENCY_DB_URL` | Postgres connection for the ad-hoc staff-auth concurrency check (`packages/db/scripts/staff-auth-concurrency-check.ts`). | Operator shell / password manager | **secret** | now (ad-hoc) |
| `ORUWA_CAFE_MANAGER_PASSWORD` | Reference-tenant manager account password used by the oruwa-cafe fixture writer (`pnpm --filter @line-os/db oruwa-cafe-fixture`) to read the roster and record a stock count (a `service_role` call cannot do either). | Operator shell / password manager | **secret** | now (fixture) |
| `RECIPE_TRANSLATION_MANAGER_EMAIL` / `RECIPE_TRANSLATION_MANAGER_PASSWORD` | Manager sign-in credentials for the recipe-translation generator script (`apps/web/scripts/generate-recipe-translations.ts`). | Operator shell / password manager | **secret** | now (script) |
| `RECIPE_TRANSLATION_TENANT_SLUG` | Optional tenant slug for the same script; defaults to `mame-to-cha` (the reference tenant). | Operator shell | public-ish | now (optional) |
| `RECIPE_TRANSLATION_CONFIRM` / `RECIPE_TRANSLATION_REPLACE_STALE_REVIEWED` | Optional non-interactive/behaviour flags for the same script. | Operator shell | public | now (optional) |

## 9. Deferred legacy — non-cloud Mame To Cha tooling

The remaining non-cloud `mame-to-cha-*` operator scripts still read
`MAME_TO_CHA_LOCAL_*`, `MAME_TO_CHA_FIXTURE`, `MAME_TO_CHA_WRITE_SQL`, and
`MAME_TO_CHA_CLEANUP_SQL` (repo-root `.env.local`). These are **deferred
technical debt**, kept together with the rest of the non-cloud pilot/rehearsal
tooling pending a generic fixture/onboarding reconciliation. This ENV cleanup
does **not** touch them. The Cloud-specific `mame-to-cha-cloud-*` tooling and
its `MAME_TO_CHA_CLOUD_*` vars were removed in Sept 2026 (PR #480).

## Rules (always)

- **Do not commit values.** Names only in this repo.
- **Store values** in a password manager and/or the provider dashboard.
- **`.env.local` (and other local env files) stay gitignored** — never commit
  them.
- Never paste secrets, DB URLs, API keys, passwords, JWTs, or refresh tokens into
  docs, chat tools, or commits.
- `service_role` and all `secret` variables are **server-only**.
