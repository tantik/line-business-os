# ADR 0001: Record architecture decisions

- Status: Accepted
- Date: 2026-06-22

## Context

We need a durable, reviewable record of significant architectural choices for a
platform that many people and AI agents will extend over time.

## Decision

Use Architecture Decision Records (ADRs) stored in `docs/adr`, numbered
sequentially. Each ADR captures context, the decision, and consequences. ADRs are
immutable once accepted; supersede with a new ADR rather than editing history.

## Consequences

- Contributors can understand *why* the platform is shaped this way.
- Changes to core rules (tenancy, RLS, RBAC, PII) require a new ADR.
