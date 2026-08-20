# CAFE_MANAGER_UIUX_PARITY_MISSION (started 2026-08-19)

Durable handoff for a **fresh** Claude Code session continuing this
workstream. This file, git, and the repository's own tests/docs are the
source of truth — not any prior chat's conversational memory. Read this
file fully before doing anything. Everything below is VERIFIED against
tool output in the session that wrote this handoff, unless explicitly
marked INFERRED/OPEN QUESTION.

---

## 1. Roles for this session (read before doing anything)

You are **AI CTO / Technical Orchestrator** (strategy, architecture,
security, review, priorities) **and Senior Software Engineer**
(implementation) in one session — this project does not run a literal
two-agent split; one session plays both roles. Full role definitions were
pasted into chat by the Founder as two system-prompt-style documents
("ROLE: AI CTO / TECHNICAL ORCHESTRATOR / ARCHITECT" and "ROLE: SENIOR
SOFTWARE ENGINEER / IMPLEMENTATION AGENT") — read the project memory
`project_user_operating_model` (in `MEMORY.md`'s index) for the condensed
version; the two full role docs are long or ask the Founder if you need the
verbatim text again, but the short version below is sufficient to operate:

- Founder gives direction → you (CTO) plan/architect/review → you
  (Engineer) implement → you (CTO) review your own work → you fix your own
  findings → you show the Founder the result. Founder is not looped into
  routine technical decisions.
- **Standing authority already granted** (see project memory
  `feedback_routine_approvals` and `feedback_merge_authority`): decide and
  execute routine commit/push/PR-open/**merge** for GREEN-tier work
  (local app code, tests, docs, non-destructive refactors, forward-only
  migrations) without asking each time. Still hard-gate: production
  deploys, destructive SQL, RLS/security-architecture changes, secrets,
  customer data/billing, LINE broadcast/mass-messaging, force-push,
  history rewrites — those need explicit Founder approval (RED tier).
  Schema changes (new migration) are YELLOW tier — do the extra internal
  DECISION/REASON/RISK/MITIGATION/ROLLBACK review before proceeding, don't
  automatically escalate to Founder unless the risk can't be bounded.
- Respond to the Founder in Russian (their working language this session).

---

## 2. What this mission is

Founder did live QA of PR #324 (a small, already-merged hover-state
retrofit for the Manager surface) by comparing
`https://preview.oruwa.jp/manager` (canonical, account
`manager@oruwa-cafe.test` / `NewTestSmoke456!`) side-by-side with the
legacy **Mame To Cha** reference prototype at
`https://preview.oruwa.jp/mame-to-cha/manager` (account
`manager@mame-to-cha.test` / `LocalSmoke123!`), 10 screenshots. The hover
fix itself was fine, but the side-by-side comparison surfaced a much larger
design/functionality gap between canonical and the reference. **Founder's
instruction**: canonical Manager must look equal to or better than the
reference (better only if justified), Manager first — Founder personally
verifies live — then the identical treatment gets applied to `/staff`
afterward, **then Cafe v2.1 formally closes**, then Platform Foundation per
the plan already agreed 2026-08-16 (see `docs/ai/current-task.md` §5).

This grew from "finish a small hover fix" into a proper 13-Work-Package
redesign mission — planned via the full Explore → Plan → AskUserQuestion →
ExitPlanMode workflow (not ad-hoc), because of its size. **The full,
detailed plan (all research findings + all 13 Work Packages + Founder's
locked decisions) lives in the approved plan file**:

`C:\Users\User\.claude\plans\glittery-conjuring-beacon.md`

**Read that file in full before starting any new Work Package.** It is the
single most information-dense artifact from this mission — this handoff
summarizes it and adds current git/PR state, but does not repeat every
file/line-number detail already in the plan file. Do not re-derive the
Explore-phase findings by re-exploring the codebase; they are already
captured there with exact file paths and line numbers.

---

## 3. Mission scope note

**Manager surface only** this pass
(`apps/web/src/app/(protected)/manager/**` plus the shared recipe/inventory
route components it embeds). Staff gets an identical follow-up pass as a
**separate future mission** after the Founder approves the Manager result
in full — several pieces built during this mission (full-width
`RecipeForm`, `LightboxTrigger` wiring, shared `HelpIconButton`,
`ConfirmDialog`/`LoadingButton` retrofits) are shared components, so
Staff's future pass reuses them for free and should be scoped much smaller.

Do not restore `%5Fclient-preview/mame-to-cha/**` or `mame-to-cha/**` route
trees as production backend — they are read-only visual/pattern references
only (settled architecture decision, unrelated to this mission). The real
reference code to study lives in `apps/web/src/lib/preview/*.tsx` (the
DB-backed components those routes render) plus shared visual chrome in
`apps/web/src/components/demo/cafe/*` — see plan file for exact files.

---

## 4. The 13 Work Packages (see plan file for full detail per WP)

Ordered cheap/safe/high-value first; WP-13 is the one YELLOW-tier
(schema-change) item and stays last/separate with its own extra review.

| WP | Title | Status |
|----|-------|--------|
| WP-1 | Header brand badge + language-toggle contrast fix | **MERGED — PR #325 (2026-08-19, by Founder), Claude live-QA'd on 2026-08-20 (desktop + 375px)** |
| WP-2 | Recipes/Inventory nav buttons: real buttons + hover | **MERGED — PR #325, same PR as WP-1** |
| WP-3 | Manage Staff: ConfirmDialog everywhere + permanent-delete UI | **MERGED — PR #326 (2026-08-19), Claude live-QA'd (desktop + 375px)** |
| WP-4 | Recipes: full-width form + remove "Original language" field | **MERGED — PR #327 (2026-08-20), Claude live-QA'd (desktop + 375px)** |
| WP-5 | Recipes: "Delete" (replacing "Archive") + ConfirmDialog | Not started |
| WP-6 | Recipe photo upload + Lightbox (built fresh on `LightboxTrigger`) | Not started |
| WP-7 | Inventory: autosave + ConfirmDialog + permanent-delete | Not started |
| WP-8 | Schedule grid: understaffed "!" marker, per-cell correction "!", remove Estimated-labour-cost section | Not started |
| WP-9 | Cross-cutting: loading indicators (`PendingOverlay`/`LoadingButton`) + shared `HelpIconButton` + popup-speed instrumentation | Not started |
| WP-10 | QA seed-data script for `oruwa-cafe` tenant | Not started |
| WP-11 | Correction/Exchange requests: convert always-visible sections to popups triggered from `AttentionPanel` | Not started |
| WP-12 | Settings section: side-by-side diff pass vs. reference | Not started |
| WP-13 | Shift-preference deadline/reminder (YELLOW-tier, schema change, last, separate Founder approval) | Not started — do not start without a dedicated CTO extra-review pass first |

**Locked decisions (Founder answered via AskUserQuestion during planning,
all chose the recommended option — do not re-ask these)**:
- WP-3: 再送信(resend)/アクセスを回復(recover-access) buttons stay in the
  staff list row (`InvitationCell`), not duplicated inside the edit form.
- WP-4: "Original language" field is fully removed; recipe source language
  locks at creation time (defaults JA), no UI path to change it after
  creation — this is a real behavior change, call it out in the PR body.
- WP-6: Lightbox is built fresh on top of the existing-but-unused
  `LightboxTrigger` component (confirmed: no working lightbox exists
  anywhere in the repo, including the reference prototype, despite the
  Founder's screenshot impression — it only has a small static thumbnail).
  "Remove image" is a soft delete (clears the form field; the Storage
  object is only actually removed on Save, so it's undoable pre-save).
- WP-9: Do **not** add Modal-open/close animation as a blind fix for the
  "popups open slowly" complaint — the reference has zero animation too,
  deliberately (its own `ConfirmDialog` comment says speed over polish).
  Measure the actual bottleneck per popup first (lightweight timing
  instrumentation), then fix whatever the measurement shows.

---

## 5. Repository / git state (VERIFIED at handoff time)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`.
- **PR #325** (branch `fix/cafe-manager-header-nav-parity`, off a fresh
  `origin/dev`, HEAD `5e0db83`) — WP-1 + WP-2 combined, open against `dev`.
  `typecheck && lint && test (1141/1141) && build` all passed locally
  before push; GitHub Actions CI was still running (`pending`) and Vercel
  Preview was still deploying at handoff time — **check
  `gh pr checks 325` before assuming green**, don't assume it finished.
  **Not merged yet — needs Founder live Preview QA on `/manager` first**
  (standing merge authority requires green checks + live Preview QA for UI
  changes, per `feedback_merge_authority` memory — this is a UI change).
- Files changed in PR #325: new
  `apps/web/src/app/(protected)/manager/brand-badge.tsx`; modified
  `apps/web/src/app/(protected)/manager/manager-dashboard-client.tsx`
  (header block + nav buttons only — see PR diff for exact lines).
- **Prior PR #324** (A10 hover-state retrofit for 13 files in
  `(protected)/manager/`, unrelated to this mission except that it's what
  triggered the Founder's side-by-side comparison that started this
  mission) — already merged to `dev` before this mission began.
- **Two untracked files still sitting in the repo root**, unrelated to
  this mission, decision still pending from before this mission started:
  `ORUWA_CAFE_V2_1_FINAL_INDEPENDENT_QA_2026-08-17.md` and
  `ORUWA_CAFE_V2_1_FULL_QA_AUDIT_2026-08-17.md`. These are **not**
  disposable — they were the working reference for an earlier hardening
  mission (see `docs/ai/CAFE_V2_1_HARDENING_HANDOFF_2026-08-17.md`, which
  explicitly says "do not delete"). Founder was mid-decision on
  read/commit-to-docs/delete/leave-as-is when this UI/UX mission
  interrupted that conversation. Do not delete them; ask the Founder to
  resume that decision once this mission's more urgent work is further
  along, or handle it opportunistically if a natural pause occurs.
- Test accounts: `manager@oruwa-cafe.test` / `NewTestSmoke456!` (canonical,
  read/write), `manager@mame-to-cha.test` / `LocalSmoke123!` (reference,
  read-only comparison use only — never write test data there, it's a
  shared Preview DB other work also depends on).

---

## 6. Verification pattern to follow for every future WP

Matches the house style already used for PR #324/#325:
```
pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build
```
All four must pass locally before push.

**Process clarified 2026-08-20 (Founder, verbatim)**: Founder does NOT do
per-PR live QA on ephemeral Vercel PR-preview URLs. Founder only checks the
persistent `https://preview.oruwa.jp/manager` deployment, once, as the
**final acceptance gate after every WP in this mission is merged and
deployed there** ("я финальная проверка"). For each individual WP/PR in
between, **Claude does its own live Preview QA** (chrome-devtools MCP
against the PR's Vercel preview deployment URL — get it from
`gh pr view <n> --json comments` or the Vercel GitHub-bot PR comment) before
merging — desktop + mobile 375px, sign in as
`manager@oruwa-cafe.test`/`NewTestSmoke456!`. The reference site
(`mame-to-cha/manager`) is a visual guide only, never a data source. WP-3/5/6/7's new destructive
actions (permanent-delete employee/recipe/inventory-item) need a dedicated
manual QA pass confirming `ConfirmDialog` actually blocks accidental
clicks, and the blocked-by-history case shows its inline warning *before*
the click where applicable, not only on failure. See plan file's
"Verification" section for the full checklist including WP-8/WP-10/WP-13
sequencing notes (ship WP-10's seed data before or alongside WP-8's QA
pass so the new "!" markers have something to show).

---

## 7. Next step for a fresh session

1. Read the plan file in full:
   `C:\Users\User\.claude\plans\glittery-conjuring-beacon.md`.
2. Check PR #325's current CI/Vercel status (`gh pr checks 325`) and ask
   the Founder whether they've done the live Preview QA yet. If approved,
   merge it (standing authority, no need to re-ask), then start a fresh
   branch off `origin/dev` for WP-3 (`git fetch origin dev && git checkout
   -B fix/cafe-manager-staff-confirm-dialogs origin/dev`, or similar
   naming per WP).
3. Work through WP-3 onward in order, one PR per WP (WP-1/WP-2 were
   combined into one PR because both were tiny — don't assume every future
   WP combines with its neighbor; most are independently PR-sized per the
   plan file's own "ship as separate PRs" note).
4. Keep this handoff file and `docs/ai/current-task.md`'s pointer (§8
   below) updated as WPs land, so a context-compaction or a fresh session
   mid-mission never loses track of which WP is next.

---

## 8. Pointer added to `docs/ai/current-task.md`

A short pointer entry was added to that file's §5 directing any fresh
session to this handoff before treating the rest of that file's "Platform
Foundation next" text as current — same pattern used for the prior Cafe
Manager Parity mission's handoff. This mission does not change the
Founder's already-agreed sequencing (Manager UI/UX parity → Staff UI/UX
parity → Cafe v2.1 formally closes → Platform Foundation); it's a detour
the Founder explicitly authorized, same as the Manager Parity + Design-Kit
mission was before it.
