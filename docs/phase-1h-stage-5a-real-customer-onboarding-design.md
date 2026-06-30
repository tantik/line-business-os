# Phase 1H Stage 5A — Real Customer Onboarding Design / Review

## 1. Executive summary

LINE Business OS currently has a local-only onboarding workflow.

The existing workflow is suitable for local development, local operator verification, and controlled internal testing. It is not yet a production customer onboarding process.

Real customer onboarding is higher risk because it can involve customer data, tenant records, owner access, role assignments, module activation, audit history, and future billing/customer communication workflows. Any Cloud or production write path must be treated as a controlled operation with explicit human approval.

This document defines the safety model for evolving from local-only onboarding toward real customer onboarding for Japanese small and medium-sized businesses.

This stage does not implement Cloud changes. It does not modify code, migrations, Supabase configuration, production data, or customer records.

No Cloud or customer onboarding should happen before this design is reviewed and the next implementation stages are explicitly approved.

## 2. Current state

The completed onboarding work provides a controlled local operator workflow.

Completed stages:

* Stage 4A: pure preflight aggregator.
* Stage 4B: report-only preflight CLI.
* Stage 4C: preflight before local dry-run.
* Stage 4D: preflight before local commit.
* Stage 4E: final onboarding operator report and cleanup UX.

Current local dry-run safety chain:

```text
preflight
→ local transaction
→ rollback
→ final operator report
```

Current local commit safety chain:

```text
commit gates
→ preflight
→ backup artifact gate
→ local commit transaction
→ final operator report
```

The current workflow is intentionally local-first.

Important current safety properties:

* preflight can block unsafe input before DB interaction;
* Cloud-looking database targets are blocked before local transaction paths;
* local dry-run uses rollback and persists no data;
* local commit requires explicit gates;
* local commit requires a backup artifact gate;
* output is redacted;
* onboarding scripts stay outside frontend app flows;
* `service_role` is not used in frontend/app code;
* app-facing access should continue to go through the `api` facade and RLS-aware paths.

## 3. Target future onboarding model

The future real customer onboarding model should onboard a business as a tenant inside one multi-tenant SaaS platform.

A customer onboarding operation may create or verify:

* tenant record;
* owner user mirror;
* tenant membership;
* tenant-wide owner role assignment;
* initial business location;
* enabled tenant modules;
* audit log rows;
* dashboard visibility through the `api` facade;
* post-onboarding verification evidence.

The target model must stay aligned with LINE Business OS architecture:

* one SaaS platform, not one project per customer;
* each customer business is a tenant;
* business tables must remain tenant-scoped by `tenant_id`;
* physical stores/branches should use `location_id`;
* PostgreSQL RLS must remain central to tenant isolation;
* internal schemas must not become public API surfaces;
* app-facing reads should use safe `api` facade objects;
* audit logs must record meaningful onboarding events;
* customer data must be minimized and redacted in operator output;
* Japanese localization and Japanese SMB operational expectations should be considered.

The first real customer onboarding should remain manual, checklist-based, and human-approved.

A fully autonomous production onboarding flow is not approved by this design.

## 4. Environment model

### Local

Purpose:

* development;
* local verification;
* dry-run testing;
* local commit testing;
* operator workflow testing.

Allowed onboarding operations:

* validation-only runs;
* local dry-run;
* local commit with explicit gates and backup artifact.

Required approvals:

* developer/operator confirmation for local commit.

Backup requirement:

* local commit requires a valid backup artifact gate.

Verification requirement:

* CLI output review;
* local dashboard verification where applicable;
* local DB checks where needed.

Rollback/incident response expectation:

* local rollback can use local backup/restore procedures;
* failed local experiments should not affect Cloud or production.

### Cloud dev / staging

Purpose:

* future non-production Cloud verification;
* staging-like customer onboarding rehearsal;
* read-only verification of deployed app behavior;
* controlled Cloud-dev write design after explicit approval.

Allowed onboarding operations:

* read-only verification only until a Cloud-dev write design is approved;
* future Cloud-dev writes only after a separate design and approval.

Required approvals:

