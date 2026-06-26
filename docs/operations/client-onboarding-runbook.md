# Manual Client Onboarding Runbook

- Status: Active (manual, MVP)
- Phase: 1H Stage 1 — Operations Docs Foundation
- Scope: **Documentation only.** This runbook describes the manual onboarding
  procedure for the first real clients. It contains **no executable SQL with real
  values** and creates no onboarding script. Automation is a later stage.

> While onboarding is manual, the first tenant owner is created **server-side by
> an operator**. There is no self-service signup yet and no admin console.

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
| Owner email | The owner's sign-in identity. Treated as PII. |
| Location name | Name of the primary physical site. |
| Location timezone | Defaults to `Asia/Tokyo` if unspecified. |
| Modules to enable | Which product modules this tenant should start with. |

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
3. **Ensure the owner auth user exists.** The owner must have an auth identity.
   Creating/inviting the auth user is a server-only / manual auth-admin step
   handled by an operator — not from `apps/web`.
4. **Create the user mirror.** Ensure a `core.users` row exists with `id` equal
   to the auth user id, with email stored as encrypted + hash (PII rules).
5. **Create the membership.** Insert into `core.tenant_memberships` linking the
   user to the tenant with status `active` (and optional default `location_id`).
6. **Assign `tenant_owner`.** Grant the `tenant_owner` role to that membership
   via the RBAC tables so the owner has full tenant permissions.
7. **Enable default modules.** Insert the agreed modules into
   `core.tenant_modules` with `is_enabled = true`. Leave all other modules off
   (see ADR 0009 — modules are off unless explicitly enabled per tenant).
8. **Verify access.** Run the verification checklist in §5.
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

## 5. Verification checklist

- [ ] The owner can **sign in**.
- [ ] The **dashboard shows the correct tenant** for the owner.
- [ ] If the owner belongs to **multiple tenants**, the **tenant switcher**
      behaves correctly (switching changes active tenant context).
- [ ] A **non-member cannot see** this tenant's data (RLS isolation holds).
- [ ] **Disabled / suspended tenant behavior** is correct — verified once tenant
      status enforcement is implemented (future). For now, note it as pending.

## 6. Scope exclusions

This runbook does **not** cover:

- **Billing** — no billing in this stage.
- **LINE integration** — not part of onboarding yet.
- **Workforce / Booking migration** — module data migration is out of scope.
- **Admin console** — no self-service or admin UI; onboarding is manual.
