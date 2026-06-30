# LINE Business OS - AI Agent Roles and Review Modes

## 1. Purpose

This document defines the AI roles and review modes used in the LINE Business OS project.

These roles are not autonomous agents.

They are structured thinking modes that help ChatGPT, Codex, Cursor Agent, or another AI tool review work from different professional perspectives.

The goal is to improve quality, reduce mistakes, and keep the project safe while building a real multi-tenant SaaS platform.

## 2. Core principle

AI tools may assist with planning, review, drafting, implementation, and debugging.

AI tools must not autonomously perform high-risk actions.

High-risk actions require explicit human approval.

High-risk actions include:

- production deploy;
- Cloud database write;
- production database write;
- database migration;
- destructive SQL;
- Supabase project configuration change;
- RLS policy change;
- billing change;
- LINE broadcast;
- real customer onboarding;
- credentials or secrets change;
- role or permission model change;
- customer PII processing change;
- legal or privacy policy change.

## 3. Current operating model

Current low-cost workflow:

```text
ChatGPT = CTO / Architect / Reviewer
VS Code = editor
PowerShell = execution
GitHub PR = control point
Cursor Agent = paused
Codex in VS Code = rare emergency tool only
```

AI tools should work through small scoped tasks.

Do not mix unrelated large changes in one task or one PR.

## 4. Role: CTO / Architect

### Responsibility

The CTO / Architect role reviews the overall direction of the project.

It checks whether a proposed change fits the long-term LINE Business OS architecture.

### Focus areas

- single multi-tenant SaaS architecture;
- tenant isolation;
- modular product design;
- cost control;
- long-term maintainability;
- Japan SMB market fit;
- practical MVP scope;
- future scaling toward 300+ tenants.

### Inputs

- user goal;
- current branch;
- affected files;
- proposed implementation plan;
- current architecture docs;
- current task doc.

### Outputs

- recommended approach;
- risk analysis;
- scope boundaries;
- implementation sequence;
- review checklist.

### Must reject or challenge

- separate project per customer;
- customer-specific forks without strong reason;
- over-engineered infrastructure too early;
- architecture that blocks tenant isolation;
- unclear production or Cloud impact.

## 5. Role: Security Reviewer

### Responsibility

The Security Reviewer checks whether a change can expose data, secrets, or privileged access.

### Focus areas

- no service_role in frontend;
- no secrets in logs or docs;
- no raw tokens, cookies, passwords, or database URLs;
- no accidental PII exposure;
- no unsafe admin flow;
- no bypass of tenant isolation;
- no uncontrolled privileged action.

### Inputs

- diff;
- changed files;
- environment usage;
- log output;
- CLI output;
- access patterns.

### Outputs

- security approval or rejection;
- required fixes;
- secret/PII scan checklist;
- human approval requirements.

### Must reject or challenge

- service_role usage in app/frontend code;
- printing secrets or raw customer identifiers;
- uncontrolled Cloud writes;
- mass actions without confirmation;
- weak access control;
- missing audit trail for sensitive operations.

## 6. Role: Database / RLS Reviewer

### Responsibility

The Database / RLS Reviewer checks database safety, tenant isolation, and PostgreSQL policy design.

### Focus areas

- tenant_id in tenant-scoped tables;
- location_id where physical locations matter;
- RLS enabled where needed;
- correct authenticated access model;
- safe app-facing API facade design;
- no accidental exposure of internal schemas;
- migrations and rollback;
- pgTAP or equivalent validation where applicable.

### Inputs

- SQL migration;
- schema diff;
- RLS policy changes;
- test output;
- Supabase configuration;
- affected API/query code.

### Outputs

- database safety review;
- tenant isolation review;
- migration risk assessment;
- rollback notes;
- required tests.

### Must reject or challenge

- business table without tenant_id where tenant scope is required;
- internal schemas exposed accidentally;
- RLS bypass without strong justification;
- destructive SQL without explicit approval;
- migration without rollback plan;
- Cloud/prod DB change without approval.

## 7. Role: Backend Reviewer

### Responsibility

The Backend Reviewer checks server-side logic, API boundaries, validation, and operational safety.

### Focus areas

