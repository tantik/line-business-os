# LINE Business OS — Current Task Handoff

## Current stage

Cafe Package v2.0 remains frozen. Cafe Package v2.1 operator UX and reliability
is in local QA under OAES on `feature/cafe-v2-1-operator-ux` / PR #158.

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

## Verified v2.1 implementation evidence

- header, attention centre, schedule/request UX, staff profiles, and recipe
  management slices are committed or under active PR review;
- local clean database reset applies migrations `0000`-`0052`;
- pgTAP passes 628/628, including recipe RLS, transactional CRUD, private
  media storage, and cross-tenant denial;
- web tests, typecheck, lint, production build, and the compiled Preview Server
  Action allowlist pass locally;
- Preview Cloud migration/deploy and authenticated Manager/Staff/Recipes visual
  acceptance remain the next release gate, so v2.1 is not yet accepted.
