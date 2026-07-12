# ADR 0010: Modular Product Governance and Client Request Classification

- Status: Accepted
- Date: 2026-07-12
- Phase: Originates in 1N-4C Slice A, but this decision is durable and
  project-wide — it governs every current and future ORUWA / LINE Business
  OS client and module, not only Mame To Cha.
- Relates to / Extends: ADR 0002 (multi-tenant RLS), ADR 0008 (`api` facade
  schema), ADR 0009 (safe growth and module rollout)

## Context

Mame To Cha has approved the current product and is the platform's first
real client. Acceptance and production rollout are tracked separately (see
`docs/phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md`), but
approval does not end the relationship: the client may request additions
during or after acceptance, and future clients will do the same.

LINE Business OS is a single multi-tenant SaaS platform. Every product runs
as a module inside one shared Core, never as an isolated project or
per-client codebase (`AGENTS.md`, `.cursor/rules/00-project-architecture.mdc`).
That constraint only holds in practice if every incoming client request is
evaluated architecturally and commercially *before* implementation, so that
useful requests become reusable platform configuration, capabilities, or
modules — and requests that would require a permanent tenant-specific fork
are identified and rejected before any code is written, not discovered as
technical debt afterward.

This ADR establishes the durable model and process for that evaluation. It
generalizes the module/capability/configuration model already in use for
Workforce (`core.module_code`, `core.tenant_modules`, `core.permissions`;
see ADR 0009) into a project-wide governance decision, so that individual
phase/feature plans can reference it instead of re-deriving it.

## Decision

### A. Three-level modular model

**Level 1 — Top-level product modules.** An independently enableable,
reusable, and potentially sellable business domain. Existing platform
module catalog (`core.module_code`, `core.tenant_modules`):

- `core`
- `workforce`
- `booking`
- `logistics`
- `crm`
- `inventory`
- `ai`

Do not create a top-level module for every screen or small client request.

**Level 2 — Capabilities inside a module.** A permission-scoped feature area
inside an existing module; it does not get its own `module_code` value and
shares the module's domain model. Example, Workforce capabilities:

- staff management
- scheduling
- attendance
- correction requests
- recipes/manuals
- LINE employee linking
- future exports and reports

Capabilities may be enabled/configured separately where justified, but
remain part of their parent module's entitlement, RLS, and permission
boundary.

**Level 3 — Tenant/location configuration.** Data, not code: values that
vary per tenant or per location without changing which code path runs.
Examples: shift types, start/end times, break rules, branding, locale,
limits, location-specific defaults, approved behavior switches.
Configuration changes behavior without creating client-specific code.

### B. Mandatory client-request classification

Every new request must be classified before implementation as exactly one
of:

1. Tenant configuration
2. Location configuration
3. Configuration of an existing module
4. Reusable capability inside an existing module
5. Reusable top-level product module
6. Temporary experiment with an owner and a removal/review date
7. Rejected tenant-specific fork

| Client request | Classification |
| --- | --- |
| Change AM shift time | Tenant/location configuration |
| Add a third shift type | Workforce configuration |
| Export attendance to CSV | Workforce capability |
| Track tea and milk stock | Inventory module |
| Add table reservations | Booking module |
| Use a different Mame To Cha color theme | Branding configuration |
| Add unique Mame To Cha-only business logic | First attempt to generalize; permanent tenant-specific fork is the last resort |

### C. Prohibited permanent tenant-specific logic

Permanent production logic of this shape is explicitly prohibited,
regardless of how small the request seems:

```ts
if (tenantSlug === 'mame-to-cha') {
  // client-specific behavior
}
```

Preferred model, in order of precedence:

- shared code;
- tenant/module entitlement (`core.tenant_modules`);
- role/permission checks (`core.has_permission`, `core.role_permissions`);
- validated tenant/location configuration;
- reusable capabilities;
- module-specific typed settings where needed (never an expanding untyped
  blob — see F).

A temporary tenant-specific experiment (class 6) is allowed only when it
has all of: a documented reason, an owner, a feature flag or isolated
boundary, a review/removal date, tests, and no tenant-isolation bypass.

### D. Decision process for every request

