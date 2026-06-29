# Manual Client Onboarding Runbook

- Status: Active (manual, MVP)
- Phase: 1H Stage 3e — First real local owner onboarding **executed and verified**
  (documentation only here; §13 is the execution final report + runbook
  hardening). Builds on Stage 3d (procedure) and Stage 3c-4b local-only committed
  onboarding, the first stage with a real `COMMIT`; LOCAL only, strictly gated.
- Scope: **Documentation + pure validation helpers + a CLI that runs the write
  path either inside a LOCAL dry-run transaction (always rolls back) or, when all
  Stage 3c-4a gates pass, inside a LOCAL committed transaction.** This runbook
  describes the manual onboarding procedure for the first real clients and the
  identity/idempotency rules the server-only onboarding routine follows. It
  contains **no executable SQL with real values**. Stage 3a/3b shipped pure
  validation/planning helpers; Stage 3c-1 added a validation-only CLI shell + a
  local-only `DATABASE_URL` guard; Stage 3c-2 added the `pg` driver and a
  **read-only**, **local-only** state loader
  (`packages/db/scripts/onboard-db.ts`); Stage 3c-3a added the write-side module
  (`packages/db/scripts/onboard-write.ts`): parameterized write **SQL builders**
  and an **executor** exercised against an injected fake `QueryRunner`;
  **Stage 3c-3b** wired that write path into a **local-only dry-run transaction**
  that **always `ROLLBACK`s**; **Stage 3c-4a** added the **strict commit gates**
  and **backup-artifact validation**. **Stage 3c-4b** adds
  `packages/db/scripts/onboard-commit.ts` — the **only** file that carries the
  transaction-finalizing `COMMIT`. When (and only when) every Stage 3c-4a gate
  passes, the CLI opens one **local** `pg.Client`, runs
  `BEGIN` → load state → plan → validate → execute → (changed-only) audit and
  **`COMMIT`s only after every write/audit succeeds**; an already-onboarded
  tenant changes nothing and is **`ROLLBACK`ed as a no-op** (no `COMMIT`, no
  audit rows). `onboard-write.ts` stays permanently `COMMIT`-free. It remains
  **local only** (loopback host + port 54322): **no Supabase Cloud, no
  `service_role`, no auth-admin, no Data API**.

> While onboarding is manual, the first tenant owner is created **server-side by
> an operator**. There is no self-service signup yet and no admin console.

## 0. MVP onboarding strategy (owner identity — Option A)

The MVP uses **owner identity Option A**: the owner exists in Supabase Auth
first, and onboarding later **links** to that existing identity. It never
provisions auth users itself.

1. **Owner signs up first** through Supabase Auth (normal sign-up flow). This
   creates the `auth.users` row.
2. **Operator obtains the explicit auth user id** for that owner (e.g. from
   Supabase Studio). This UUID is the authoritative identity input.
3. The future onboarding routine **links `core.users.id` to that auth user id**
   (the mirror row is keyed by the real auth UUID). There is **no auto-mirror
   trigger**, so the routine creates the `core.users` row itself.

Constraints for this MVP:

- **No auth-admin for MVP.** The platform does not create/invite auth users.
- **No self-service signup** beyond the owner using standard Supabase Auth.
- **No email-to-uid lookup.** Identity is resolved **only** from the explicit
  `--owner-auth-user-id`. Email is never used as identity authority.
- **Email is PII.** `--owner-email` may be accepted to store later (encrypted +
  blind index per the security rules) but must **never** be logged, printed, or
  placed in a report/summary.

## 1. Goal

Onboard one client tenant so its owner can sign in and use the platform with
correct, isolated access. A complete onboarding produces:

1. A **tenant** (`core.tenants`).
2. A **location** (`core.locations`) for the tenant's physical site.
3. A **user mirror** for the owner (`core.users`, linked 1:1 to the auth user).
4. An **active membership** (`core.tenant_memberships`, status `active`).
5. The **`tenant_owner` role** assigned to that membership (RBAC).
6. The tenant's **default modules enabled** (`core.tenant_modules`).
7. **Verified dashboard access** for the owner.
8. An **audit log entry** for the onboarding action — written/verified once the
   audit implementation for onboarding exists (`writeAudit`).

## 2. Required inputs

Collect these before starting. Do not collect or store more PII than needed.

| Input | Notes |
| ----- | ----- |
| Tenant name | Display name of the company. |
| Tenant slug | URL-safe unique identifier (unique in `core.tenants`). |
| Tenant kind | `client` for a real client (vs `demo` / `client_template`). |
| Owner auth user id | **Authoritative identity.** The owner's existing Supabase `auth.users` UUID. Required. |
| Owner email | The owner's sign-in identity, **PII**. Stored later (encrypted); never identity authority. |
| Location name | Name of the primary physical site. |
| Location timezone | Defaults to `Asia/Tokyo` if unspecified. |
| Modules to enable | Which product modules this tenant should start with (beyond `core`). |

> Owner email is **PII**. Handle per the security rules — encrypted + blind index
> in `core.users` — never plaintext in logs, chat, or docs.

## 3. Procedure (manual, server-side)

Perform these steps server-side using the approved backend path (service-role on
the server / `apps/api` / approved tooling). Each write is an ordinary Core
operation under tenant context, RLS, validation, and audit — the same path a
human action would take. **This is a checklist, not copy-paste SQL.**

1. **Create the tenant.** Insert into `core.tenants` with name, unique slug, and
   `kind` = `client`. Status starts `active`.
2. **Create the location.** Insert into `core.locations` for the tenant with name
   and timezone.
