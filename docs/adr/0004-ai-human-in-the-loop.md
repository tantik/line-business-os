# ADR 0004: AI is human-in-the-loop for business data

- Status: Accepted
- Date: 2026-06-22

## Context

The platform will use AI assistants across modules. Allowing AI to mutate
business data directly is risky (incorrect, irreversible, cross-tenant leakage).

## Decision

AI never writes business data directly. The flow is:

```
AI proposes → Manager approves → Backend applies → Audit log records
```

Proposals are stored in `ai.proposals` (tenant- and permission-scoped). A human
with `ai.approve` approves; the backend then applies the change through normal,
permission-checked module code and writes an audit entry. Prompts/responses are
logged in `ai.prompt_logs` with PII redacted. Implemented in `@line-os/ai`.

## Consequences

- Every AI-driven change is reviewable and auditable.
- AI cannot exceed the proposing user's tenant/permission scope.
- Slightly more friction for automation — intentional for safety.