1. Describe the real business problem.
2. Identify affected users and locations.
3. Classify the request (B).
4. Check whether other tenants can reuse it.
5. Determine configuration vs. capability vs. module (A).
6. Analyze tenant isolation, RLS, roles, and PII impact.
7. Analyze module entitlement and dependencies.
8. Estimate implementation and maintenance cost.
9. Decide now / later / reject.
10. Write a scoped implementation plan.
11. Implement through a feature branch, then verify locally and in
    acceptance before production enablement.

### E. Required analysis output

For every significant client request, the technical/product review reports:

- business problem;
- classification;
- recommended architecture;
- what becomes reusable;
- tenant/location scope;
- data model impact;
- RLS and permission impact;
- module entitlement impact;
- UI impact;
- migration requirement;
- cost and complexity;
- risks;
- acceptance test;
- production rollout;
- recommendation: now, later, or reject.

### F. Module safety rules

- Modules are disabled by default for new tenants (ADR 0009).
- Module enable/disable is operator-controlled and approval-gated.
- Client managers cannot enable commercial product modules for themselves.
- Enable/disable operations require audit (`writeAudit`).
- `disable != delete`: disabling preserves operational data; no destructive
  cleanup occurs automatically.
- App routes and Server Actions must enforce module entitlement.
- RLS remains the tenant/role/location security boundary.
- Future DB-level module enforcement (a helper such as
  `core.is_module_enabled()`, invoked from RLS policies or centrally from
  `core.has_permission()`) is a separate, later hardening track — not
  authorized or designed in detail by this ADR.
- Secrets and permission grants do not belong in `tenant_modules.config`.
- Complex settings use typed, tenant-scoped, RLS-protected module tables,
  not an expanding `config` JSON blob.

### G. Module rollout lifecycle

For any request classified as class 4 (reusable capability inside an
existing module) or class 5 (reusable top-level product module):

1. Request classification (B).
2. Product decision.
3. Architecture plan.
4. Additive migration, if required.
5. `tenant_id`/`location_id` columns on any new table.
6. RLS in the same migration as the table.
7. Permissions added to `core.permissions`/`core.role_permissions`.
8. A narrow `api.*` facade view (internal schemas stay unexposed).
9. Disabled by default.
10. Local enablement first.
11. Local tests and pgTAP.
12. Acceptance enablement.
13. Client approval.
14. Production enablement.
15. Monitoring and rollback plan.

### H. Human approval boundaries

Human approval remains mandatory for:

- production deployment;
- Cloud DB migrations;
- module enable/disable in production;
- role/permission changes;
- billing;
- destructive cleanup;
- customer PII;
- mass messaging;
- LINE broadcasts;
- credentials and secrets.

### I. Relationship to Mame To Cha

Mame To Cha is the first real design partner and the first practical source
of reusable product requirements. Client requests should improve the common
ORUWA platform where possible, but Mame To Cha must not become a separate
fork or a separate application. Phase-specific implementation of this
decision for Mame To Cha/Workforce is tracked in
`docs/phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md`, which
references this ADR rather than restating it.

## Rationale

- The platform is single-codebase, multi-tenant, and growing toward
  hundreds of tenants (ADR 0009); per-client forks or one-off tenant checks
  do not scale and directly contradict that model.
- Classifying every request *before* implementation is what keeps "useful
  client feedback" from silently turning into unreviewed tenant-specific
  code — the classification step is the actual enforcement mechanism, not
  a formality.
- Config/capability/module already exists as working schema
  (`core.module_code`, `core.tenant_modules`, `core.permissions`); this ADR
  names the model explicitly so every future phase plan can point at one
  durable source instead of re-deriving or duplicating it.

## Consequences

- Every future client request — from any tenant — must pass through this
  classification and decision process before implementation starts.
- Phase/feature plans should reference this ADR for the general model and
  document only what is genuinely specific to that phase (e.g. a module
  matrix, a concrete gap finding, a phase-scoped enforcement plan).
- A request that only a tenant-specific `if` branch can satisfy is rejected
  outright (class 7) rather than implemented and revisited later.
- DB-level module enforcement (closing the gap where `core.has_permission()`
  does not yet check `tenant_modules.is_enabled`) remains explicitly
  unimplemented until a separate, dedicated hardening design is approved.