3. **Confirm the owner auth user exists (Option A).** The owner must have
   already signed up through Supabase Auth. The operator obtains that explicit
   `auth.users` UUID. The platform does **not** create/invite the auth user
   (no auth-admin), and identity is **never** resolved from email.
4. **Create the user mirror.** Ensure a `core.users` row exists with `id` equal
   to the owner's auth user id, with email stored as encrypted + hash (PII
   rules). This mirror is created by the routine (no auto-mirror trigger exists).
5. **Create the membership.** Insert into `core.tenant_memberships` linking the
   user to the tenant with status `active` (and optional default `location_id`).
   Note the table default is `invited`, so `active` must be set explicitly.
6. **Assign `tenant_owner`.** Grant the `tenant_owner` role to that membership
   via the RBAC tables so the owner has full tenant permissions.
7. **Enable default modules.** Always enable `core`, plus the explicitly
   requested modules, in `core.tenant_modules` with `is_enabled = true`. Leave
   all other modules off (see ADR 0009 — modules are off unless explicitly
   enabled per tenant).
8. **Verify access.** Run the verification checklist in §10.
9. **Audit.** Once onboarding audit is implemented, confirm a `writeAudit` entry
   recorded actor, tenant, entity, action, and timestamp.

## 4. Safety rules

- **First tenant owner creation is server-only / manual.** There is no
  self-service onboarding and no admin console yet.
- **`service_role` is never used in `apps/web`.** All privileged writes happen on
  the server / `apps/api` / approved tooling.
- **No production writes without explicit approval.** Onboarding against any
  production/Cloud database requires a separate, explicit go-ahead.
- **No raw secrets in ChatGPT / Cursor / chat tools.** Never paste keys, DB URLs,
  passwords, tokens, or real user UUIDs into AI chats or docs.
- **`tenant_id` from the client is never authority.** The backend derives
  `tenant_id` from membership (`core.tenant_memberships`), never from a request
  body, query, or header.
- Treat owner email and any PII as encrypted-at-rest data; never log plaintext.

## 5. Onboarding command (Stage 3c-3b: local dry-run transaction)

The command validates the operator's inputs and the **local-only target guard**.
In dry-run, **if a local `DATABASE_URL` is present** it opens **one** local
`pg.Client`, runs the write path inside a single transaction
(`BEGIN` → load existing state → build plan → validate → execute the writes),
and then **always `ROLLBACK`s** and closes the connection — so the real write
path is exercised against the local schema but **zero rows are persisted**. It
then prints a redacted, no-PII summary. **If `DATABASE_URL` is absent**, it keeps
the prior validation-only behavior (plans against an empty state, no
connection). In all cases it **persists nothing, never commits (there is no
`COMMIT`), and never touches Cloud.** Committed (durable) DB writes are a later,
separately approved stage.

```bash
pnpm db:onboard-tenant -- \
  --tenant-name "Acme KK" \
  --tenant-slug acme-kk \
  --owner-auth-user-id <uuid> \
  --owner-email <OWNER_EMAIL> \
  --location-name "Main Store" \
  --timezone Asia/Tokyo \
  --modules core,workforce \
  --dry-run
```

Arguments:

- **Required:** `--tenant-name`, `--tenant-slug`, `--owner-auth-user-id`,
  `--location-name`.
- **Optional:** `--owner-email` (PII, stored later, never logged), `--timezone`
  (default `Asia/Tokyo`), `--modules` (modules **beyond** `core`; `core` is
  force-included).
- `--owner-auth-user-id` is the authoritative identity (Option A); identity is
  never resolved from email.

Mode flags:

- **Default mode is `dry-run`.** If neither `--dry-run` nor `--commit` is given,
  the run resolves to `dry-run`.
- `--dry-run` is allowed and explicit.
- `--dry-run` together with `--commit` **fails safely**.
- `--commit` **without** `--yes` **fails safely**.
- Unknown args, positional args, and missing values **fail safely**.

### Stage 3c-4b local-only committed onboarding (the first real COMMIT)

Stage 3c-4b implements **local-only committed onboarding**. The strict Stage
3c-4a **commit confirmation gates** and **backup-artifact validation** are now
the precondition for a real, durable `COMMIT` against the **local** database.

A committed run requires **all** of these flags:

- `--commit`
- `--yes`
- `--i-understand-this-writes-local-db`
- `--backup-artifact <path>`
- `--target local`

The gates fail safely **before any DB interaction** when any are missing, when
`--target` is anything other than `local` (Cloud/remote targets are rejected and
the bad value is never echoed), or when the backup artifact is invalid.

**Backup-artifact validation** runs **before** the DB connection (metadata only —
the file is **never read, decrypted, or uploaded**, and no backup is auto-run):

- the path must be provided,
- the file must **exist** and be a **regular file**,
- it must be **non-empty**,
- its name must end in **`.dump.enc`** and match the canonical backup filename
  (`linebos-YYYYMMDD-HHmmss.dump.enc`),
- it must have been **modified within the last 24 hours** (a fresh backup).

**Strongly recommended:** run a **`--dry-run`** against the same local
`DATABASE_URL` first (it executes the full write path in a transaction that
always rolls back) and review the planned operation counts before committing.

