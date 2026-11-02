# Security Requirements

These are mandatory. PRs that violate them must not merge.

## 1. Row Level Security (mandatory)

Every table with `tenant_id` has RLS enabled and policies that gate access via
`core.is_member_of` / `core.has_permission`. Tenant isolation must not depend on
frontend filtering.

**Platform staff get no tenant data through RLS.** Since 0146 (DEBT-128),
`core.is_member_of` / `core.has_permission` / `core.has_permission_in_tenant`
have no platform-staff short-circuit and no RLS policy references
`core.is_platform_staff()`: a staff user sees a tenant only through its own
membership and roles, like anyone else (pgTAP 0085: zero rows in every `api`
view). Staff act only through explicit staff-only functions that check
`core.is_platform_staff()` themselves and return no tenant PII (console gate
`api.is_platform_staff`, `api.platform_tenant_provisioning_list`,
`provision-tenant`). MFA (aal2) on those, staff roles and a platform audit log
come with the console (plan Phase B, DEBT-128 b).

**Platform-staff privilege is not self-mutable.** `core.users.is_platform_staff`
opens the console and its provisioning actions, so tenant users
must never be able to promote themselves. The `users_self_update` policy lets a
user edit their own row, but a `BEFORE UPDATE` trigger
(`supabase/migrations/0012_protect_platform_staff.sql`) blocks the `anon` /
`authenticated` roles from changing that column; promotion is a server-only
(`service_role`) action. See ADR 0005.

## 2. Tenant id derivation

The backend derives `tenant_id` from the authenticated user's membership
(`core.tenant_memberships` via `resolveTenantContext`). Never trust a `tenant_id`
from the request body.

## 3. Key handling

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only** (api/worker/db/seed). It must
  never be imported or referenced in `apps/web`. (ESLint guards `process.env`
  access; `createServiceClient` lives in a server-only package path.)
- The browser uses only `NEXT_PUBLIC_*` anon values + RLS.

## 4. LINE webhook verification

Verify `x-line-signature` (HMAC-SHA256 of the **raw** body with the channel
secret) before processing any event. Reject mismatches with 403.
See `@line-os/line/webhook` and `apps/api/src/line/line-webhook.controller.ts`.

## 5. PII protection

Encrypt: email, phone, address, customer name, employee name, LINE user id.

- Encryption: AES-256-GCM via `@line-os/db/crypto` (`encryptPII`/`decryptPII`).
  Stored in `bytea` columns suffixed `_encrypted`.
- Searchable PII uses a **blind index**: `*_encrypted` + `*_hash`, where the hash
  is `HMAC-SHA256(normalized_value, PII_HASH_PEPPER)` (`blindIndex`). This allows
  equality lookups without exposing the value.
- Keys/pepper come from env and never touch the database or browser.

## 6. Audit logging

Every mutating action writes `audit.audit_logs` via `writeAudit`: actor,
`actor_kind`, `tenant_id`, module, entity, entity_id, action, before/after (only
when safe — redact PII with `redactPII`), metadata, timestamp. The table is
append-only (DB trigger blocks update/delete).

## 7. AI safety

AI proposes; it never mutates business data directly. A human with `ai.approve`
approves, then the backend applies through permission-checked code and audits the
result. AI is tenant- and permission-scoped and never receives cross-tenant data.

## Secret rotation notes

- Rotating `PII_ENCRYPTION_KEY` requires re-encrypting existing blobs (plan a
  migration with key versioning before production).
- Rotating `PII_HASH_PEPPER` invalidates existing blind-index hashes; rebuild
  them in the same migration.
