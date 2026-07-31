# ORUWA Cafe Package v2.0 — acceptance report

Date: 2026-07-26  
Status: **Release Candidate (Preview accepted, Production not enabled)**

## Scope

This report records the completed technical acceptance of the authenticated,
DB-backed Mame To Cha Cafe Preview at:

`https://preview.oruwa.jp/mame-to-cha`

The Preview environment uses the Cloud acceptance database. It is not the
Production environment and must not be promoted by copying acceptance data.

## Automated verification

- Web lint: passed.
- Web typecheck: passed.
- Web tests: 606/606 passed.
- Web production build: passed.
- Preview Server Action manifest allowlist: passed.
- GitHub Actions for PR #129: passed.
- Vercel deployment for PR #129: Ready.

## Read acceptance

- Manager sign-in and Manager page: passed.
- Manager staff list: passed with server-side PII decryption.
- Manager schedule: passed.
- Manager staff-management dialog: passed.
- Manager recipe-management dialog: passed.
- Staff sign-in and Staff page: passed.
- Staff published schedule: passed and self-scoped.
- Staff preferences, work reports, and correction history: passed.
- Staff action dialogs: passed.
- Staff attempting to open Manager page: denied.
- Recipe list and recipe detail: passed.
- No raw employee UUID was visible in the checked client-facing screens.

## Reversible write acceptance

The following Mame To Cha Preview actions were exercised:

- submit shift preference;
- submit work report;
- submit correction request;
- create a draft schedule assignment;
- publish the schedule;
- verify the published assignment from the Staff account.

Before the smoke, the affected Mame To Cha rows were backed up outside the
repository. After verification, the exact baseline was restored in one
transaction and verified:

- `workforce.shift_requests`: 2 rows;
- `workforce.attendance`: 1 row;
- `workforce.shifts`: 1 row.

No other tenant and no Production environment was modified.

## PII remediation

Vercel Preview now uses the verified current `PII_ENCRYPTION_KEY` and
`PII_HASH_PEPPER`.

One legacy Mame To Cha employee record had been encrypted with the earlier
local placeholder material. That single record was backed up, re-encrypted
with the current Preview key, its blind index was rebuilt with the current
pepper, and the result was verified transactionally. Other tenants were not
modified.

Secret values are not recorded in this document or in Git.

## Release decision

Cafe Package v2.0 is accepted as a **Preview Release Candidate**. The Manager,
Staff, Recipes, authorization boundaries, and core reversible write flows are
working in the Cloud acceptance environment.

This is not approval for Production. Production remains separately gated.

## Deferred before Production

- provision and verify a separate Production Supabase project;
- configure `app.oruwa.jp`;
- generate separate Production PII secrets;
- complete privacy/legal review for real customer PII;
- define backup, recovery, monitoring, and incident ownership;
- complete a Production readiness/security review;
- replace synthetic acceptance identities and credentials;
- obtain a real client's data and operational sign-off when a client exists;
- verify that the public health-monitoring path is reachable without Vercel
  deployment-protection interception in the intended Production setup.

## Product follow-up

With the v2.0 UI and acceptance scope frozen, the next stage is a structured
product review:

1. sales/demo readiness;
2. Japanese-market value gaps;
3. tenant provisioning and one-day client onboarding;
4. operational support and monitoring;
5. prioritized Cafe v2.1 roadmap.

## 2026-07-31 OAES controlled closeout

Status: **Product Freeze approved for the DB-backed Preview scope**.

The repository was recovered before implementation. Inventory, Preview i18n,
Recipe Translation, and the Cafe Product Acceptance work were confirmed in
`dev`. OAES was integrated through PR #151 and used as the working review and
acceptance process for the closeout.

Changes accepted during the closeout:

- PR #152: complete Cafe help localization and final Manager UX corrections;
- PR #153: advisory monthly worked hours, hourly wage, estimated earnings, and
  Manager estimated labour cost;
- PR #154: shared modal close-label localization;
- PR #155: inactive Shift Types excluded from new scheduling;
- PR #156: inactive Shift Type visibility aligned across Manager and Staff
  legends using the OAES role/route regression matrix.

Verification evidence:

- web tests: **779/779 passed**;
- typecheck, lint, production build, and Vercel checks: passed;
- local Supabase reset through migration `0048`: passed;
- local pgTAP: **591/591 passed**;
- Preview Cloud migration history: local and remote `0000`-`0048` aligned;
- authenticated Manager acceptance: passed;
- authenticated Staff acceptance: passed with self-scoped wage and earnings;
- authenticated Recipes acceptance: passed in English without exposing the
  translation provider/mechanism;
- JA/EN shared help and accessible close labels: passed;
- temporary Shift Type fixture: deactivated and absent from active scheduling
  and visible Staff legend;
- checked Manager, Staff, and Recipes browser consoles: no new warnings or
  errors.

The Preview wage for `Acceptance Staff One` remains synthetic acceptance data
(`JPY 1,250/hour`) so the advisory earnings scenario remains demonstrable. It
must not be promoted to Production and can be cleared through Manager Staff
Management when the acceptance tenant is retired.

This freeze does not approve Production. Further Cafe work requires a new
product decision unless it is a bug fix, security fix, accessibility or
localization correction, or bounded release/onboarding polish.

