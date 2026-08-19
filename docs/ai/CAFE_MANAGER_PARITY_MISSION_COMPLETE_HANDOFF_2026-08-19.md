# CAFE_MANAGER_PARITY_MISSION_COMPLETE_HANDOFF (2026-08-19)

Durable handoff for a **fresh** Claude Code session. This file, git, and the
repository's own tests/docs are the source of truth — not any prior chat's
conversational memory. Everything below is VERIFIED against tool output in
the session that wrote this handoff, unless explicitly marked INFERRED or
UNKNOWN.

---

## 1. Roles (read before doing anything)

You are AI CTO / Technical Orchestrator (strategy, architecture, security,
review, priorities) **and** Senior Software Engineer (implementation) in one
session — no separate "two agents" split in this project. Full role
formalization lives in project memory — read `project_user_operating_model`
at the start of the session (links to `feedback_routine_approvals` and
`feedback_merge_authority`). Respond to the Founder in Russian (working
language all mission).

Short version: routine dev decisions (commit/push/PR/merge, code changes
within approved scope, migrations authored **locally only**) — decide and
do, without re-asking. Real production/destructive/RLS-architecture/
billing/LINE-broadcast work — always stop and ask for explicit Founder
approval.

---

## 2. What just finished

The **Cafe Manager Parity + Design-Kit mission** (Founder-directed,
started 2026-08-18) is now **fully complete — all three tracks closed**:

- **Track A** (design-kit + Manager UI visual/UX parity with the Mame To Cha
  reference): **A1–A10 all done** (A2 and part of A10 explicitly deferred
  with reasons, not silently skipped — see §3).
- **Track B** (LINE LIFF login architecture): **B1–B4 all done** — full
  code-level login flow exists (LINE ID-token verification → employee
  resolution → magic-link session), not deployed or live-tested yet
  (deferred to after Cafe v2.2 per Founder direction — this was always the
  plan, not a gap).
- **Track C** (live-sync + notification stub): **C1–C2 both done** —
  Recipes now live-sync the same way the Staff schedule already did;
  inert LINE-notification call-site contract established.

