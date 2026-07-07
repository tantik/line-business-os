# Phase 1J-3 Sales Validation Package

Status: **Docs-only. No code, schema, or config changed.**
Branch: `docs/phase-1j-3-sales-validation-package`.

Read with: [`phase-1j-2-cafe-workforce-demo-closeout-report.md`](./phase-1j-2-cafe-workforce-demo-closeout-report.md)
(§9, Phase 1J-3 recommendation this package fulfills),
[`product/mvp-roadmap.md`](./product/mvp-roadmap.md).

## What this package is

A set of practical Japanese-language sales materials for showing the existing
Cafe Workforce demo (`/demo/cafe`, `/demo/cafe/recipes`, `/demo/cafe/manager`,
`/demo/cafe/guide`) to a first real cafe client and running an 8-week free
development-partner pilot. It documents the business decisions already made
for that first pilot (pricing, scope, non-payroll/non-legal-compliance
boundaries) and gives repeatable scripts/checklists so the first client
conversation does not depend on improvising in the moment.

This package is sales/process documentation only. It does not change the
demo, add a backend, add LINE integration, or commit to any public pricing.

## Who it is for

- Whoever runs the first client conversation (currently: the person sending
  the message to ギュウさん and running the demo).
- Anyone preparing a future cafe client conversation after this first one,
  using the same script/checklist/pricing baseline.
- Internal reference for pricing direction before any public pricing page
  exists.

## Documents in this package

| Document | Purpose |
| --- | --- |
| [`sales/cafe-workforce-first-client-message-ja.md`](./sales/cafe-workforce-first-client-message-ja.md) | Ready-to-send Japanese message introducing the demo guide and the 8-week pilot offer to ギュウさん. |
| [`sales/cafe-workforce-demo-script-ja.md`](./sales/cafe-workforce-demo-script-ja.md) | 5–7 minute walkthrough script across the four demo routes, ending in two closing questions. |
| [`sales/cafe-workforce-pilot-package-ja.md`](./sales/cafe-workforce-pilot-package-ja.md) | The 8-week free pilot definition: scope, included/excluded features, required client info, success criteria. |
| [`sales/cafe-workforce-client-interview-checklist-ja.md`](./sales/cafe-workforce-client-interview-checklist-ja.md) | Interview questions to surface real pain, urgency, workflow, and decision criteria — not generic discovery questions. |
| [`sales/cafe-workforce-pricing-notes.md`](./sales/cafe-workforce-pricing-notes.md) | Internal-only pricing notes: committed first-partner price, future tier hypothesis, and what must be checked before any public pricing page. |

## How to use it

1. Send the message in
   [`cafe-workforce-first-client-message-ja.md`](./sales/cafe-workforce-first-client-message-ja.md)
   (after filling in the real demo URLs) to start the conversation.
2. When a live or screen-share walkthrough happens, follow
   [`cafe-workforce-demo-script-ja.md`](./sales/cafe-workforce-demo-script-ja.md).
3. Use
   [`cafe-workforce-client-interview-checklist-ja.md`](./sales/cafe-workforce-client-interview-checklist-ja.md)
   during or after the conversation to capture real operational pain and the
   client's answers to the two closing questions.
4. If the client wants to proceed, present
   [`cafe-workforce-pilot-package-ja.md`](./sales/cafe-workforce-pilot-package-ja.md)
   as the concrete pilot offer (8 weeks free, 月額4,980円 continuation, scope
   boundaries).
5. Keep all pricing conversations — including any future client beyond the
   first — consistent with
   [`cafe-workforce-pricing-notes.md`](./sales/cafe-workforce-pricing-notes.md),
   and do not quote future-tier numbers as committed prices.

## Boundaries this package intentionally keeps

- Not payroll. Not legal/statutory attendance compliance. Both exclusions are
  stated explicitly in the client-facing message and the pilot package so no
  client interprets the pilot as replacing either.
- Not the public standard price. The 8-week-free / 月額4,980円 offer is a
  development-partner pilot price for the first client only, not a rate to
  reuse automatically for a second client without a deliberate decision.
- No code, schema, environment, or dependency changes. This phase is
  entirely `docs/`.

## Next step: Phase 1K — Workforce Production MVP Architecture

Once the first client conversation happens and the pilot either starts or
surfaces blocking feedback, the next phase is designing the real, persisted
Workforce module architecture (tenant/location model, RLS policies,
`apps/api` service boundary, audit event shapes, migration plan) — see
[`phase-1j-2-cafe-workforce-demo-closeout-report.md`](./phase-1j-2-cafe-workforce-demo-closeout-report.md#9-recommended-next-phases)
§9 for the detailed scope of Phase 1K. This package does not start that work;
it only prepares the conversation that should inform it.
