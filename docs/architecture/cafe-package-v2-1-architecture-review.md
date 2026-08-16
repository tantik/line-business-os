# Cafe Package v2.1 — Architecture Review

## Classification

- branding: tenant configuration;
- header, attention centre, modal system, inventory list: reusable UI
  capabilities;
- shift change/cancellation: existing reusable Workforce capability;
- staff PII and recipe media: reusable Workforce/data capabilities;
- subscription lifecycle: reusable Core Platform capability.

## Simplest viable design

The accepted Cafe presentation components remain the shared UI. Preview server
components load tenant-scoped data; small client islands own dialogs and
optimistic navigation. Existing `workforce.shift_exchanges` is reused for
future shift cancellation/change requests instead of adding another request
table.

Brand display values are resolved from tenant settings with a safe product
fallback. `MATCHA-tea` is Preview configuration, not a code fork.

Staff email and LINE identity remain encrypted and are decrypted only inside
manager-authorized server actions. Recipe media uses a tenant-scoped private
bucket, validated MIME/size limits, opaque object keys, and signed rendering.

Subscription state is evaluated server-side. Access states are `active`,
`grace`, `frozen`, `archived`, and `purge_eligible`. Freeze makes business
surfaces read-only; the manager payment entry remains available. Archive and
purge are worker operations with audit records. No frontend code deletes data.

## Security and data boundaries

- every new business row has `tenant_id`; location-owned rows also have
  `location_id`;
- RLS is enabled and policy-scoped in the creating migration;
- browser surfaces use `api` facades and authenticated RLS, never service role;
- email, employee name, and LINE identity follow encrypted/hash storage;
- every mutation is tenant/location-authorized and audited;
- storage object paths cannot be supplied as arbitrary client-owned URLs;
- purge requires inactive billing state, retention expiry, dry-run evidence,
  and a separate execution gate.

## Regression-impact matrix

| Change | Staff | Recipes | Manager | Demo | DB/RLS | Acceptance neighbour |
|---|---|---|---|---|---|---|
| Shared header/brand | yes | yes | yes | verify unchanged | no | auth/logout/navigation |
| Shift request cell | yes | no | approvals | verify parity | existing exchange RLS | correction + schedule |
| Staff management | own summary | no | CRUD | compare fields | PII/facade | labour estimate |
| Recipe management/media | read | read | CRUD | compare editor | storage/RLS | translation display |
| Inventory list | count | no | CRUD | compare modal | existing inventory RLS | shortage/closing session |
| Subscription state | frozen shell | frozen shell | payment entry | unchanged | Core/RLS/audit | auth/tenant resolution |

## Rollback

UI slices can be reverted independently. Forward migrations are never edited or
renumbered; any schema rollback is a new forward migration. Subscription purge
execution remains disabled until its own acceptance gate.

## Approved external actions

The project owner approved local migrations/reset/pgTAP, commit, push, PR,
merge, Preview Cloud migration/deploy, and authenticated Preview acceptance.
Production customer data and destructive purge remain protected by the design
and are not required to validate this release.

