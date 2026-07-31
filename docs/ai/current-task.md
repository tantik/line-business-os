# LINE Business OS — Current Task Handoff

## Current stage

Controlled post-merge closeout of Cafe Package v2.0 under the OAES project
profile.

## Verified baseline

- Base branch: `dev`.
- Local `dev` and `origin/dev`: `7debba1` (PR #150 merge).
- Inventory, Preview JA/EN, Recipe Translation, final UX polish, and Product
  Acceptance fixes are merged.
- Inventory migrations `0035`–`0047`, including `0036` and `0038`, are present.
- The current canonical migration files `0036` and `0038` match their original
  PR #141 versions.
- Production is not enabled by this task.

## Current goal

1. Integrate OAES as the repository's working engineering process.
2. Run relevant local verification on the merged Cafe v2.0 baseline.
3. Perform authenticated visual acceptance for the three discoverable Preview
   destinations: `/mame-to-cha`, `/mame-to-cha/recipes`, and
   `/mame-to-cha/manager`.
4. Produce the final Cafe Package v2.0 Acceptance Report and freeze decision.

## Current working branch

`chore/oaes-linebos-integration`

## Safety boundaries

Allowed in the current scope:

- repository inspection and OAES process documentation;
- local reversible documentation/configuration changes;
- relevant read-only tests, typecheck, lint, and build;
- static security and tenant/RLS review.

Separate explicit approval is required before:

- local database reset or migration execution;
- migration or RLS changes;
- Cloud, Vercel, DNS, or production writes;
- secrets, auth, PII, roles/permissions, or billing changes;
- commit, push, PR creation, or merge.

Recorded approval for this task (2026-07-31): commit, push, and PR creation are
approved for the OAES integration and subsequent Cafe acceptance fix. Local
Supabase reset and pgTAP are approved only against the loopback local stack.
Cloud, production, migration/RLS changes, and merge remain prohibited.

## Next gate

The OAES integration passed local documentation checks and the merged baseline
passed the full 30-task local code gate. Preview Staff and Recipes loaded with
no new browser console errors, and Staff -> Manager remained denied.

Product Acceptance found one blocker: the Staff Recipes UI exposes the label
`Machine translation`. This leaks an internal mechanism contrary to
`docs/development/product-acceptance-workflow.md`. Manager positive-path visual
acceptance remains unverified because the available authenticated browser
session is Staff-scoped.

Next gates:

1. Commit/push/open the approved OAES integration PR.
2. Create a separate Cafe acceptance-fix branch removing the operator-facing machine
   translation mechanism label, followed by affected tests and visual QA.
3. Human-provided Manager-authenticated browser session for positive Manager
   acceptance.
4. Explicit approval for local-only Supabase reset/pgTAP if database closeout
   evidence needs refreshing.
