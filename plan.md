# ORUWA Cafe v2.1 — live execution plan

Updated: 2026-08-01 (Asia/Tokyo)

This is the short restart point for ChatGPT/Codex/Claude. Read it after
`AGENTS.md`, `docs/ai/oaes-project-profile.md`, and `docs/ai/current-task.md`.
Do not reconstruct the project from chat history before checking Git and this
file.

## Goal

Deliver a verified Cafe product on Preview:

- `https://preview.oruwa.jp/mame-to-cha`
- `https://preview.oruwa.jp/mame-to-cha/recipes`
- `https://preview.oruwa.jp/mame-to-cha/manager`

## Current Git state

- branch: `fix/cafe-v2-1-preview-acceptance`
- merged PR: `#158` — `https://github.com/tantik/line-business-os/pull/158`
- `dev` merge commit: `ad3ad27cd04dfb9f0723288229e96d81ffa4dfd1`
- base: `dev`
- stage: OAES QA / Preview release gate

## Completed and pushed

1. OAES/project integration and v2.1 Product + Architecture Review.
2. Shared `MATCHA-tea` header/navigation, compact attention centre, week
   prefetch, pending correction markers, inventory search/filter/sticky UX.
3. Secure full staff profile management with encrypted PII (`0049`).
4. Future shift change/cancellation requests and manager decisions (`0050`).
5. Complete recipe create/edit dialog, transactional ingredients/steps/notes,
   draft/published lifecycle, private recipe images and signed display
   (`0051`, `0052`).
6. Preview Cloud Supabase migrations `0049`-`0052` applied and verified;
   Local and Remote migration history now align at `0000`-`0052`.

## Verified evidence

- clean local Supabase reset through `0052`: PASS;
- pgTAP: 628/628 PASS;
- web regression tests: 780/780 PASS;
- new recipe parser tests: 3/3 PASS;
- typecheck: PASS;
- lint: PASS;
- production build: PASS;
- compiled Preview Server Action allowlist: PASS;
- no frontend `service_role`; recipe media bucket is private and
  tenant/location/RLS scoped.

## Current step

Merged `dev` deployment `ad3ad27` is live on `preview.oruwa.jp`. Authenticated
browser acceptance is in progress. Manager loads the new v2.1 UI. The current
Chrome session is the Manager account, so the Staff route correctly fails
closed with `No staff profile found`; use a separately authenticated Staff
session before judging Staff behavior.

## Next steps

1. Run authenticated browser acceptance separately for Manager, Staff, and
   Recipes:
   - header/menu/logout and route boundaries;
   - week navigation and past/future shift behavior;
   - correction pending marker;
   - change/cancel request with required reason and manager decision;
   - Manage Staff full fields;
   - recipe add/edit, photo upload/replace/delete, draft/published display;
   - Inventory at 30 and 100 items;
   - Shift Types and Settings mutation latency;
   - JA/EN help and console/network errors.
2. Fix only observed acceptance defects, repeating impacted tests.
3. Write `docs/product/cafe-package-v2-1-acceptance-report.md` and freeze v2.1.
4. Start the separately reviewed subscription lifecycle/payment foundation;
   production purge execution remains disabled.

## Important boundaries

- Preview Cloud is approved; production customer data and destructive purge
  are not part of this acceptance step.
- Never stage or overwrite these user-owned local files unless separately
  requested:
  - `packages/db/scripts/mame-to-cha-fixture.ts`
  - `packages/db/scripts/mame-to-cha-write.ts`
  - `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`
  - `packages/db/src/types.generated.ts`
- Do not claim Cafe v2.1 complete before authenticated Preview acceptance.

## Update rule

After each major gate, update: timestamp, latest commit, completed work,
verification evidence, current step, and next steps. Keep facts concise; do not
paste chat transcripts here.
