# Manual Client Onboarding Runbook

- Status: Active (manual, MVP)
- Phase: 1H Stage 3a — Onboarding docs + pure validation helpers
- Scope: **Documentation + pure validation helpers only.** This runbook
  describes the manual onboarding procedure for the first real clients and the
  identity/idempotency rules the future server-only onboarding routine will
  follow. It contains **no executable SQL with real values**. The live,
  DB-writing onboarding script is a later, separately approved stage; this stage
  ships only pure validation/planning helpers
  (`packages/db/scripts/onboard-tenant.ts`) and tests — **zero DB risk**.

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

## 5. Future onboarding command shape (not implemented yet)

The future server-only routine will be invoked as a manual command. **Example
shape only — do not run it in this stage** (no live script exists):

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

- `--owner-auth-user-id` is the authoritative identity (Option A).
- `--owner-email` is optional PII stored later; never logged.
- `--modules` lists modules **beyond** `core` (`core` is force-included).
- `--dry-run` produces a plan and writes nothing.

The pure validation/planning helpers for this command already exist in
`packages/db/scripts/onboard-tenant.ts` (no DB access). The DB-writing routine
is a later, separately approved stage.

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
