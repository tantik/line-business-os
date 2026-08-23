# Platform Foundation / main↔dev Reconciliation Triage — 2026-08-23

Read-only triage per Founder direction (2026-08-23): investigate the
suspected Platform Foundation migration/schema drift before any further
Platform Foundation work, without Cloud DB writes and without starting
Foundation implementation. This document is the durable record so a future
session can pick this up without re-deriving it. Read this file before
touching Platform Foundation again.

## 0. Scope and method

Everything below is VERIFIED by read-only tooling this session: `git log`,
`git branch`, `git merge-base`, `git rev-list`, `git ls-tree`, `git show`,
`gh pr view`, `pnpm exec supabase migration list`, `pnpm exec supabase
projects list`. One read-only schema-diff attempt (`supabase db diff
--linked`) failed harmlessly (no Docker/shadow DB available in this
environment) — see §3, it did not touch the remote database. No
`db push`/`db pull`/`link`/`migration repair` was run; no migration file was
created or edited; no Foundation implementation code was written.

## 1. Correction to prior project memory: no current migration drift

Prior session memory (`project_migration_drift_platform_foundation.md`)
claimed Supabase Cloud dev had migrations `0060, 0070-0073` applied with no
matching local files, and warned to run `supabase migration list` before any
push. **That memory is now stale.** Live check today:

```
pnpm exec supabase migration list
```

Local and Remote are in exact sync across every migration number present in
`dev`, including the same gap (`0059 → 0061`, i.e. `0060` absent; `0069 →
0074`, i.e. `0070`-`0073` absent) on **both** sides. There is no drift
between `dev`'s migration files and what Supabase Cloud dev's migration
ledger currently reports. The prior memory entry should be treated as
superseded — see §3 for why the ledger looks different today than it did on
2026-08-16.

## 2. The real finding: `main` and `dev` have diverged since 2026-08-16, undocumented

