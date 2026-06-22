# ADR 0002: Single database, shared schema, RLS-enforced multi-tenancy

- Status: Accepted
- Date: 2026-06-22

## Context

We serve many SMB tenants, each with locations and modules. Options considered:

1. Database-per-tenant — strong isolation, heavy operations, hard cross-tenant
   platform features and migrations at SMB scale.
2. Schema-per-tenant — moderate isolation, migration sprawl.
3. **Shared schema with `tenant_id` + Row Level Security** — one migration set,
   isolation enforced in the database.

## Decision

Adopt option 3. Every business table carries `tenant_id` (and `location_id` when
physical). PostgreSQL RLS enforces isolation using `core.is_member_of` and
`core.has_permission`. The backend derives `tenant_id` from membership and uses
the service-role client only for permission-checked, audited writes.

## Consequences

- Simple operations and a single migration history.
- Isolation correctness depends on disciplined RLS — every new table MUST add
  policies (enforced by review + `AGENTS.md` checklist).
- `service_role` must remain server-only; leaking it bypasses RLS.
