# LINE Business OS — Current Task Handoff

## Current stage

Cafe Package v2.0 remains frozen. Cafe Package v2.1 is in authenticated
Preview evidence closure on `dev` after PR #189. Cafe Freeze is not yet
declared and this is not a Commercial Release.

## Verified baseline

- Base branch: `dev`.
- Cafe Package v2.0 DB-backed Preview scope: Product Freeze.
- OAES project integration: merged through PR #151.
- Closeout fixes: merged through PR #156.
- Preview migration history: local and remote `0000`-`0048` aligned.
- v2.0 authenticated acceptance remains recorded in
  `docs/product/cafe-package-v2-acceptance-report.md`.
- Current v2.1 evidence is recorded in
  `docs/product/cafe-package-v2-1-acceptance-report.md`; do not reuse the v2.0
  PASS as proof of the changed v2.1 surfaces.
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

## Verified v2.1 implementation and Preview evidence

- header, attention centre, schedule/request UX, staff profiles, and recipe
  management slices are committed or under active PR review;
- local clean database reset applies migrations `0000`-`0052`;
- pgTAP passes 628/628, including recipe RLS, transactional CRUD, private
  media storage, and cross-tenant denial;
- web tests, typecheck, lint, production build, and the compiled Preview Server
  Action allowlist pass locally;
- PR #189 fixed Manager recipe-title resolution against current
  `content.translations`; PR CI, Vercel, post-merge `dev` CI, and the local
  web gate passed (837/837 tests).
- Canonical authenticated Manager Preview manually passed M1, M4, M5, M19,
  and M20/R6; EN showed `Matcha Latte`, JA showed `抹茶ラテ`, with zero console
  errors on the observed paths.
- A Manager account without a Staff profile failed closed on direct Staff URL
  entry, satisfying S2. This is not evidence for S1 or Staff-to-Manager denial.
- A separate authenticated Staff identity is not currently available in the
  controlled browser session. Staff acceptance, role-isolated Staff mutations,
  and Staff performance remain BLOCKED rather than implicitly passed.
- P1-4 audit logging remains an explicit Founder decision. No migration, RLS,
  auth, role, permission, or Cloud-data write is authorized by this handoff.

## Exact next gate

1. Establish a separate authenticated Staff Preview session without exposing
   credentials in chat or Git.
2. Execute S1, S3-S23, M2, R2/R4/R13, and Staff Inventory/Recipes observations
   with safe disposable fixtures where writes are required.
3. Record the Founder decision for P1-4. Recommended for v2.1: a documented,
   temporary exception for the existing DB-trigger actor/timestamp stamping,
   with full business audit events mandatory before Commercial Release.
4. Reconcile the remaining BLOCKED rows and request Founder Freeze acceptance;
   do not start Cafe v2.2 automatically.