**Transaction flow** (`packages/db/scripts/onboard-commit.ts`, the only file with
`COMMIT`): validate the backup artifact → read `DATABASE_URL` → run the pure
local guard (`assertLocalDatabaseUrl`) **before** connecting → open **one**
`pg.Client` → `set statement_timeout` → `BEGIN` → load state **inside the
transaction** → build plan → validate writable plan → execute the writes →
write **changed-only** audit rows → `COMMIT` **only after** every write/audit
succeeds. On any error before the commit it best-effort `ROLLBACK`s; the client
is always closed in a `finally`. If the `COMMIT` itself fails the outcome is
**unknown** and a static indeterminate error is returned (never a false
rollback claim).

**First commit on an empty tenant** persists these state-changing operations and
audit rows:

- `tenant.create`, `user.create`, `location.create`, `membership.create`,
  `role_assignment.create`, `tenant_module.enable` ×2, plus one `summary` audit
  row — **8 audit rows total** (7 changed ops + 1 summary).

**Idempotency / second commit:** a pure all-reuse plan changes nothing, so the
transaction is **`ROLLBACK`ed as a no-op** — **no `COMMIT`** and **zero durable
audit rows** (no audit pollution). The CLI prints a *no-op: tenant already
onboarded* line and exits **0**. Audit rows are always **changed-only**
(`create` / `create_with_pii` / `pii_backfill` / `activate` / `enable`), and a
`summary` row is written only when at least one state-changing operation
occurred. Audit rows keep `actor_kind = system`, `actor_id = null`,
`entity_id = null` (MVP), and redacted metadata.

**Not in this stage:** no Cloud, no `service_role`, no auth-admin, no Data API,
no migrations, no schema/RLS/grant changes, and **no synthetic owner sign-in** —
identity always comes from the real `--owner-auth-user-id`.

Safety of the shell output:

- The output **never** prints the owner email, the owner auth user id, the
  `DATABASE_URL`, the backup filename, secrets, raw driver errors, or real
  UUIDs. It reports the tenant slug, the run mode, whether an email was provided
  (boolean), the safe local DB target (`local-postgres:54322`), the planned
  operation counts, and — on a successful commit — the changed/audit row counts.
- A successful commit prints, among others: *local committed onboarding
  executed*, *backup artifact gate passed*, *local target confirmed*, *no Cloud
  touched*. A no-op prints *no-op: tenant already onboarded; nothing to change*
  and *no rows persisted (transaction rolled back)*.
- The **local guard still blocks** non-local / Supabase-Cloud-like hosts and the
  wrong port **before** any connection is attempted.

The pure validation/planning helpers and the local `DATABASE_URL` guard live in
`packages/db/scripts/onboard-tenant.ts` (driver-free; it reaches the commit
runner via a lazy import). The `pg`-backed read-only loader lives in
`onboard-db.ts`; the write SQL/executor in `onboard-write.ts` (permanently
`COMMIT`-free); the commit transaction in `onboard-commit.ts`.

### Stage 3c-3b local dry-run transaction (always ROLLBACK)

`packages/db/scripts/onboard-write.ts` is the only onboarding file allowed to
contain write SQL **and** transaction-control SQL (`begin` / `rollback`). It is
the write-side driver file; the read-side loader (`onboard-db.ts`) stays
SELECT-only.

- It exposes a **local-only dry-run transaction**
  (`runOnboardingDryRunTransactionFromEnv` / `withLocalDryRunTransaction`) that
  reads `DATABASE_URL` **only** inside the runner, runs the pure local guard
  (`assertLocalDatabaseUrl`) **before** opening any connection, then opens **one**
  `pg.Client` (never a pool).
- The transaction executes `begin` → `loadExistingOnboardingState` → build plan
  → `validateWritablePlanOrThrow` → `executeOnboardingWritePlan` (including the
  audit inserts), and then **always issues `rollback`** and closes the
  connection in a `finally`. On any error after `begin` it best-effort rolls
  back and still closes the connection.
- It **never commits** — there is **no `COMMIT`** token anywhere in the write
  path — so **zero rows are persisted**. The writes execute (so the plan is
  exercised against the real local schema) and are then discarded.
- It **never** uses the `service_role` key, a Supabase client, the Data API, a
  connection pool, or Cloud. All errors are mapped to short, static,
  secret-free messages (no DB URL, credentials, SQL values, UUIDs, or email).
- The unit tests use a **fake `QueryRunner` / fake `Client`** only and **make no
  real DB connection**. A real run is **local-only** against
  `127.0.0.1:54322`.

The write builders implement these policies (verified by the fake-executor
tests), which the future committed routine will reuse unchanged:

- **Suspended membership → fail by default.** Onboarding does not silently
  reactivate a suspended owner membership (revoked likewise fails by default).
  Invited memberships are activated; active memberships are reused.
- **Revoked membership → fail by default.** Onboarding does not silently
  resurrect a revoked owner membership.
- **Existing user mirror email → do not overwrite existing PII.** If a
  `core.users` mirror already exists with PII, its encrypted email/hash are not
  clobbered. PII backfill is allowed **only** when the existing PII is missing
  (NULL-guarded `UPDATE`) **and** an owner email was supplied.
- **Owner email is optional.** PII env (`PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER`)
  is required **only** when an owner email is provided and would be
  written/backfilled. Errors name the missing env variable only — never its
  value, and never the raw email.
- **Location ambiguity → safe-fail.** Locations are matched by normalized name
  within the tenant. Zero matches → create; one match → reuse; **more than one
  match → fail safely** (no automatic choice, no DB unique index).
- **Role assignment (`location_id = NULL`) → `INSERT … SELECT … WHERE NOT
  EXISTS`.** Because the unique index treats `NULL` `location_id` as distinct,
  the tenant-wide `tenant_owner` assignment uses `WHERE NOT EXISTS` (never
  `ON CONFLICT`); no DB unique-index change is made.
