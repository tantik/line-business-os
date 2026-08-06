# ADR 0011: Cafe v2.1 Preview audit exception

- Status: Accepted
- Date: 2026-08-06
- Decision owner: Founder
- Scope: Cafe Package v2.1 Preview Freeze only
- Supersedes: none

## Context

`AGENTS.md` rule 7 requires every mutation to write a business audit event via
`writeAudit`. Current Cafe/Inventory Preview mutations do not write
`audit.audit_logs`; they rely on database-triggered actor and timestamp columns.
Adding a complete audit-writing path requires a separately reviewed privileged
backend/API design and may require migrations, RLS/grant changes, and broader
mutation regression work. Expanding Cafe v2.1 closeout into that architecture
change would mix Preview Freeze evidence with Platform Foundation work.

## Decision

For Cafe Package v2.1 **Preview Freeze only**, the existing database-triggered
actor/timestamp stamping is accepted as a temporary, documented exception to
the `writeAudit` requirement.

This decision does not edit or weaken `AGENTS.md` rule 7. It does not declare
the current stamps equivalent to full business audit events. It authorizes no
migration, RLS, grant, auth, service-role, production, or Cloud-data change.

Full business audit events are mandatory before Cafe Commercial Release. Their
implementation must be a separate OAES task with Product/Architecture Review,
Security and Database/RLS review, rollback design, automated isolation tests,
and authenticated acceptance.

## Boundaries

- Applies only to the existing Cafe v2.1 Preview mutation surface.
- Does not apply to production enablement or Commercial Release.
- Does not apply to new Cafe features, other modules, or future verticals.
- Does not permit direct frontend writes to `audit.audit_logs` or frontend use
  of `service_role`.
- Does not waive tenant/location authorization, RLS, PII, or permission rules.
- Any mutation added after this decision requires normal audit review and
  cannot inherit this exception automatically.

## Exit criteria

The exception ends before Commercial Release when a reviewed audit path:

1. records actor, tenant, module, entity, action, timestamp, and safe
   before/after metadata;
2. keeps privileged writes server-side;
3. proves tenant/location isolation and permission enforcement;
4. covers the Cafe mutation inventory with automated tests;
5. passes approved local/Cloud migration and authenticated acceptance gates.

## Consequences

- P1-4 is resolved as a Founder-accepted Preview exception, not as a code fix.
- Cafe v2.1 Preview Freeze may proceed without building Platform audit
  infrastructure in the closeout.
- Cafe Commercial Release remains blocked until the exit criteria are met.
- The global engineering standard remains strict and unchanged.