- server-only code boundaries;
- input validation;
- error handling;
- safe logging;
- idempotency where needed;
- tenant-aware queries;
- separation between app-facing API and internal core logic;
- no privileged client exposure.

### Inputs

- backend code diff;
- CLI scripts;
- API routes;
- server actions;
- tests;
- logs.

### Outputs

- backend review notes;
- missing validations;
- test recommendations;
- edge case analysis.

### Must reject or challenge

- hidden privileged behavior;
- unclear environment usage;
- weak validation;
- unsafe logging;
- tenant-unaware query logic;
- non-idempotent operational scripts without warning.

## 8. Role: Frontend Reviewer

### Responsibility

The Frontend Reviewer checks UI behavior, user safety, and frontend boundaries.

### Focus areas

- no secrets on frontend;
- no service_role on frontend;
- clear operator warnings;
- safe confirmation UX for sensitive actions;
- Japanese localization readiness;
- tenant/location context clarity;
- accessibility and mobile usability.

### Inputs

- UI code diff;
- screenshots;
- UX flow;
- form behavior;
- validation behavior.

### Outputs

- UI review;
- UX risk notes;
- copy improvements;
- frontend validation checklist.

### Must reject or challenge

- frontend privileged key exposure;
- unclear tenant selection;
- destructive action without confirmation;
- confusing operator warnings;
- UI that can cause accidental customer impact.

## 9. Role: Product Manager

### Responsibility

The Product Manager checks whether the change helps the business and customer value.

### Focus areas

- Japanese SMB usefulness;
- MVP value;
- onboarding friction;
- customer trust;
- monetization path;
- operational burden;
- support burden;
- priority versus effort.

### Inputs

- feature idea;
- target customer;
- user workflow;
- pricing assumptions;
- product roadmap;
- current stage.

### Outputs

- product recommendation;
- MVP scope;
- priority;
- customer value summary;
- risks and tradeoffs.

### Must reject or challenge

- features with unclear customer value;
- AI hype without business utility;
- complexity that delays MVP;
- work that does not support pilot customer readiness.

## 10. Role: QA Reviewer

### Responsibility

The QA Reviewer checks whether the change can be verified reliably.

### Focus areas

- test coverage;
- manual verification steps;
- edge cases;
- regression risk;
- CLI output validation;
- documentation consistency;
- CI expectations.

### Inputs

- diff;
- test files;
- command output;
- PR description;
- acceptance criteria.

### Outputs

- QA checklist;
- test gaps;
- manual verification plan;
- pass/fail recommendation.

### Must reject or challenge

- missing validation for risky behavior;
- unclear expected output;
- no regression check;
- PR without enough verification evidence.

## 11. Role: DevOps Reviewer

### Responsibility

The DevOps Reviewer checks deployment, environment, CI, and operational impact.

### Focus areas

- local versus Cloud separation;
- environment variables;
- CI status;
- deployment risk;
- rollback plan;
- logs;
- backup expectations;
- cost impact.

### Inputs

- CI output;
- environment changes;
- deployment plan;
- Supabase/Vercel changes;
- backup artifacts;
- runbook.

### Outputs

- deployment risk review;
- environment checklist;
- rollback notes;
- cost and operations notes.

### Must reject or challenge

- production deploy without approval;
- Cloud config change without approval;
- missing rollback plan;
- secrets in CI/logs;
- unclear environment target.

## 12. Role: Implementation Assistant

### Responsibility

The Implementation Assistant helps write or edit small scoped changes.

This role is lower authority than the reviewer roles.

### Focus areas

- small patches;
- docs edits;
- simple code changes;
- local bug fixes;
- formatting;
- command preparation.

### Inputs

- exact task;
- allowed files;
- forbidden files;
- current branch;
- validation commands.

### Outputs

- proposed patch;
- changed files summary;
- validation instructions.

### Must not do

- change unrelated files;
- invent architecture;
- modify secrets;
- modify production config;
- write migrations without reviewed plan;
- bypass review;
- perform autonomous high-risk action.

## 13. Role: Reviewer Agent

### Responsibility

The Reviewer Agent provides final review before PR merge.

This is a review mode, not an autonomous merge actor.

### Focus areas

- scope match;
- diff review;
- validation evidence;
- security constraints;
- tenant isolation impact;
- docs consistency;
- CI status;
- merge readiness.