- **Tenant modules.** Requested modules are enabled; a disabled module is
  re-enabled via `ON CONFLICT … DO UPDATE SET is_enabled = true WHERE
  is_enabled = false`. Module **`config` is never overwritten**.
- **Audit.** Audit rows use the **system actor** (`actor_kind = 'system'`,
  `actor_id = null`), `module = 'core'`, and carry only safe metadata (tenant
  slug, action labels, module codes, counts) — never the owner email, the owner
  auth user id, secrets, or UUIDs.
- **Local-only.** There is **no Cloud onboarding**; the same guard
  (`assertLocalDatabaseUrl`) rejects non-local / Supabase-Cloud-like hosts and
  the wrong port **before** the dry-run transaction opens any connection, so the
  write path only ever connects to the local Postgres at `127.0.0.1:54322`.

## 6. Idempotency rules

Repeat runs must be safe. Natural keys and matching rules:

- **Tenant slug** is the tenant natural key (unique in `core.tenants`). Same
  slug → reuse/validate the existing tenant.
- **Owner auth user id** is the natural key for the user mirror
  (`core.users.id`). Same id → reuse the existing mirror.
- **Membership** is unique on `(tenant_id, user_id)`. Existing membership →
  reuse; if not `active`, update it to `active`.
- **Tenant module** is unique on `(tenant_id, module)`. Existing → reuse/enable;
  never duplicate.
- **Location** has no DB unique key; it is matched in **script logic** by
  `tenant_id` + **normalized name** (trim + collapsed whitespace + lowercased).
  A match → reuse; otherwise create. (No DB unique index is added in this stage.)
- **Conflict safety:** a slug that already exists with a **different tenant name
  or non-`client` kind** is a conflict and fails safely (no dependent writes).

## 7. Default modules

- **Always force-include `core`.**
- Enable only the explicitly requested modules **beyond** `core`.
- Everything else stays off (ADR 0009: modules are off unless explicitly enabled
  per tenant). De-duplicate and apply a deterministic order.

## 8. Audit actor (future MVP default)

When onboarding audit is implemented, the MVP default actor is the **system
actor**: `actor_kind = 'system'` with `actor_id = null`. Audit payloads must
avoid PII (no owner email/name) — use tenant slug, ids, module codes, and
operation labels only.

## 9. Safety gates (before any real onboarding)

- [ ] **Backup smoke test passed** (`pnpm db:backup`) before real onboarding.
- [ ] **Dry-run first** and review the plan.
- [ ] **Local-only by default**; a remote/Cloud run needs explicit human
      approval (not implemented in this stage).
- [ ] **No secrets printed** — no DB URLs, keys, passwords, tokens, JWTs.
- [ ] **No real UUIDs** in reports/chat (owner auth user id stays out of logs).
- [ ] **`git` clean** before and after.

### Manual local dry-run smoke test (optional; local-only)

The dry-run transaction always rolls back, so it must leave the database byte
identical. To verify this manually (optional, and only against the **local**
DB):

