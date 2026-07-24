# Phase 1N-4C Slice D - Mame To Cha Cloud Acceptance Preflight

Status: preparation only. No Cloud write is authorized by this document.

## 1. Outcome

Prepare a reviewed, evidence-backed go/no-go package for onboarding the
`mame-to-cha` acceptance tenant into the existing Cloud dev/acceptance
environment.

Slice D execution starts only after this preflight is complete and the owner
approves the first specific write. Every later write requires its own scoped
approval.

## 2. Confirmed starting point

- Slice C2 merged into `dev` through PR #110 (`f24385a`).
- Local Auth users, tenant fixture, memberships, roles, employee binding,
  acceptance data, and audit behavior were exercised locally.
- Local read-only verification passed.
- Manager and staff authenticated browser paths passed.
- Staff access to the manager page fails closed.
- Full local typecheck/test/build/lint gate passed.
- No Supabase Cloud write, Cloud Auth change, DNS change, or production
  action occurred in Slice C.

The version-controlled manifest source is
`packages/db/scripts/mame-to-cha-fixture.ts`. Credentials and PII values are
never part of this manifest.

## 3. Preflight sequence (read-only)

Run each check separately and record only redacted evidence:

1. Confirm local `dev` equals `origin/dev` at the PR #110 merge or a reviewed
   later commit.
2. Identify the exact Supabase Cloud dev/acceptance project by safe metadata;
   do not infer it from a secret or from a locally linked project.
3. Confirm the project is not production.
4. Inspect migration parity read-only. Stop if Cloud is behind, ahead, or
   contains an unexpected migration; migration work is a separate phase and
   approval.
5. Confirm required schemas, facade views, functions, roles, and permissions
   exist using metadata/read-only checks.
6. Check whether `mame-to-cha` already exists. Any partial or duplicate state
   is a stop condition, not permission to repair it.
7. Check whether the intended manager/staff identities already exist using a
   redacted existence result only. Never print addresses or credentials.
8. Confirm the intended Vercel acceptance deployment and its environment
   class. Do not read or display secret values.
9. Confirm `preview.oruwa.jp` ownership/routing status without changing DNS or
   Vercel domains.
10. Produce a go/no-go report containing findings, unresolved decisions,
    exact proposed write scope, rollback/compensation, and the next approval
    request.

## 4. Decisions required before the first write

- Exact Cloud dev/acceptance project and named owner.
- Confirmation that the target is non-production.
- Acceptance domain strategy for `preview.oruwa.jp`.
- Synthetic versus client-provided acceptance content.
- Exact Auth creation mechanism.
- Credential delivery/rotation owner; no credentials in Git or chat output.
- Whether the client additions are required before acceptance onboarding or
  can be delivered as a following acceptance iteration.

## 5. Client additions register

Record each client request before implementation. Do not combine unrelated
requests in one row.

| ID | Business problem / requested outcome | Affected users and location | Classification | Reusable platform result | Security/RLS/PII impact | Acceptance test | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MTC-ADD-01 | Owner input required | Owner input required | Pending | Pending | Pending | Pending | Pending |
| MTC-ADD-02 | Owner input required | Owner input required | Pending | Pending | Pending | Pending | Pending |

Allowed classifications (ADR 0010):

- tenant/location configuration;
- branding or managed content;
- reusable capability inside Workforce;
- reusable top-level product module;
- exceptional tenant-specific behavior (last resort, requires explicit
  architectural justification).

For each significant request, also record data model, permissions, module
entitlement, UI, migration, cost, risks, rollout, and a now/later/reject
decision before implementation.

## 6. Approval-gated execution map

The following is a future sequence, not current authorization:

| Gate | Proposed operation | Required approval |
| --- | --- | --- |
| D0 | Accept the preflight report and exact target | Owner review |
| D1 | Create or verify tenant and location rows | Explicit Cloud DB write approval |
| D2 | Enable the Workforce tenant module | Explicit module/write approval |
| D3 | Create manager and staff Cloud Auth identities | Explicit Auth/credential approval |
| D4 | Create user mirrors, memberships, and role assignments | Explicit identity/RBAC write approval |
| D5 | Create the staff employee binding and encrypted PII | Separate explicit PII/binding approval |
| D6 | Apply approved deterministic acceptance content and audit rows | Explicit fixture write approval |
| D7 | Run read-only verification | No write approval; target must still be confirmed |

Approval for one gate never carries forward to another gate. Apply,
auth-provision, repair, cleanup, migration, and production commands remain
forbidden unless the corresponding gate is explicitly approved.

## 7. Stop conditions

Stop and report before any write when:

- the Cloud target is ambiguous or production-like;
- migration parity is not exact;
- required relations/functions/roles are missing;
- existing tenant/Auth state is partial, duplicate, or conflicts with the
  manifest;
- a command would expose a secret, credential, real email, UUID, or PII;
- rollback/compensation is undefined;
- the requested change expands beyond the approved gate;
- client additions would require an unreviewed migration, permission, module,
  or tenant-specific fork.

## 8. Relationship to client additions

Do not restart the completed migration. Keep PR #110 as the stable baseline.

The default sequence is:

1. classify the additions;
2. keep onboarding and new product scope separately reviewable;
3. complete the read-only Slice D preflight;
4. decide which additions are acceptance blockers;
5. implement approved reusable additions in separate branches;
6. onboard and test the resulting reviewed baseline.

Only a confirmed acceptance-blocking requirement should delay Cloud
onboarding. Cosmetic or follow-up improvements can proceed as a later
acceptance iteration.

## 9. Exit criteria

Slice D preparation is complete when:

- the roadmap and current-task handoff reflect completion of Slice C2;
- the typed manifest is confirmed as the source of truth;
- client additions are entered and classified;
- the exact non-production target is identified;
- every read-only check has redacted evidence;
- all unresolved decisions and stop conditions are listed;
- the first proposed Cloud write has an exact scope, compensation plan, and
  a separate owner approval request.