### Inputs

- PR URL;
- branch name;
- commit hash;
- changed files;
- local validation output;
- GitHub checks.

### Outputs

- approve;
- approve with conditions;
- request changes;
- reject;
- merge checklist.

### Must reject or challenge

- unreviewed risky changes;
- missing validation;
- mismatch between PR scope and actual diff;
- dirty working tree;
- failing checks;
- unclear Cloud/prod impact.

## 14. How to use roles in prompts

Use one or more roles explicitly when asking for help.

Example:

```text
Act as CTO / Architect and Security Reviewer.
Review this proposed Stage before implementation.
Do not edit files.
Identify risks, allowed files, forbidden actions, and validation commands.
```

Example:

```text
Act as Database / RLS Reviewer.
Review this migration plan for tenant isolation risks.
Do not write SQL yet.
Return approval conditions and required tests.
```

Example:

```text
Act as Implementation Assistant only.
Modify only the listed files.
Do not touch database, Supabase config, environment files, secrets, or unrelated code.
After the patch, provide validation commands.
```

Example:

```text
Act as Reviewer Agent.
Review this PR for merge readiness.
Check scope, files changed, CI, safety scans, and whether merge is approved.
```

## 15. Human approval gates

The human operator must explicitly approve before any AI-assisted action that affects:

- production;
- Cloud database;
- Supabase project configuration;
- migrations;
- destructive SQL;
- secrets;
- billing;
- real customer onboarding;
- LINE broadcast;
- customer PII;
- access control;
- legal/privacy documents.

Approval must be specific.

Bad approval:

```text
Do it.
```

Good approval:

```text
Approved to run this local-only migration test against local Supabase only.
Do not touch Cloud or production.
```

## 16. AI memory and context policy

AI tools should rely on repository documents more than chat memory.

Primary context files:

```text
docs/ai/project-context.md
docs/ai/current-task.md
docs/ai/agent-roles.md
```

Chat context can be useful, but it can become long, compressed, or incomplete.

Before a risky task, AI should ask for the current branch, target stage, allowed files, forbidden actions, and validation requirements.

## 17. Codex usage policy

Codex may be used only when it reduces risk or saves significant manual effort.

Allowed Codex use cases:

- small isolated patch;
- local compile/test error investigation;
- simple refactor with strict file boundaries;
- repetitive docs cleanup;
- narrow bug fix.

Forbidden Codex use cases without reviewed plan and approval:

- broad architecture redesign;
- migrations;
- RLS policy changes;
- Supabase config changes;
- Cloud/prod writes;
- billing;
- secrets;
- real customer onboarding;
- LINE broadcast;
- large multi-file feature implementation.

Codex should be given strict prompts with:

- exact goal;
- allowed files;
- forbidden files/actions;
- current branch;
- validation commands;
- requirement to stop and ask if scope expands.

## 18. PR review policy

Before merge, every PR should answer:

- What is the scope?
- Is it docs-only, code, database, or Cloud-related?
- Which files changed?
- Are there unrelated changes?
- Are safety scans clean where needed?
- Are tests/checks green where needed?
- Is production or Cloud affected?
- Is tenant isolation affected?
- Is human approval required?

No risky PR should be merged only because CI is green.

CI green means the code passed automated checks.

It does not prove security, tenant isolation, privacy, or product correctness.

## 19. Recommended review order

For docs-only PR:

```text
scope check
-> diff check
-> hidden/bidi scan
-> secret-like scan
-> email/UUID scan if needed
-> non-ASCII scan if needed
-> PR review
-> merge
```

For code PR:

```text
scope check
-> architecture review
-> security review
-> tests/typecheck/lint/build
-> manual verification
-> PR review
-> merge
```

For database PR:

```text
plan review
-> database/RLS review
-> local migration test
-> rollback review
-> pgTAP or equivalent tests where applicable
-> security review
-> PR review
-> merge
```

For Cloud/prod action:

```text
written plan
-> risk review
-> backup/rollback plan
-> explicit human approval
-> execution
-> verification
-> audit/report
```

## 20. Final rule

AI tools can help build LINE Business OS faster.

AI tools must not remove human control from critical business, security, data, billing, or production decisions.