* explicit approval before any Cloud database write;
* explicit approval before changing Supabase project settings.

Backup requirement:

* backup strategy must be reviewed before Cloud-dev write operations;
* no Cloud-dev write should happen without a known restore/incident path.

Verification requirement:

* tenant isolation checks;
* dashboard checks through `api` facade;
* internal schema exposure checks;
* RLS behavior checks.

Rollback/incident response expectation:

* incident procedure must be documented before write operations;
* accidental Cloud writes must be escalated and reviewed.

### Production

Purpose:

* real customer operation;
* live tenants;
* live customer data;
* live billing/customer support context.

Allowed onboarding operations:

* no production onboarding until a production checklist and approval process exist;
* first production onboarding must be manual and supervised.

Required approvals:

* explicit human approval;
* production readiness review;
* backup confirmation;
* privacy/legal review where applicable;
* customer confirmation where applicable.

Backup requirement:

* backup before write;
* backup artifact or equivalent approved backup evidence;
* restore plan must be known before onboarding.

Verification requirement:

* tenant exists;
* tenant kind is correct;
* owner membership is active;
* owner role assignment exists;
* initial location exists;
* selected modules are enabled;
* audit rows are recorded;
* dashboard reads through `api`;
* internal schemas remain unexposed;
* no frontend `service_role` usage.

Rollback/incident response expectation:

* production incident response path must be documented;
* destructive actions require separate approval;
* data correction must be audited.

## 5. Approval gates

The following actions require explicit human approval:

* production onboarding;
* any Cloud database write;
* migrations;
* destructive SQL;
* Supabase configuration changes;
* billing or subscription changes;
* LINE broadcast or mass messaging;
* real customer PII processing;
* permission or role changes;
* service credentials or secrets changes;
* changes to RLS policies;
* exposing schemas through Data API;
* production deploys related to onboarding behavior.

Approval must be explicit, recorded, and scoped to the specific operation.

Approval for one environment does not imply approval for another environment.

## 6. Data/privacy model

Customer onboarding may involve:

* owner auth user id;
* owner email;
* tenant name;
* tenant slug;
* location name;
* selected module codes;
* audit metadata;
* operator verification notes.

Operator output must not print:

* raw `DATABASE_URL` value;
* DB password;
* `service_role` value;
* tokens;
* cookies;
* raw owner id;
* raw customer email;
* unnecessary UUIDs;
* real customer PII;
* secret values;
* private keys.

Environment variable names may appear in cleanup checklists when needed, but their values must not be printed.

Customer data should be minimized. Audit metadata should be useful but not contain raw PII unless a reviewed policy explicitly allows it.

Japanese privacy/legal review is required before production customer onboarding.

This document is not legal advice.

## 7. Service role policy

`service_role` must never be used on the frontend.

Normal app flows should use:

* anon/RLS-aware clients;
* server-side code with strict boundaries;
* app-facing API/facade layers where appropriate.

Any privileged operation must be:

* isolated from frontend code;
* manually approved;
* audited;
* limited in scope;
* documented;
* reviewed before production use.

Current onboarding scripts must remain outside `apps/web`.

Cloud or production privileged onboarding requires a separate design before implementation.

No future convenience feature should bypass RLS or tenant isolation without a separate security review.

## 8. Backup and rollback policy

Before any real customer write, the operator must confirm:

* backup exists before write;
* backup is fresh enough for the operation;
* backup is encrypted or otherwise protected according to the approved backup model;
* restore procedure is known;
* incident procedure is known;
* operation is approved for the target environment.

Current local backup behavior exists for local commit safety.

Cloud and production backup behavior must be reviewed separately before implementation.

No destructive action is allowed without a separate approval.

Rollback must not be improvised during a customer incident. The expected restore/correction path must be known before the write.

## 9. Verification checklist

After onboarding, the operator must verify:

* tenant exists;
* tenant kind is `client`;
* owner membership is active;
* tenant-wide owner role assignment exists;
* initial location exists;
* selected modules are enabled;
* audit rows are recorded;
* dashboard can read the tenant through the `api` facade;
* internal schemas remain unexposed;
* no `service_role` is involved in frontend/app flows;
* no raw PII is printed in operator output;
* cleanup checklist has been completed;
* incident notes are recorded if anything failed or required manual correction.