`git merge-base origin/main origin/dev` = `e03f93b` ("docs(cafe): record
Commercial Launch Readiness step 1 complete, deploy Defect C's Edge
Function", 2026-08-16 17:01 JST). Since that single commit, the two branches
have evolved **independently** — neither is an ancestor of the other:

- **`origin/main`**: 20 unique commits, last touched 2026-08-17 12:10 JST
  (a revert, PR #272 reverting PR #271). Contains:
  - The full Platform Foundation critical path, all 5 steps, each as its
    own PR into **`main`** (not `dev`): Entitlements engine (#254),
    Module Registry (#256), Shared Navigation + Shared Settings (#258),
    Notifications engine (#260), Event Bus (#262) — migrations
    `0069_core_entitlements_engine.sql` through
    `0073_core_event_bus.sql`.
  - `main`'s own `docs/ai/current-task.md` (as of PR #268, 2026-08-16)
    states this critical path was **pushed to Supabase Cloud dev the same
    day**, Founder-run per the `.claude/settings.json` hard gate on
    `db push`, and that `supabase migration list` confirmed remote matched
    local through `0073` at that time. See §3 — this is no longer true
    today.
  - PR #264: restored a previously-lost migration
    `0060_workforce_recipe_tenant_wide_update_fix.sql` (found only in an
    untracked git stash), and closed a permission-gap where `pnpm exec
    supabase link/db push/db pull` bypassed the deny rules that already
    blocked the bare `supabase ...` form.
  - PR #266/#267: **Surface A (`_client-preview/mame-to-cha`) was retired**
    on `main`. `dev`'s own `current-task.md` (§2.4) still lists Surface A
    retain-vs-retire timing as an **open, undecided** Founder question —
    the two branches' documentation directly disagree on this point.
  - PR #268: a New-Tenant/Provisioning Test D1 gate was actually run
    against Cloud dev (read-only verification, `mame-to-cha` tenant found
    pre-existing, no write), then explicitly paused, not abandoned.
  - PR #269, #270: a permission-allowlist expansion and a Manager/Staff
    sign-out control fix.
- **`origin/dev`**: ~131 unique commits as of this triage (a moving target —
  `dev` is under active development, including this session's own PRs, so
  the exact count will already be higher by the time this is read; treat it
  as "well over a hundred," not a fixed figure) since the same split point —
  every
  piece of Cafe v2.1 work this project's sessions have tracked since
  2026-08-16 (Weekly Schedule Founder Review rounds, Manager Attention UX,
  Cafe Manager UI/UX Parity mission, the Shift Requests Review Popup, and
  this session's AI governance bootstrap). `dev`'s `docs/ai/current-task.md`
  is the sole canonical mission-state document referenced by `AGENTS.md`
  and every session since — and it has **no awareness of `main`'s parallel
  history at all**. It states Platform Foundation as flatly "Not started,"
  which is accurate only *for `dev`* — the work exists, completed, on
  `main`.

**Practical consequence if the branches were ever merged:** a real file
conflict at minimum on `supabase/migrations/0069_*.sql` (different content
on each side — `dev`'s is
`0069_workforce_my_pending_invitations_fix.sql`, `main`'s is
`0069_core_entitlements_engine.sql`), plus `main` lacking `dev`'s `0074`-
`0080` and `dev` lacking `main`'s `0070`-`0073`. This is a manual
reconciliation, not a fast-forward or a clean rebase, given 131 vs 20 commits
of independent history.

## 3. Open, unresolved risk: Cloud dev's actual schema state is not fully verified

`main`'s account (§2) says Cloud dev's migration ledger matched through
`0073` on 2026-08-16. Today's live check (§1) shows the ledger no longer
lists `0070`-`0073` as applied — it now matches `dev`'s own file set
instead. Something changed the remote ledger between 2026-08-16 and now.
**What is not established:**

- Whether `core.entitlements`, `core.module_registry`, the Shared
  Navigation/Settings tables, `core.notifications`, and `core.events`
  (the objects those migrations would have created) still physically exist
  on Cloud dev as orphaned, migration-untracked schema — or were cleanly
  rolled back along with the ledger entries.
- A read-only `supabase db diff --linked` was attempted to check this
  without any write; it failed because this environment has no Docker
  (needed for the CLI's shadow database), not because of a permission
  block. No workaround was attempted, to stay strictly inside "read-only
  diagnostics, no risk of an accidental write."

**This must be checked before any future Platform Foundation
implementation actually touches Cloud dev** — a schema-introspection query
(read-only `information_schema`/`pg_catalog` check via an environment with
DB access, or `supabase db diff` from a machine with Docker) is the natural
next step when that work resumes, not a blocker on the current Product
Completion Audit.

## 4. What this triage does NOT resolve (Founder decision required, not before)

Per Founder direction, Platform Foundation implementation does not resume
until after the Current Product Completion Audit and Manager/Staff
completion. When it does, these open questions need a decision, not another
audit:

1. **Which branch is authoritative going forward** — does `dev` eventually
   merge into `main` (restoring the stated `main`=stable/`dev`=integration
   model), does `main` get reset to `dev` with the Platform Foundation work
   re-applied on top, or something else? This is a repository-governance
   decision, not an engineering one.
2. **Is `main`'s Platform Foundation code reusable**, given it targets a
   Core (`packages/core`, migrations up to `0068`) that is now 131 commits
   stale relative to `dev` — or is a clean re-implementation against
   current `dev` safer/faster than adapting it?
3. **Is `main`'s Surface A retirement (PR #266) actually the Founder's
   final decision**, superseding `dev`'s "still open" framing — or did
   that happen on `main` for a reason that doesn't apply to `dev`'s current
   state? This is a real product-decision discrepancy between the two
   branches' documentation, not just a code-merge question.
4. **Resolve §3's open schema-state question** with actual DB access
   before writing or applying any new Platform Foundation migration, to
   avoid colliding with orphaned objects.

## 5. Explicitly confirmed: no side effects from this triage

No Cloud DB write of any kind. No migration file created, edited, or
applied. No Platform Foundation implementation code written. No `main`
branch action taken (no push, no merge, no checkout-and-modify). All
findings above come from already-existing, already-merged history plus one
harmless failed local command (§3).
