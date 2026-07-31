# Product Acceptance Workflow

Standard process for shipping any change to a customer-facing module (Cafe
Package and every module that follows it). This document is the permanent
reference — link to it from PR descriptions instead of re-explaining the
process each time.

## The pipeline

1. **Development** — implement the change against the existing architecture
   (Core, RLS, API facade). No shortcuts around tenant isolation, permission
   checks, or the neutral `PreviewWriteResult` contract.
2. **Self Review** — before opening a PR, the author re-reads their own diff
   end to end and manually exercises the changed screens (Demo and, if
   DB-backed, Preview) in a browser. Type-checking a component is not the
   same as looking at it.
3. **AI Review** — `/code-review` (or the ultra multi-agent review for larger
   changes) runs against the diff. Findings are triaged, not rubber-stamped.
4. **Tests** — `npm test` for the affected packages/apps.
5. **Build** — `npm run build` (catches type errors and issues that only
   surface in a production build, e.g. the Server Action reference manifest
   `verify:preview-actions` depends on).
6. **PR** — opened against `main`/`dev` with a summary that states *why*, not
   just *what*, and lists what was manually checked.
7. **Preview** — Vercel Preview deploys the branch. This is a real,
   DB-backed environment (Supabase Cloud), not a mock — treat findings here
   as production-equivalent.
8. **Product Acceptance** — a human (or an agent acting on the human's
   behalf) opens the Preview environment and compares it screen-by-screen
   against the Demo (`/demo/cafe/...`), the product's UX reference. Any
   place Preview reads as *less* finished than Demo is a blocker, not a
   nice-to-have.
9. **Acceptance Fixes** — issues found in step 8 are fixed in the same PR
   (never a new one, unless a maintainer explicitly asks for a fresh
   branch). Fixes that would require a database schema change, a new
   migration, or an RLS change are flagged for a maintainer decision instead
   of being silently implemented or silently skipped — see "Stop-and-ask
   triggers" below.
10. **Final Acceptance** — after fixes land and Preview redeploys, the same
    screens are re-checked. Only re-verify what changed plus its immediate
    neighbors — this is not a full re-run of step 8.
11. **Merge to dev** — only after Final Acceptance passes and every check in
    "Required checks" is green.

## The core acceptance principle

**Never degrade existing UX in service of new architecture.** When a choice
must be made between "the architecturally cleaner way" and "the interface
the manager already relies on," the interface wins. Architecture is supposed
to be invisible to the person using the product — if it becomes visible
(extra buttons, technical status badges, jargon, a workflow that used to be
one click and now takes three), that is a regression even if the code behind
it is better.

This principle exists because it was violated once already: a translation
system was added to the Cafe Recipe Manager and its internal workflow status
(provider name, machine/reviewed state, translate/regenerate controls)
leaked directly into the manager-facing screen. The manager never asked to
see any of that, and had no reason to know a translation pipeline existed at
all. The fix was to keep the translation pipeline fully functional but move
every trace of it out of the manager's view — the correct place for it to
have been from the start.

**Concretely:** anything a system does automatically (auto-translation,
auto-numbering, background recalculation, derived state) should be
observable only in its *effect* (the English text is there; the number is
right), never in its *mechanism* (a provider name, a "stale" badge, a
"regenerate" button) on a screen a non-technical operator uses day to day.
Mechanism belongs in admin tooling, logs, or a script — not the Manager UI.

## Stop-and-ask triggers

An agent (or engineer) doing Acceptance Fixes must stop and ask a human
before:

- Changing the database schema or adding a migration.
- Changing an RLS policy.
- Changing Auth, Tenant, or Billing architecture.
- Running any Supabase Cloud write (`db push`, `db pull`, `link`, migration
  repair).
- Deploying to production.
- Merging to `dev` or opening a second PR instead of updating the existing
  one.

If a Product Acceptance finding *requires* one of the above to fully fix
(e.g. "Recipe Manager can't edit ingredients because there's no write grant
for that column"), the correct move is: restore the best possible UX with
today's data model, and document the gap and the specific schema/migration
work it would need — not to make the change unilaterally, and not to leave
the finding unmentioned.

## Required checks

Run all of these before considering a PR ready for Preview / re-Preview:

```
npx tsc --noEmit
npx eslint .
npm test
npm run build
npm run verify:preview-actions
```

`verify:preview-actions` must run after `build` — it reads
`.next/server/server-reference-manifest.json`, which only exists after a
production build.

## Demo-vs-Preview comparison checklist

Product Acceptance (step 8) must explicitly walk this list for any PR that
touches a Cafe screen:

- Recipe Manager (list, cards/photos, edit)
- Manage Staff (list, add/edit form fields)
- Inventory (list, add/edit item)
- Shift Types (colors, add/edit)
- Opening / Closing stock check (load time, flow)
- Image/photo rendering wherever a path is set
- Overall layout and mobile friendliness
- Dialog/modal consistency (same shared `Modal`, same open/close/Escape
  behavior everywhere)

Any item that reads worse in Preview than in Demo blocks sign-off.