For Japanese SMB customers, verification should also confirm that customer-facing names, business names, and module labels are suitable for Japanese operational use.

## 10. Proposed implementation roadmap

### Stage 5B — local operator command hardening / docs sync

Goal:

* align local runbooks with the completed Stage 4A-4E workflow;
* document exact local dry-run and local commit commands;
* document cleanup and verification steps.

What changes:

* docs/runbooks only, or minimal CLI help text if separately approved.

Forbidden:

* Cloud writes;
* production writes;
* migrations;
* Supabase config changes;
* app code changes.

Validation required:

* docs diff check;
* safety scan;
* command examples reviewed for secret safety.

### Stage 5C — staging / Cloud-dev onboarding design

Goal:

* design how Cloud-dev or staging onboarding should work before any implementation.

What changes:

* design document only.

Forbidden:

* Cloud writes;
* production writes;
* Supabase config changes;
* migrations;
* service credential changes.

Validation required:

* architecture review;
* security review;
* approval gates review.

### Stage 5D — Cloud-dev read-only verification plan

Goal:

* define read-only checks for Cloud-dev tenant visibility, RLS behavior, and API facade access.

What changes:

* read-only verification scripts or docs, if approved.

Forbidden:

* Cloud writes;
* production writes;
* destructive SQL;
* service_role in app/frontend.

Validation required:

* no write operations;
* no secrets printed;
* internal schemas remain unexposed.

### Stage 5E — Cloud-dev write path proposal, not implementation

Goal:

* propose a safe Cloud-dev write path for onboarding rehearsal.

What changes:

* proposal only;
* implementation deferred until approval.

Forbidden:

* actual Cloud write implementation;
* production changes;
* migrations unless separately approved;
* bypassing RLS without security review.

Validation required:

* backup design;
* approval gates;
* rollback plan;
* audit plan;
* tenant isolation test plan.

### Stage 5F — production onboarding approval checklist

Goal:

* define the human approval checklist for production onboarding.

What changes:

* checklist document only.

Forbidden:

* production implementation;
* customer onboarding execution;
* billing changes;
* LINE broadcast;
* Supabase config changes.

Validation required:

* privacy/legal review item;
* backup confirmation item;
* customer confirmation item;
* operator sign-off item.

### Stage 5G — first real customer onboarding runbook

Goal:

* create the runbook for the first real customer onboarding.

What changes:

* runbook only unless a separate implementation stage is approved.

Forbidden:

* executing customer onboarding;
* autonomous production writes;
* unapproved Cloud database changes.

Validation required:

* dry-run rehearsal;
* approval checklist;
* backup/rollback confirmation;
* dashboard verification checklist;
* post-onboarding cleanup checklist.

## 11. Open questions

Questions to resolve before Cloud or customer onboarding:

* Which environment will be used as staging?
* How will staging be separated from production?
* How should real Supabase Auth users be created and verified safely?
* How should owner email PII be handled?
* What Japanese privacy/legal documents are needed before production customer onboarding?
* What billing state is required before onboarding?
* What manual customer confirmation is required?
* Who approves production onboarding?
* How will tenant isolation be tested after onboarding?
* What exact backup/restore process will be used for Cloud-dev and production?
* How will incidents be recorded and reviewed?
* Which onboarding data should be visible to operators?
* Which onboarding data must never appear in CLI output?

## 12. Recommendation

Do not proceed directly to production or real customer onboarding.

The next stage should be local documentation/runbook hardening or Cloud-dev onboarding design.

The first real customer onboarding should be:

* manual;
* checklist-based;
* backed up before write;
* reviewed for privacy/legal concerns;
* human-approved;
* audited;
* verified through dashboard and database checks;
* followed by cleanup and incident-review steps if needed.

The platform should stay practical for MVP, but the onboarding path must be safe enough to scale toward 300+ tenants without weakening tenant isolation, RLS, auditability, or operational control.