1. Export a **local-only** `DATABASE_URL`
   (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
2. Capture safe **before** counts (e.g. `select count(*)` on `core.tenants`,
   `core.locations`, `core.tenant_memberships`, `core.role_assignments`,
   `core.tenant_modules`, `audit.audit_logs`). Record counts only — never row
   contents, UUIDs, or PII.
3. Run the onboarding CLI in **dry-run** with a **synthetic** owner auth user id
   (omit `--owner-email` on the first pass).
4. Capture the **after** counts the same way.
5. **Confirm before == after** for every table (the rollback persisted nothing).
6. **Clear `DATABASE_URL`** from the shell afterwards.

Report the smoke test separately, and print **no** secrets, real UUIDs, emails,
or the DB URL.

## 10. Verification checklist

- [ ] The owner can **sign in**.
- [ ] The **dashboard shows the correct tenant** for the owner.
- [ ] The **tenant switcher includes** the tenant (and switching works when the
      owner belongs to multiple tenants).
- [ ] A **non-member cannot see** this tenant's data (RLS isolation holds).
- [ ] The **membership status is `active`** (not `invited`).
- [ ] The **`tenant_owner` role assignment exists** for the owner.
- [ ] The **`tenant_modules` are seeded** (`core` + requested modules enabled).
- [ ] **Audit rows exist** for the onboarding actions.
- [ ] **`git` is clean** (running onboarding changed no tracked files).
- [ ] **No secrets printed** in any output, report, or chat.
- [ ] **Disabled / suspended tenant behavior** is correct — verified once tenant
      status enforcement is implemented (future). For now, note it as pending.

## 11. Scope exclusions

This runbook does **not** cover:

- **Billing** — no billing in this stage.
- **LINE integration** — not part of onboarding yet.
- **Workforce / Booking migration** — module data migration is out of scope.
- **Admin console** — no self-service or admin UI; onboarding is manual.

## 12. First real local owner onboarding procedure (Phase 1H Stage 3d)

This section is the operator-facing procedure for onboarding the **first real
local owner** — a real Supabase **Auth** user (not a synthetic id) onboarded
against the **local** database only. It builds on the Stage 3c-4b local
committed path (§5) and the verification + safety rules above; it does **not**
change any of them. It is **LOCAL only**: no Supabase Cloud, no `service_role`,
no auth-admin, no production onboarding.

> This is a checklist and a set of command **templates with placeholders**, not
> copy-paste commands with real values. Never substitute a real UUID, real
> email, secret, or DB URL into this document.

### 12.A. Preconditions

Confirm **all** of these before starting:

- [ ] **Local only.** The target is the local database at `127.0.0.1:54322`.
      No Cloud, ever.
- [ ] **`dev` is clean.** Work happens on `dev` (or a feature branch off `dev`);
      `git status` is clean before and after the procedure.
- [ ] **Local DB is running** on `127.0.0.1:54322` (Supabase local stack up).
- [ ] **Web app is available locally** (the local Next.js app is running) so the
      owner can sign in for verification.
- [ ] **No `service_role`** is used at any point (RLS + anon key only in the app;
      the onboarding CLI uses a plain local `pg` connection, never `service_role`).
- [ ] **No auth-admin.** The platform never creates/invites the auth user.
- [ ] **No real customer email.** Real customer PII is out of scope for this
      stage.
- [ ] **Owner email is omitted** for this first real run (`--owner-email` is not
      passed; PII env vars are therefore not required).
- [ ] **A fresh encrypted backup is required before the commit** (§12.C) and must
      pass the backup-artifact gate (§5, Stage 3c-4a).

### 12.B. Owner identity (real local Supabase Auth user)

Identity follows the MVP **Option A** model (§0): the owner exists in Supabase
Auth first; onboarding only **links** to that existing auth user id.

1. The owner must already have a **real local Supabase Auth user**. The platform
   does not create it (no auth-admin, no self-service signup in this stage).
2. **Obtain the auth user id the MVP-safe way — local Supabase Studio:**
   - Open the **local** Supabase Studio for the local stack.
   - Go to **Authentication → Users**.
   - **Copy the user's UUID manually** from the Users list.
3. Use that UUID **only at run time** as the value for `--owner-auth-user-id`.

Hard rules for the auth user id:

- **Do NOT store the UUID in this doc or in any run report.** Use the placeholder
  `<OWNER_AUTH_USER_ID>` everywhere written down.
- **Do NOT paste the UUID into chat tools, logs, or report files.**
- **Do NOT use an email-to-uid lookup in application code.** Identity is never
  resolved from email; email is never identity authority.
- **Do NOT use auth-admin** (no admin API calls), **no CLI helper**, **no
  debug web display**, and **no `SELECT` from `auth.users` in code** to obtain
  the id. Manual copy from local Studio is the only sanctioned method.

### 12.C. Fresh encrypted backup (required before commit)

The committed run is gated on a fresh, encrypted backup artifact. Backup stays a
**separate explicit step**; onboarding never auto-runs a backup.

1. Create a fresh backup:

```bash
pnpm db:backup
```

2. The artifact is written to the gitignored repo-root `backups/` directory as an
   encrypted file named `linebos-YYYYMMDD-HHmmss.dump.enc`.
3. Requirements enforced by the commit gate (metadata only — the file is never
   read, decrypted, or uploaded):
   - the file must **exist**, be a **regular, non-empty** file,
   - end in **`.dump.enc`** and match `linebos-YYYYMMDD-HHmmss.dump.enc`,
   - be **modified within the last 24 hours** (fresh).
4. Pass the artifact path to `--backup-artifact` in the **commit** command
   (§12.E). Refer to it as `<BACKUP_ARTIFACT>` when writing anything down.

Safety:

- **Do NOT print or paste `BACKUP_ENCRYPTION_KEY`** (or any key) anywhere.
- **Do NOT decrypt or upload** the backup. The gate is metadata-only.

### 12.D. Dry-run command template (omit owner email)

Run a dry-run first against the same local `DATABASE_URL`. The dry-run executes
the full write path inside a transaction that **always `ROLLBACK`s** — it
persists nothing — and prints redacted operation counts to review before
committing. **The dry-run omits the owner email and takes no backup artifact.**

```bash
pnpm db:onboard-tenant -- \
  --tenant-name "<TENANT_NAME>" \
  --tenant-slug "<TENANT_SLUG>" \
  --owner-auth-user-id "<OWNER_AUTH_USER_ID>" \
  --location-name "<LOCATION_NAME>" \
  --timezone Asia/Tokyo \
  --modules core,workforce \
  --dry-run
```

Expected: the CLI reports the planned operation counts, then
`local dry-run transaction executed`, `transaction rolled back`, and
`no DB rows persisted`. Review the counts against §12.F before committing.

### 12.E. Commit command template (full gates)

Only after a satisfactory dry-run and a fresh backup, run the **gated local
commit**. All gate flags are mandatory; omit `--owner-email` for the first real
run.

```bash
pnpm db:onboard-tenant -- \
  --tenant-name "<TENANT_NAME>" \
  --tenant-slug "<TENANT_SLUG>" \
  --owner-auth-user-id "<OWNER_AUTH_USER_ID>" \
  --location-name "<LOCATION_NAME>" \
  --timezone Asia/Tokyo \
  --modules core,workforce \
  --commit \
  --yes \
  --i-understand-this-writes-local-db \
  --backup-artifact "<BACKUP_ARTIFACT>" \
  --target local
```

Gate behavior (all fail safely **before** any DB interaction):

- missing any of `--commit` / `--yes` / `--i-understand-this-writes-local-db` /
  `--backup-artifact` / `--target local` → refuses to run,
- `--target` anything other than `local` → rejected (the bad value is never
  echoed); Cloud/remote targets are impossible,
- an invalid/stale backup artifact → rejected,
- a non-local / Cloud-like `DATABASE_URL` → rejected by the local guard before
  connecting.

Expected on success: `local committed onboarding executed`,
`backup artifact gate passed`, `local target confirmed`, the changed/audit row
counts, and `no Cloud touched`.

### 12.F. Expected DB deltas (modules `core,workforce`, no email)

A first commit on a brand-new tenant with `--modules core,workforce` and no
owner email persists exactly these deltas:

| Table | Expected delta |
| ----- | -------------- |
| `core.tenants` | **+1** |
| `core.users` | **+1** (owner mirror; no PII columns set) |
| `core.locations` | **+1** |
| `core.tenant_memberships` | **+1** (status `active`) |
| `core.role_assignments` | **+1** (`tenant_owner`, tenant-wide `location_id` NULL) |
| `core.tenant_modules` | **+2** (`core` + `workforce`) |
| `audit.audit_logs` | **+8** (7 changed-op rows + 1 `summary` row) |

Verify by capturing **counts only** before and after (never row contents, ids,
or PII). The CLI's own redacted output
(`committed rows persisted: N change(s), M audit row(s)`) is the primary safe
evidence.

### 12.G. Web verification (owner)

After the commit:

1. The owner **signs in** at `/sign-in` with their real local Auth credentials.
2. The **dashboard** (`/dashboard`) should show the **active tenant** — the new
   tenant name + slug, `kind: client`, and `memberships: 1`.
3. **Tenant switcher:** with exactly **one** membership the switcher is **hidden
   by design** (it renders only for 2+ memberships). A hidden switcher therefore
   confirms a single membership; it is **not** a failure.
4. **Active tenant cookie** is only a **hint**: it is always revalidated against
   live memberships, and a stale/forged cookie is ignored in favor of the
   deterministic default.
5. **Modules** are **not yet visibly represented** in the dashboard UI, so module
   enablement is verified at the **data/runbook level** (the `core.tenant_modules`
   delta in §12.F), not visually, for now.

### 12.H. Non-member isolation verification

Prove a different local user cannot see the new tenant:

1. Create or sign in as a **second local Auth user** that has **no membership**
   in the onboarded tenant.
2. Open `/dashboard` → it should show **no tenant / a safe empty state**
   (no tenant name or slug is revealed).
3. **Forged/invalid active tenant selection must not grant access:** the tenant
   switcher's action revalidates any submitted tenant id against live
   memberships (STRICT path) and fails closed; a forged active-tenant cookie is
   only a lenient hint and is ignored for a non-member.
4. The **`api` facade / RLS returns no memberships** for the non-member
   (`api.my_tenant_memberships` is self-scoped to the current user and
   `status = 'active'`, backed by core RLS).
5. **No `service_role`** is involved at any point.

### 12.I. Idempotency check (optional but recommended)

Re-run the **exact same commit command** (§12.E) once more:

- It should be a **no-op**: the CLI prints
  `no-op: tenant already onboarded; nothing to change` and
  `no rows persisted (transaction rolled back)`.
- **No new rows** in any table from §12.F.
- **No new audit rows** (changed-only auditing writes nothing on a pure reuse).
- **No `COMMIT`** is issued on the all-reuse / no-change path (the transaction is
  rolled back as a no-op).

### 12.J. Redacted local-only run report template

Record the run using this template. It contains **only** safe, non-identifying
facts. Fill the bracketed fields with safe values (counts, pass/fail, basenames,
host:port).

```text
# Real Local Owner Onboarding — Run Report (LOCAL ONLY)

Date/time:            <YYYY-MM-DD HH:MM local>
Local target:         127.0.0.1:54322            (host:port only)
Backup artifact:      basename=<linebos-YYYYMMDD-HHmmss.dump.enc>
                      size=<bytes>  age=<hours within 24h>
Dry-run status:       <pass / fail>  (rolled back, nothing persisted)
Commit status:        <committed / no-op / failed>

Before/after count deltas (counts only — no rows, no ids):
  core.tenants            <before> -> <after>  (expected +1)
  core.users              <before> -> <after>  (expected +1)
  core.locations          <before> -> <after>  (expected +1)
  core.tenant_memberships <before> -> <after>  (expected +1)
  core.role_assignments   <before> -> <after>  (expected +1)
  core.tenant_modules     <before> -> <after>  (expected +2)
  audit.audit_logs        <before> -> <after>  (expected +8)

Owner sign-in verification:      <pass / fail>
Dashboard tenant visibility:     <pass / fail>
Tenant switcher behavior:        <pass / fail>  (hidden for single membership is OK)
Non-member isolation:            <pass / fail>
DATABASE_URL cleared from shell: <yes / no>
git clean:                       <yes / no>
```

The report MUST NOT include any of the following:

- the DB URL / `DATABASE_URL`,
- passwords,
- the backup encryption key,
- JWTs or refresh tokens,
- `service_role` or the anon key,
- real user UUIDs,
- real emails,
- table rows,
- ids,
- audit metadata.

### 12.K. Cleanup policy

- **Default: leave the local real-owner tenant in place.** It is a useful local
  fixture for sign-in / switcher / isolation checks and future tests, and it
  holds no real PII (email omitted).
- **No `db reset`** in this stage (a reset would also wipe the existing
  `smoke-commit-tenant`). Only reset later with **explicit approval**.
- **No manual SQL cleanup** and **no restore** in this stage.
- **No Cloud cleanup** — nothing was ever created in Cloud.

## 13. First real local owner onboarding — execution final report (Phase 1H Stage 3e)

Stage 3e **executed the §12 procedure for the first time** against the **local**
database, and it **passed**. A real local Supabase **Auth** user was onboarded
as a tenant **owner**; the **local committed** run wrote the expected rows; and
the **web dashboard** saw the active tenant through the **app-facing `api`
facade** (anon key + RLS). **Cloud was not touched, `service_role` was not
used**, and no internal schema was exposed to the app. This section is the
operational final report + hardening checklist. It **changes none** of the §12
gates, safety rules, or expected deltas.

> **Synthetic-only.** Every value below is a placeholder. No real UUID, email,
> key, token, cookie, or DB URL appears here, and none may ever be added.

### 13.0. Invariants reconfirmed by Stage 3e

- The **frontend/web app must never access raw internal schemas.** It reads
  **only** through the safe **`api`** facade (anon key + RLS), never `core`,
  `audit`, `workforce`, `booking`, or `ai` directly.
- Internal schemas **`core`, `audit`, `workforce`, `booking`, `ai` must remain
  internal** and must never be reachable through the Supabase Data API.
- The Supabase Data API must expose **only the safe `api` facade schema** (plus
  `public`) for app-facing access.
- **No `service_role`** anywhere in the app or onboarding path. **No Cloud.**

### 13.A. Preflight (verify env + local PostgREST runtime state)

Before testing, confirm the web app is pointed at **local**, not Cloud, and that
the local Data API exposes only the safe facade.

- [ ] **Confirm web env target is local, not Cloud.** Verify which env the web
      app uses (`apps/web/.env.local`) and that `NEXT_PUBLIC_SUPABASE_URL` points
      at the **local** Supabase host. **Verify the host only — never print keys.**
      (Check the URL host/origin, e.g. with a host-only inspection; do not echo
      the anon key.)
- [ ] **Confirm correct local PostgREST runtime state.** The local Data API must
      expose only the safe facade schema:

```
PGRST_DB_SCHEMAS=public,api
PGRST_DB_EXTRA_SEARCH_PATH=public
```

- [ ] **Watch for stale/wrong PostgREST state.** Stage 3e found a **stale** local
      runtime state that wrongly exposed internal schemas through the Data API:

```
# WRONG / stale — internal schemas exposed via Data API (must NOT persist)
PGRST_DB_SCHEMAS=public,core,audit,workforce,booking,ai
```

- [ ] **If stale, restart the local Supabase stack** to reload the correct
      schema exposure:

```bash
npx supabase stop
npx supabase start
```

> The Supabase CLI may **not** be globally available as `supabase` on this
> machine; `npx supabase ...` worked. Use whichever resolves; do not assume a
> global `supabase` binary exists.

### 13.B. Auth / Data API verification (local anon key only)

- [ ] **Use the local anon / publishable key** for local Auth + Data API checks.
- [ ] **Do NOT use the Storage Access Key.** It is the wrong key type for
      Auth/Data API and causes confusing failures.
- [ ] **Do NOT use `service_role`** at any point.
- [ ] **Direct local Auth password grant passed** (the owner can obtain a session
      against the local Auth endpoint using the local anon key). Never print the
      returned tokens.
- [ ] **Facade reachable before onboarding.** A self-scoped read of the facade
      returns `200` with an **empty** result for an owner with no membership yet:

```
GET api.my_tenant_memberships?select=*   ->   200 OK, [] (empty)
```

- [ ] **Use the real facade projection.** An earlier **`400`** was caused by
      **manually requesting non-existing columns** (`location_name`, `role_code`).
      The actual app-facing projection of `api.my_tenant_memberships` is:

```
tenant_id, tenant_slug, tenant_name, tenant_kind, location_id, status
```

- [ ] **Dashboard pre-onboarding expected state** (owner with no membership):

```
No workspace yet
Your account is not a member of any tenant. Ask an administrator for an invitation.
```

### 13.C. Backup (fresh artifact + pg_dump on PATH)

The committed run is gated on a **fresh** encrypted backup artifact (§12.C).
Stage 3e backup findings:

- [ ] **`pg_dump` must be on `PATH`.** `pnpm db:backup` initially **failed**
      because `pg_dump` was not on `PATH`. Confirm with `pg_dump --version`.
- [ ] **Windows PostgreSQL 17 tools path used in Stage 3e** (example only; verify
      your install):

```
C:\Users\<USER>\AppData\Local\Programs\postgresql-17\pgsql\bin
```

- [ ] **Temporary PATH for the current shell only** (example; do not persist):

```powershell
$env:Path = "C:\Users\<USER>\AppData\Local\Programs\postgresql-17\pgsql\bin;$env:Path"
```

- [ ] **Use a fresh backup artifact.** After a failed backup attempt, create a
      **new** backup. **Do NOT reuse an old/stale backup artifact** to satisfy the
      gate.
- [ ] **The commit gate requires a backup artifact** (§5 / §12.C). No fresh
      artifact → no commit.
- [ ] **Pass the backup artifact path as an ABSOLUTE path.** `pnpm --filter
      @line-os/db` can execute from the **package** working directory, so a
      relative path may not resolve. Always use the artifact's absolute path for
      `--backup-artifact` (see 13.E for the safety case when this was relative).

### 13.D. Dry-run (transaction that always rolls back)

- [ ] **Dry-run executes inside a transaction** against the same local
      `DATABASE_URL` (§12.D).
- [ ] **Dry-run always `ROLLBACK`s** — it persists nothing.
- [ ] **Expected count deltas after the dry-run: every tracked table delta = 0.**
      Capture counts only (never rows, ids, or PII) and confirm before == after
      for all of `core.tenants`, `core.users`, `core.locations`,
      `core.tenant_memberships`, `core.role_assignments`, `core.tenant_modules`,
      `audit.audit_logs`.

### 13.E. Failed commit attempt (expected negative / safety case)

The first commit attempt **failed safely** and is documented here as an
**expected negative/safety case** — proof the gate works.

- **Cause:** the `--backup-artifact` path was **relative**, so the gate could not
  resolve the file.
- **Result:**

```
error: backup artifact not found
```

- **Post-check (`FailedCommitCheck`):** all tracked-table deltas **stayed 0** —
  the failed gate ran **before any DB interaction**, so nothing was persisted.

Treat this as the correct behavior: a missing/unresolved backup artifact must
block the commit with **zero** side effects. The fix is to re-run the commit with
the **absolute** artifact path (13.C / §12.E).

### 13.F. Successful local commit (LOCAL only)

After the absolute-path fix, the **gated local commit** succeeded. **Local only.**
Required explicit commit flags (all mandatory — §12.E):

```
--commit
--yes
--i-understand-this-writes-local-db
--backup-artifact <ABSOLUTE_PATH>
--target local
```

Expected output concepts (redacted, no secrets/PII):

```
local target confirmed
backup artifact gate passed
local committed onboarding executed
committed rows persisted
no Cloud touched
```

Expected DB deltas (first commit on a new tenant, modules `core,workforce`,
owner email omitted) — matches §12.F:

| Table | Expected delta |
| ----- | -------------- |
| `core.tenants` | **+1** |
| `core.users` | **+1** |
| `core.locations` | **+1** |
| `core.tenant_memberships` | **+1** |
| `core.role_assignments` | **+1** |
| `core.tenant_modules` | **+2** |
| `audit.audit_logs` | **+8** |

### 13.G. Web verification (owner sees active tenant via the `api` facade)

- [ ] **Before onboarding:** the dashboard shows **No workspace yet** (13.B).
- [ ] **After onboarding:** the dashboard shows the **active tenant**, read
      through the app-facing **`api`** facade (anon key + RLS), e.g. the synthetic
      example:

```
Real Local Owner Test (real-local-owner-test)
kind: client | memberships: 1
```

- [ ] **Port 3000 `EADDRINUSE`** on starting the web app usually means the web
      app is **already running** — not necessarily a failure. Reuse the running
      instance or stop the existing process; do not assume the verification
      failed.

### 13.H. Cleanup (restore Cloud env; clear temporaries; verify clean)

- [ ] **Restore the Cloud web env.** Restore `apps/web/.env.local` from
      `apps/web/.env.local.cloud-backup` after local verification, so the web app
      is no longer pointed at local.
- [ ] **Verify the Cloud host only** afterwards (host/origin of
      `NEXT_PUBLIC_SUPABASE_URL`) — **never print keys**.
- [ ] **Clear temporary environment variables** from the shell:

```
DATABASE_URL
PGPASSWORD
BACKUP_ENCRYPTION_KEY
```

- [ ] **Clear temporary PowerShell variables** used during the run:

```
OwnerAuthUserId
BackupArtifact
TenantName
TenantSlug
LocationName
Modules
```

- [ ] **Verify `git status` is clean** (the run changed no tracked files).
- [ ] **Baseline reference.** The latest `dev` baseline before this docs branch
      was commit `80b1f96` (merge of the Stage 3d real-local-onboarding runbook
      PR). The execution was performed on top of that baseline.

### 13.I. Stage 3e QA checklist (hardened)

Use this checklist for every future local owner onboarding run. Each item maps to
a real failure mode observed or guarded in Stage 3e.

- [ ] **No stale PostgREST schema exposure.** `PGRST_DB_SCHEMAS=public,api`
      (not the internal-schema list). Restart the local stack if stale (13.A).
- [ ] **No local vs Cloud env confusion.** Confirm `NEXT_PUBLIC_SUPABASE_URL`
      host is the intended target (local for testing) — host only, no keys (13.A).
- [ ] **No Auth key-type confusion.** Use the **anon/publishable** key for
      Auth/Data API; **not** the Storage Access Key; **never** `service_role`
      (13.B).
- [ ] **Backup succeeds / `pg_dump` present.** `pg_dump --version` works; backup
      created fresh (13.C).
- [ ] **Backup artifact path is absolute** (not relative) for `--backup-artifact`
      (13.C / 13.E).
- [ ] **Dry-run persistence is zero.** Every tracked-table delta = 0 after the
      dry-run (13.D).
- [ ] **A failed commit gate produces zero deltas.** A blocked/failed commit
      leaves all deltas at 0 (13.E).
- [ ] **Dashboard empty state before onboarding** (No workspace yet) (13.B/13.G).
- [ ] **Dashboard active-tenant state after onboarding** via the `api` facade
      (13.G).
- [ ] **Cleanup restored the Cloud env** and cleared temporary env/PowerShell
      variables; `git status` clean (13.H).

### 13.J. Product / Ops meaning (what Stage 3e does and does NOT prove)

- **What it proves:** the **local** onboarding path is **usable end-to-end** — a
  real local Auth user can be onboarded as owner, the committed write produces the
  expected rows, and the owner sees the active tenant through the safe `api`
  facade. This validates the design for **future repeatable onboarding**.
- **What it does NOT prove:** this is **not** real Cloud/production customer
  onboarding. **Real Cloud/prod onboarding remains a future, separately approved
  process** and must add, at minimum: a backup, a rollback plan, an audit /
  privacy / legal review, explicit approval, and stricter operational controls.
  Cloud/prod onboarding steps must **not** be treated as executable from this
  runbook.
