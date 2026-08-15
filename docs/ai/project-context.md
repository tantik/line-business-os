# LINE Business OS - AI Project Context

> **Superseded, 2026-08-15 (ORUWA AI Governance Consolidation, Phase 2B).**
> Not a canonical entry point (`documentation-and-decision-hierarchy.md` §2)
> and orphaned from the authority chain. Reviewed in full: §1–8 and §10–13
> duplicate `AGENTS.md`/Core Laws/`.cursor/rules/*` (already canonical, no
> migration needed); §9 (onboarding CLI stages) is historical and superseded
> by the current `packages/db/scripts/onboard-tenant.ts` implementation;
> §13 (ChatGPT-as-CTO/Cursor-paused/Codex-emergency-only operating model) is
> stale, superseded by `ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §2; §14
> (roadmap direction) is already covered by
> `docs/foundation/platform-foundation-roadmap.md` and
> `docs/foundation/oruwa-portfolio-and-module-strategy.md`. No unique,
> still-valid content requiring migration was found — kept only pending
> Phase 2C deletion, do not update further. Full disposition:
> `docs/ai/ORUWA_AI_GOVERNANCE_CONSOLIDATION_AUDIT.md`.

## 1. Purpose

LINE Business OS is a single multi-tenant SaaS platform for Japanese small and medium-sized businesses.

The platform is intended to combine LINE-based customer communication, business operations, AI automation, CRM, booking, workforce management, analytics, and future vertical modules under one shared SaaS architecture.

The goal is not to create a separate project for every customer. The goal is to build one platform where each customer business is represented as a tenant.

## 2. Product direction

LINE Business OS should become an umbrella business platform for Japanese SMBs.

Planned and current module areas include:

* Core
* Workforce
* Booking
* AI Support
* CRM
* Logistics
* Inventory
* future vertical business modules

The first product focus is practical MVP value, not enterprise over-engineering.

The platform should start economically and avoid unnecessary infrastructure complexity, while keeping the architecture safe enough to grow toward 300+ tenants.

## 3. Target market

Primary market:

* Japan
* small and medium-sized businesses
* local service businesses
* cafes and restaurants
* appointment-based businesses
* logistics and delivery businesses
* businesses already using or likely to use LINE Official Account

Important market assumptions:

* LINE is a key customer communication channel in Japan.
* Japanese businesses often need simple operational tools, not complex enterprise software.
* Trust, clear process, Japanese localization, privacy handling, and reliable operations matter.
* Product should be practical, not abstract AI hype.

## 4. Architecture principles

Core principles:

* one main SaaS platform;
* multi-tenant architecture;
* each customer business is a tenant;
* tenant-scoped business data;
* location-aware business data where physical locations exist;
* modular product design;
* strict tenant isolation;
* security-first Supabase/PostgreSQL design;
* app-facing API/facade layer separated from internal schemas where useful;
* auditability for important operations;
* minimal infrastructure at MVP stage.

Important identifiers:

* `tenant_id` identifies the customer/business tenant;
* `location_id` identifies a physical store, branch, office, or operational location;
* modules define enabled product capabilities for a tenant.

## 5. Database and schema model

The project uses Supabase/PostgreSQL.

Known schema direction:

* `core` - platform core objects such as tenants, users, memberships, roles, modules;
* `audit` - audit trail and operational history;
* `workforce` - workforce-related product module;
* `booking` - booking-related product module;
* `ai` - AI-related product module;
* `api` - app-facing facade/API layer.

Important rule:

Internal schemas should remain internal. Application reads should go through safe app-facing interfaces such as `api` facade objects when appropriate.

Cloud Data API exposure should be narrow. The `api` schema may be exposed where intentionally designed. Internal schemas must not be exposed accidentally.

## 6. RLS and tenant isolation

PostgreSQL Row Level Security is a central security boundary.

Business tables must be tenant-scoped where applicable.

Expected design direction:

* tenant-scoped tables include `tenant_id`;
* location-scoped tables include `location_id` when needed;
* application-facing access must respect the authenticated user and tenant membership;
* app/frontend must not bypass tenant isolation;
* server code must not use privileged access casually;
* any privileged operation requires separate review.

Tenant isolation is more important than speed of implementation.

## 7. LINE platform integration

LINE Business OS should account for:

* LINE Official Account;
* LINE Messaging API;
* LIFF;
* customer support chat flows;
* AI customer support;
* AI sales agent flows;
* knowledge base integration;
* RAG-style retrieval where appropriate;
* safe handling of customer messages and personal data;
* no uncontrolled mass messaging;
* no LINE broadcast without human approval.

LINE integration should be modular and tenant-aware.

## 8. AI automation direction

AI should reduce manual work for SMBs.

Possible AI features:

* AI customer support;
* AI sales assistant;
* FAQ and knowledge-base answering;
* booking support;
* staff scheduling assistance;
* operational analytics summaries;
* internal admin helpers;
* onboarding assistants.

Important AI policy:

* do not automate high-risk actions without human approval;
* no autonomous production deploy;
* no autonomous database migration;
* no autonomous billing changes;
* no autonomous LINE broadcast;
* no autonomous customer onboarding;
* no autonomous handling of sensitive production data without reviewed controls.

AI should assist operators and customers, not silently control critical business operations.

## 9. Current onboarding state

Phase 1H built a local-first onboarding workflow.

Completed stages:

* Stage 4A: pure preflight aggregator;
* Stage 4B: report-only preflight CLI;
* Stage 4C: preflight before local dry-run;
* Stage 4D: preflight before local commit;
* Stage 4E: final operator report and cleanup UX;
* Stage 5A: real customer onboarding safety model design document.

Current local dry-run chain:

```text
preflight
-> local transaction
-> rollback
-> final operator report
```

Current local commit chain:

```text
commit gates
-> preflight
-> backup artifact gate
-> local commit transaction
-> final operator report
```

Local onboarding is not production onboarding.

Real customer onboarding requires further design, approval gates, backup/rollback planning, privacy/legal review, and a human-approved runbook.

## 10. Existing safety rules

Critical prohibitions:

* do not use `service_role` in frontend;
* do not expose secrets;
* do not print raw database URLs;
* do not print DB passwords;
* do not print tokens or cookies;
* do not print raw customer PII;
* do not print raw owner IDs or customer emails in CLI output;
* do not run destructive SQL without explicit approval;
* do not change Supabase config without explicit approval;
* do not run production/customer onboarding without explicit approval;
* do not modify billing/subscription state without explicit approval;
* do not send LINE broadcast or mass messages without explicit approval.

High-risk actions requiring explicit human approval:

* production deploy;
* Cloud database write;
* production database write;
* migrations;
* destructive SQL;
* Supabase project configuration changes;
* RLS policy changes;
* billing changes;
* LINE broadcast;
* real customer onboarding;
* credentials/secrets changes;
* permission/role model changes;
* customer PII processing changes.

## 11. Git workflow

Main repository:

* `tantik/line-business-os`

Branch model:

* `main` is stable baseline;
* `dev` is the working integration branch;
* feature work should be done on feature branches;
* PRs should target `dev`;
* do not merge before review for risky changes.

Recommended workflow:

```text
git checkout dev
git pull origin dev
git checkout -b feature/<stage-name>
make small scoped changes
run validation
commit
push
open PR to dev
review
merge
sync dev
delete feature branch
```

Do not combine unrelated large changes in one PR.

## 12. Validation expectations

For docs-only stages:

* `git --no-pager diff --check`;
* hidden/bidi Unicode scan;
* secret-like value scan;
* email/UUID scan if the document should contain no real identifiers;
* PR review.

For code stages:

* package-level tests;
* typecheck;
* lint;
* build where relevant;
* full workspace turbo check when appropriate;
* safety scans;
* source guards where relevant;
* PR review.

For database/RLS/migration stages:

* plan/review before implementation;
* local validation;
* pgTAP where applicable;
* rollback plan;
* backup consideration;
* no Cloud/prod changes without explicit approval.

## 13. Current low-cost AI workflow

Cursor Agent is temporarily paused because the monthly usage limit was reached.

Current operating model:

* ChatGPT acts as CTO, Architect, Product Manager, Reviewer, and task planner;
* VS Code is the editor;
* PowerShell is the execution environment;
* GitHub PR is the control point;
* Codex in VS Code is reserved for rare, tightly scoped emergency patches only.

Codex usage policy:

* do not use Codex for docs-only work;
* do not use Codex for broad architecture decisions;
* do not use Codex for migrations, RLS, Supabase config, Cloud writes, or production actions without a strict prompt and review;
* use Codex only for small isolated patches or hard-to-debug local errors;
* Codex must not modify unrelated files;
* Codex must explain intended files before editing when risk is non-trivial.

## 14. Product roadmap direction

Near-term direction:

* finish onboarding safety and handoff documentation;
* harden local operator runbooks;
* design Cloud-dev/staging onboarding before implementation;
* define production/customer onboarding approval checklist;
* prepare first real customer onboarding runbook;
* then proceed toward real pilot customer onboarding only after review.

Medium-term product direction:

* improve tenant dashboard;
* add tenant/location/module management;
* add LINE integration foundation;
* add AI support module;
* add booking/workforce operational modules;
* add billing/subscription model;
* add admin/operator tooling.

Long-term direction:

* support 300+ tenants;
* maintain tenant isolation and auditability;
* keep modular expansion possible;
* build a portfolio of LINE-integrated business apps under one platform.

## 15. How AI tools should use this document

Before helping on this project, an AI tool should read this file and the current task file.

The AI should identify:

* current branch;
* current stage;
* allowed files;
* forbidden actions;
* validation commands;
* security constraints;
* whether the change is docs-only, code, database, or Cloud-related.

If unclear, the AI should ask for clarification instead of guessing.

No AI tool should assume production readiness.