**14 PRs merged this session** (#308–#322, skipping only #313 which was
docs-only and #317 which was superseded/closed for a branching mistake).
All merged to `dev`. Nothing is mid-flight; every PR that touched
`apps/web` passed `typecheck && lint && test && build` before merge, and
every PR with a live UI surface got live Preview QA (desktop 1440px +
mobile 375px where relevant) before merge — see §4 for exactly what was
verified live vs. not.

**Full plan file** (now fully executed, keep for history/reference):
`C:\Users\User\.claude\plans\line-id-humming-sky.md`.
**Project memory**: `project_cafe_manager_parity_design_kit_mission` (in
`MEMORY.md`'s index) — has the same status in more granular, session-by-
session form; read this handoff first, it's the more current single
source.

---

## 3. What is explicitly deferred (not forgotten — read before re-proposing)

- **A2** (repoint 14 legacy `demo/cafe` call sites to the shared
  design-kit): deferred indefinitely at execution time — the shim already
  delegates to the shared code, so this is zero functional benefit for
  real rewrite risk. Do not re-attempt as a dedicated PR; fold into
  whichever future PR next touches each file anyway.
- **A10's full retrofit**: the plan estimated ~65 button-style call sites
  needing a hover-state `className`; actual grep at execution time found
  **~255 usages across 68 files** (demo/preview trees included) — 4x
  larger, and a blind mechanical pass across that many files risks
  corrupting JSX with no automated check that would catch a silently-
  missed site. **Founder decision** (asked explicitly mid-session):
  ship infrastructure + the shared design-kit only (`Modal`/
  `ConfirmDialog`, PR #320); defer the full retrofit as a separate,
  explicitly-scoped follow-up. `theme.module.css` + the pattern already
  exist — a future WP just needs to walk the other 66 files.
- **Track B live verification**: `supabase/functions/liff-entry` is not
  deployed to any Supabase project; no real LINE Official Account/LIFF
  app has been registered; nothing has been tested against real LINE
  infrastructure. This was **never in scope for this mission** — Founder
  direction from the start: "build and unit-test now, live verification
  deferred to after Cafe v2.2 closes." Do not treat this as an oversight.
- **A9** (tooltip copy): not actually deferred — folded into A6/A7/A8's
  own "?" info-Modals as they were built, per the plan's own explicit
  allowance to do that instead of a standalone WP. All JA/EN copy
  introduced this mission (info-Modal bodies, new UI strings) is
  machine-translated and **needs native Japanese review** — same
  standing item as `I18N-JA-1` in `docs/ai/current-task.md`, not new.

---

## 4. Live-QA verification status (be precise, don't overclaim)

Verified live on Vercel Preview this session, two-tab/two-context where
relevant:
- A6: info popup, staff-name detail popup + clipboard copy, Assign→Edit→
  Unassign→ConfirmDialog→banner flow, focus restore, mobile card view.
- A7: labour-cost numbers against real attendance data, info popup.
- A8: shift-type add/edit/self-resave/duplicate-name-rejection/deactivate,
  autosave, legend chip label bug caught and fixed **during this same
  session's QA** (was showing internal code, not display label).
- A10: Modal renders correctly post-change (hover itself not
  automatable with the available tooling — verified via successful
  build + no visual regression, not a live `:hover` trigger).
- C1: **real two-browser-context test** — Manager edited a recipe title
  in an isolated Chrome context while a Staff session (different account,
  same browser, default context) had the recipe list open; the Staff tab
  updated within the poll interval with zero page interaction. This is
  the strongest evidence of correctness produced this session. Test data
  reverted after.
- B1–B4: **NOT live-tested** (see §3 — out of scope by design).
- C2: **NOT live-tested** (inert stub, nothing observable to test; test
  suite proves the no-throw/no-I/O contract instead).

---

## 5. Repository / environment state (VERIFIED, carried over + reconfirmed)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`. Current local
  branch at handoff time: `fix/cafe-manager-parity-pending`, reset to
  `origin/dev` tip (clean, no divergence).
- **Local worktree quirk still applies**: `D:\Dev\line-business-os-founder-audit`
  has `dev` checked out, so `git checkout dev` / `gh pr merge` (which
  tries to switch the local worktree to the base branch) always errors
  with `fatal: 'dev' is already used by worktree` — **this error is
  expected and harmless**; the merge itself succeeds remotely regardless.
  Verify with `gh pr view <n> --json state,mergedAt`, then
  `git fetch origin dev && git checkout -B <branch-name> origin/dev` for
  the next piece of work.
- **New branch-hygiene lesson from this session** (read before starting a
  new branch): always create a fresh branch from `git fetch origin dev`+
  `origin/dev`, never from a just-merged local branch's tip — a squash-
  merge produces a *different* commit than your local pre-squash history,
  so a next branch built on the stale local tip carries a phantom extra
  commit and shows as `CONFLICTING` on GitHub even though the diff itself
  is fine. Happened once this session (PR #317, closed and redone as
  #318) — costs a wasted PR, not dangerous, but avoidable.
- `apps/web/package.json`'s `test` script is an **explicit file list, not
  a glob** — a new `*.test.ts` file is silently never run unless added to
  that list by hand. **Also found and fixed this session**: the list had
  `workforce-theme.test.ts` registered at a *wrong path* (one directory
  off from where the file actually lives), so ~10 pre-existing tests had
  been silently dead for an unknown period before this session — fixed,
  confirm the fix is still in place (`git log -- apps/web/package.json`)
  if anything about that file's test coverage looks suspicious later.
- **CSS Modules cannot be imported from `theme.ts`** (or any other
  non-component module many test files import) — this repo's Node test
  runner (`node --test`, via `tsx`) has no webpack/Next pipeline to parse
  a `.css` import, and doing so breaks every test file that transitively
  imports the offending module. If adding more CSS-Module-based styling,
  import the `.css` file directly in the `.tsx` component that needs it,
  never through a shared token/style module.
- Local Supabase (Docker) presumed running per prior sessions' notes —
  **not re-verified this session** (no migration work happened, no local
  DB interaction needed).
- Test accounts (shared Cloud Preview DB, tenant `oruwa-cafe`), all
  reconfirmed working this session:
  - `manager@oruwa-cafe.test` / `NewTestSmoke456!`
  - `konstantin.a.chvykov@gmail.com` / `StaffAAnNChnHvHBXZ!2` (staff
    identity 田中美咲)
  - `konstantin.a.chvykov+staffc@gmail.com` / `StaffAAnNChnHvHBXZ!3`
    (staff identity 鈴木健太)
- chrome-devtools MCP: **confirmed working with `isolatedContext`** for
  simultaneous multi-role login (used successfully for C1's two-context
  live test) — `new_page({ url, isolatedContext: 'some-name' })` opens a
  page with its own cookie jar, separate from the default context. Use
  this pattern for any future two-role live QA instead of trying to juggle
  sign-out/sign-in in one context.
- Test count at handoff: **1141**, all green
  (`pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build`).

---

## 6. What has NOT been touched / verified this session (don't assume)

- No Supabase Cloud `db push`/`db pull`/migration repair happened —
  correct, none of this mission's WPs needed a new migration at all
  (A8's schema support already existed; B1 confirmed no migration
  needed either).
- `docs/ai/current-task.md` (the canonical project-state file) was
  **not fully rewritten** by this handoff — only a pointer note was
  added (see that file's own §5). It still describes the **pre-this-
  mission** state (Cafe Commercial Launch Readiness step 1, Platform
  Foundation next) as of its last full edit. A fresh session should
  treat *this* handoff as authoritative for the Cafe Manager Parity
  mission specifically, and `current-task.md` as authoritative for
  everything else, until someone does a full reconciliation pass.
- No decision has been made about what comes next (see §7) — that is
  explicitly for the Founder, not assumed by this handoff.

---

## 7. Next step — genuinely open, needs Founder direction

This mission has no more open WPs of its own. The next session should
**ask the Founder what to work on**, not assume. Known candidates, not
prioritized against each other by this handoff:

1. **Resume the pre-mission plan**: `docs/ai/current-task.md` §5 said
   "Platform Foundation critical path" (Entitlements → Module Registry →
   Shared Navigation/Settings → Notifications → Event Bus) was next,
   before this mission interrupted it. Still valid unless superseded.
2. **A10's deferred full retrofit** (§3) — a bounded, low-risk-if-careful
   follow-up now that the infra exists.
3. **Track B live verification** — deploying `liff-entry`, registering a
   real/sandbox LINE Official Account, exercising the full flow — but
   Founder direction was explicit this is post-v2.2, so likely not yet.
4. **Cafe v2.2** itself (a separate, not-yet-scoped initiative per
   `project_v2_2_and_provisioning_plan` memory).
5. Something the Founder has in mind that isn't reflected in any of the
   above documents yet.

Do not silently pick one — this is exactly the kind of direction-setting
decision that belongs to the Founder per the operating model's own
autonomy boundaries.
