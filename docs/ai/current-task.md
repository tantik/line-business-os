# LINE Business OS - Current Task Handoff

## 1. Current stage

Phase 1N-4C Slice D preparation - Mame To Cha Cloud acceptance onboarding
preflight.

The current task is documentation and read-only preparation only. It does
not authorize a Cloud write.

## 2. Current baseline

- Base branch: `dev`
- Slice C2 merged by PR #110.
- Merge commit: `f24385a`
- Local authenticated browser smoke completed for manager and staff.
- Negative `staff -> manager` access check passed.
- Full local quality gate passed: 30/30 tasks.
- Supabase Cloud was not changed during Slice C2.

## 3. Current goal

Prepare Slice D so Cloud acceptance onboarding can later be executed as a
sequence of narrow, independently approved operations.

Current deliverables:

- update the Phase 1N-4C roadmap after Slice C2;
- document the Slice D read-only preflight;
- reconcile the architecture plan with the implemented typed fixture
  manifest;
- create an intake/classification register for the client's new requests.

## 4. Source of truth

The tracked, non-secret acceptance manifest is the typed fixture:

```text
packages/db/scripts/mame-to-cha-fixture.ts
```

Slice C1 deliberately selected this implementation instead of a YAML file.
It contains no real email, password, token, UUID, or customer PII.

The Slice D preparation plan is:

```text
docs/phase-1n-4c-slice-d-cloud-acceptance-preflight-plan.md
```

## 5. Safety boundaries

Allowed in the current preparation task:

- repository and documentation inspection;
- local Git inspection;
- read-only Cloud/Vercel/DNS diagnostics after the target is identified;
- recording decisions, risks, stop conditions, and approval requests.

Not authorized:

- Supabase Cloud database writes;
- Auth user creation or password changes;
- `supabase link`, `supabase db push`, migrations, reset, or cleanup;
- Vercel environment or domain changes;
- DNS changes;
- production work;
- real customer PII in Git;
- secrets in commands, logs, documents, commits, or chat output.

## 6. Client additions

Client additions must not be mixed silently into onboarding. Each request is
first recorded in the Slice D request register and classified under ADR 0010
as configuration, branding/content, reusable Workforce capability, reusable
module, or exceptional tenant-specific behavior.

No implementation starts until the business problem, reusable architecture,
security impact, acceptance test, and now/later/reject recommendation are
recorded.

## 7. Next expected action

Collect the client's additions in plain business language, complete the
request register, and run the Slice D read-only environment preflight.

After the preflight report is reviewed, request a separate explicit approval
for the first Cloud write. Approval for one operation never authorizes the
next operation.
