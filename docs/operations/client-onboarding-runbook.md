# Manual Client Onboarding Runbook

- Status: Active (manual, MVP)
- Phase: 1H Stage 3c-3a — Write SQL builders + fake-executor tests (no DB)
- Scope: **Documentation + pure validation helpers + a read-only CLI shell +
  write-side SQL builders that run only against a fake (injected) query
  runner.** This runbook describes the manual onboarding procedure for the first
  real clients and the identity/idempotency rules the future server-only
  onboarding routine will follow. It contains **no executable SQL with real
  values**. The live, DB-writing onboarding routine is still a later, separately
  approved stage. Stage 3a/3b shipped pure validation/planning helpers; Stage
  3c-1 added a validation-only CLI shell + a local-only `DATABASE_URL` guard;
  Stage 3c-2 added the `pg` driver and a **read-only**, **local-only** state
  loader (`packages/db/scripts/onboard-db.ts`). **Stage 3c-3a** adds the
  write-side module (`packages/db/scripts/onboard-write.ts`): parameterized
  write **SQL builders** and an **executor that runs only against an injected
  fake `QueryRunner`**. It **does not connect to any database**, **does not wire
  the CLI to the write path**, **writes nothing to the local DB**, and **never
  commits** — there is no `COMMIT` and no transaction control in this stage. The
  real local **dry-run transaction with `ROLLBACK`** plus CLI wiring and the
  manual rollback smoke test are the **next** stage (3c-3b). Live, durable
  onboarding writes remain unimplemented.

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

## 5. Onboarding command (Stage 3c-2: read-only local state loading)

The command validates the operator's inputs and the **local-only target guard**.
In dry-run, **if `DATABASE_URL` is present** it connects to the **local** Supabase
Postgres and loads the existing onboarding state **read-only** (SELECT-only) to
plan against, then prints a redacted, no-PII summary. **If `DATABASE_URL` is
absent**, it keeps the prior validation-only behavior (plans against an empty
state, no connection). In all cases it **writes no row, runs no onboarding, and
never touches Cloud.** Live DB writes are a later, separately approved stage.

```bash
pnpm db:onboard-tenant -- \
  --tenant-name "Acme KK" \
  --tenant-slug acme-kk \
  --owner-auth-user-id <uuid> \
  --owner-email owner@example.jp \
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
- `--commit` **without** `--yes` **fails safely**. A future committed write will
  require `--commit --yes`.
- In Stage 3c-2, `--commit --yes` resolves the commit mode but the CLI **still
  writes nothing**, **never connects**, and **exits non-zero**, clearly stating
  that live DB writes are not implemented yet (so it can never report a false
  success).
- Unknown args, positional args, and missing values **fail safely**.

Safety of the shell output:

- The summary **never** prints the owner email, the owner auth user id, the
  `DATABASE_URL`, secrets, raw driver errors, or real UUIDs. It reports the
  tenant slug, the run mode, whether an email was provided (boolean), the safe
  local DB target (`local-postgres:54322`) when checked, and the planned
  operation counts. Tenant/role UUIDs read during loading are held in memory
  only to scope follow-up reads and are never printed.
- When `DATABASE_URL` is set it prints, among others: *local read-only DB state
  loaded*, *no DB rows written*, *no live onboarding implemented*.
- The **local guard still blocks** non-local / Supabase-Cloud-like hosts and the
  wrong port before any connection is attempted.

The pure validation/planning helpers and the local `DATABASE_URL` guard live in
`packages/db/scripts/onboard-tenant.ts` (driver-free). The `pg`-backed read-only
connection and SELECT-only loader live in `packages/db/scripts/onboard-db.ts`
(the only onboarding file that imports a DB driver).

### Stage 3c-3a write builders (fake executor only — no DB)

Stage 3c-3a adds `packages/db/scripts/onboard-write.ts`: the only onboarding
file allowed to contain write SQL. In this stage it is intentionally limited:

- It adds **parameterized write SQL builders** and an **executor that runs only
  against an injected fake `QueryRunner`** (used solely by the unit tests).
- It **does not connect** to any database, **does not read** any DB connection
  string, **does not wire the CLI** to the write path, **writes nothing** to the
  local DB, and **never commits**. There is **no `COMMIT`** and **no transaction
  control** (`BEGIN`/`ROLLBACK`) in 3c-3a.
- The **real local dry-run transaction with `ROLLBACK`**, the CLI wiring, and the
  manual rollback smoke test are the **next** stage (3c-3b). Audit rows are built
  and exercised by the fake runner now; real (rolled-back) audit inserts come in
  3c-3b.

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
- **Local-only.** There is **no Cloud onboarding**; the read-side guard rejects
  non-local / Supabase-Cloud-like hosts, and the write path never connects in
  this stage.

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
