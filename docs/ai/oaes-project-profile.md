# OAES project profile — LINE Business OS

This file applies the vendor-independent
[ORUWA AI Engineering Standard](https://github.com/tantik/oaes) to this
repository. OAES owns the general engineering standard. This profile owns only
LINE Business OS-specific scope, roles, commands, and approval boundaries.

## Required workflow

Every non-trivial task moves through these gates in order:

```text
Repository Recovery
-> Product Review
-> Architecture Review
-> Implementation
-> Self Review
-> QA
-> Acceptance Report
-> Ready for Merge
```

No chat summary or handoff is proof of repository state. Repository Recovery
must confirm the branch, HEAD, working tree, remote relationship, relevant
migrations, and existing PR/merge state before planning implementation.

## Roles are review lenses

Roles are selected by risk; they are not a permanently running autonomous AI
team.

- Product Manager: user problem, Japanese SMB value, MVP scope, priority.
- CTO / Architect: reusable module fit, simplicity, cost, cross-module impact.
- Security Reviewer: tenant isolation, PII, secrets, privileged boundaries.
- Database / RLS Reviewer: migrations, tenant/location scope, policies, facade.
- Frontend / UX Reviewer: Japanese UI, mobile use, Demo/Preview parity.
- QA Reviewer: automated and observed manual evidence.
- Release Reviewer: scope, rollback, environment impact, merge readiness.

Use only the roles relevant to the change. Database work always requires the
Security and Database / RLS lenses. Customer-facing Cafe UI always requires
Frontend / UX and QA.

## Required artifacts

### Product Review

- problem and target user;
- now/later/reject decision;
- acceptance criteria;
- explicit out-of-scope items.

### Architecture Review

- affected modules and files;
- tenant, location, RLS, PII, audit, and API-facade impact;
- simplest viable approach;
- risks and rollback;
- approval-gated actions.

### Acceptance Report

- scope actually delivered;
- files changed;
- checks actually run and their results;
- observed browser/Preview evidence when UI changed;
- security, migration, tenant-isolation, and environment impact;
- known gaps and rollback note;
- exact next human gate.

## Authority boundaries

Local reading, analysis, reversible code/docs edits, and relevant read-only
tests may proceed within an approved scope. Safe local verification —
typecheck, lint, automated tests, build — runs first and is not itself gated
behind a separate approval; Core Laws Law 6 is "Human Authority at
High-Risk Boundaries," not "Human Approval Everywhere," and approval scales
with risk (`core-laws-and-product-dna.md` §21.2, §21.3 "Automation и Human
Authority: низкорисковые действия могут выполняться автоматически").

Explicit human approval is required before:

- creating or changing a database migration or RLS policy;
- resetting a local database or executing local migrations;
- installing a dependency or adding an external service;
- any Supabase Cloud, Vercel, DNS, or production write;
- changing auth, secrets, PII handling, roles, permissions, billing, or LINE
  broadcast behavior;
- merge, force-push, history rewrite, or branch/data deletion.

For an explicitly Founder-approved Standard mission whose mission file
authorizes the normal delivery lifecycle, commit, push to that mission's own
feature branch, and PR creation/update into `dev` do not each require a
separate approval request — this is the bounded delivery autonomy defined in
`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §9/§10. Outside that
explicit grant, commit/push/PR creation still requires approval like any
other externally visible action. This bounded autonomy never extends to
merge, production deployment, or any item in the list above.

Approval is narrow: approval for one action does not authorize the next gate.

## Project verification routing

- Documentation/process only: scope diff, link/path checks, secret-like scan,
  encoding/format review.
- TypeScript behavior: affected tests, typecheck, lint, production build.
- Cafe UI: automated checks plus authenticated visual browser acceptance; CI
  alone is insufficient.
- Database/RLS: static tenant audit, approved local reset, pgTAP, rollback and
  migration-history review.
- Cloud/Preview: read-only preflight first; writes and acceptance identities are
  separately approved and never copied into chat or Git.

Project helpers:

- `.agents/skills/linebos-pre-pr-verify/SKILL.md` routes local verification.
- `.agents/skills/linebos-tenant-rls-audit/SKILL.md` performs static DB/RLS
  review only.
- `docs/development/product-acceptance-workflow.md` defines Cafe acceptance.

## Context continuity

`docs/ai/current-task.md` must describe the verified current stage, baseline,
next gate, and safety boundaries. Update it when a major stage closes so the
next session does not reconstruct the project from stale chat history.
