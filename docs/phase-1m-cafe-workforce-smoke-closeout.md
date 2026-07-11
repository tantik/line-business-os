# Phase 1M — Cafe Workforce v0.1 Runtime Smoke Closeout

## 1. Scope

Phase 1M built the first production-path (non-demo) Cafe Workforce v0.1
slice: DB schedule/write foundation, an auto-distribution algorithm, write
helpers/actions, manager UI (including manual staff/shift editing and
correction review), staff UI, and a smoke-driven UI clarity pass. This
document closes out Phase 1M by recording that the core runtime flow was
verified end-to-end on Vercel dev Preview against Supabase Cloud dev, and
what is explicitly still outside that scope.

This is a runtime smoke verification record, not a production readiness
sign-off and not a client demo readiness sign-off.

## 2. Runtime environment

- **App**: Vercel dev Preview deployment of `apps/web`.
- **Database**: Supabase Cloud dev project (`line-business-os-dev`).
- **Auth**: real Supabase Cloud dev auth user, signed in through the normal
  sign-in flow (no local-only shortcuts).
- No production environment, no production Supabase project, and no
  `service_role` use were part of this smoke.

## 3. PRs included

| PR | Summary |
| --- | --- |
| #90 | DB schedule/write foundation |
| #91 | Cafe auto-distribution algorithm |
| #92 | Workforce write helpers/actions |
| #93 | Manager UI |
| #94 | Manager staff/manual editing |
| #95 | Staff UI |
| #96 | Manager correction review |
| #97 | Smoke UI clarity |

## 4. Cloud dev setup assumptions

The smoke run assumed the following was already true of the Supabase Cloud
dev tenant used for testing (not re-verified as a setup procedure here):

- The `workforce` module is enabled for the smoke tenant.
- A Cafe location exists under that tenant.
- Cafe shift types exist: `ALL`, `AM`, `PM`, `A-P`, `SHORT_AM`.
- A staff employee row exists and is linked to the current smoke user
  (the account used to sign in during the smoke run).
- PII-related environment variables (encryption/hash keys used by
  `workforce.employees` name encryption and LINE user-id hashing) are
  present in the Vercel Preview environment.

These are environment/data preconditions, not something this phase changed
or re-provisioned.

## 5. Verified smoke flow

The following flow was run end-to-end on Vercel dev Preview + Supabase
Cloud dev and passed:

1. Staff profile loads.
2. Staff submits a shift preference.
3. Manager sees the submitted preference.
4. Manager runs auto-distribution.
5. A draft shift appears in the manager schedule.
6. Manager publishes the schedule.
7. Staff sees the published schedule.
8. Staff submits a work report.
9. Staff submits a correction request.
10. Manager sees the correction request.
11. Manager approves the correction request.
12. Staff and manager UI clearly show the work report message and the
    correction request's status/context (verified after the PR #97 UI
    clarity pass).

## 6. Explicitly not covered yet

- LIFF (LINE Front-end Framework) entry.
- LINE rich menu.
- Production deployment.
- Billing.
- Inventory.
- CRM.
- Full visual polish.
- Automated Playwright end-to-end tests.

## 7. Known issues / cleanup before client demo

- One extra PM draft shift may remain in the Cloud dev smoke tenant from
  manual testing during this phase. This is test data left over from
  smoke verification, not a product defect, and does not block Phase 1M
  closeout.
- Japanese demo data (tenant, location, staff, shift types, sample
  schedule) still needs to be prepared before any client-facing demo.
- UI polish is behind the existing `/demo/cafe` sales demo and should be
  improved before using the real Workforce UI in a client-facing setting.

## 8. Recommended next steps

- UI polish and demo-readiness work on the real (non-demo) Workforce UI.
- A minimal LINE entry point / LIFF integration, as a later, separate
  phase.
- Playwright-based smoke automation to replace manual runtime smoke, as a
  later, separate phase.

## Explicitly not claimed

- Production is not ready.
- LINE integration is not complete.
- Client demo readiness is not complete — see Section 7.
