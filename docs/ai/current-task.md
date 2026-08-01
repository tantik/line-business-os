# LINE Business OS — Current Task Handoff

## Current stage

Cafe Package v2.0 remains frozen. Cafe Package v2.1 operator UX and reliability
is in Product/Architecture Review, moving to implementation under OAES.

## Verified baseline

- Base branch: `dev`.
- Cafe Package v2.0 DB-backed Preview scope: Product Freeze.
- OAES project integration: merged through PR #151.
- Closeout fixes: merged through PR #156.
- Preview migration history: local and remote `0000`-`0048` aligned.
- Authenticated Manager, Staff, and Recipes acceptance: passed.
- Canonical evidence: `docs/product/cafe-package-v2-acceptance-report.md`.
- Production remains separately gated and was not enabled.

## Product boundary

Cafe v2.0 now accepts only bug fixes, security fixes, accessibility and
localization corrections, and bounded release/onboarding polish. New features
require a new Product Review.

## Active v2.1 scope

See `docs/product/cafe-package-v2-1-product-review.md` and
`docs/architecture/cafe-package-v2-1-architecture-review.md`. The release owns
tenant branding/header, attention centre, schedule/request reliability,
Staff/Recipe management, scalable Inventory, and a separately gated platform
subscription-lifecycle foundation.

Apply the OAES regression-impact matrix whenever shared components, roles,
routes, localization, or reusable data contracts are affected.
