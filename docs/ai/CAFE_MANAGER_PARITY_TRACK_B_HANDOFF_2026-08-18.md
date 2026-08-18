# CAFE_MANAGER_PARITY_TRACK_B_HANDOFF (2026-08-18)

Durable handoff for a **fresh** Claude Code session continuing this
workstream. This file, git, and the repository's own tests/docs are the
source of truth — not any prior chat's conversational memory. Everything
below is VERIFIED against tool output in the session that wrote this
handoff, unless explicitly marked INFERRED or UNKNOWN.

---

## 1. Roles (read before doing anything)

You are AI CTO / Technical Orchestrator (strategy, architecture, security,
review, priorities) **and** Senior Software Engineer (implementation) in
one session — there is no separate "two agents" split in this project.
Full role formalization (approval matrix GREEN/YELLOW/RED, task format,
review loop, context management) already lives in project memory — read
`project_user_operating_model.md` at the start of the session (it links to
`feedback_routine_approvals` and `feedback_merge_authority`).

Short version: routine dev decisions (commit/push/PR/merge, code changes
within approved scope, migrations authored **locally only**) — decide and
do, without re-asking. Real production/destructive/RLS-architecture/
billing/LINE-broadcast work — always stop and ask for explicit Founder
approval. Respond to the Founder in Russian (this has been the working
language all mission).

---

## 2. What this workstream is

Founder-directed mission (started 2026-08-18): bring the canonical
`/manager` dashboard to visual/UX parity with the old **Mame To Cha**
reference prototype (visual reference only, never a code source), plus two
pieces of real product architecture the prototype never had: **LINE LIFF
login** (this handoff's subject) and cross-role live sync.

Full plan (STATUS section at the top is the current source of truth, read
that before the narrative below it): `C:\Users\User\.claude\plans\line-id-humming-sky.md`.
Project memory: `project_cafe_manager_parity_design_kit_mission` (in
`MEMORY.md`'s index).

Three independent tracks, none blocking the others:
- **Track A** (design-kit + Manager UI parity) — **feature-complete
  through WP A5** as of this handoff (see §3). Remaining items (A6-A10)
  are lower-stakes visual polish, not structural gaps.
- **Track B** (LINE LIFF login) — **this handoff's subject, not started
  at all yet**. Founder called this **mandatory**, not optional: "we work
  from LINE without installing anything" is the product's core sales
  pitch.
- **Track C** (live-sync + notification stub) — not started, lower
  urgency (Founder: "preferably without подписки/subscriptions" — the
  proven poll pattern already satisfies that; not urgent).

**Founder's own direction, given at the end of this handoff's session,
when asked which to do next: Track B before Track A's remaining polish
(A6-A10) or Track C.** Do not re-litigate this prioritization without a
new, explicit Founder instruction.

---

## 3. What is DONE and VERIFIED (do not re-do, do not re-litigate)

All of the below merged to `dev`, live-QA'd on Vercel Preview (desktop
1440px + mobile 375px), `origin/dev` HEAD at handoff time: `0b66559`.

- **WP A1** (shared design-kit: `Modal`/`ConfirmDialog`/
  `useRestoreFocusOnClose`/`Skeleton`/`Toast`/`EmptyState`/`Lightbox` at
  `apps/web/src/components/shared/design-kit/`) — PR #307.
- **WP A2** (repoint 14 legacy `demo/cafe` call sites to the shared
  design-kit) — **deferred indefinitely**, zero functional benefit
  (the demo shims already delegate to the shared code). Do not
  re-attempt as a dedicated PR.
- **Gate 0/Gate 1** (`PendingInvitationBanner` investigation) —
  **RESOLVED as a real RLS bug**, not stale fixture data (the prior
  session's conclusion was wrong; re-investigated live via direct
  Supabase Cloud SQL this session). Root cause:
  `workforce.employee_invitations` has two permissive SELECT RLS policies
  (`wf_employee_invitations_manager_read` tenant-wide,
  `wf_employee_invitations_self_read` self-scoped) that Postgres OR's
  together, so any Manager saw every pending invitation in their tenant,
  not just their own. Fixed with migration
  `0069_workforce_my_pending_invitations_fix.sql` (new
  `workforce.my_pending_employee_invitations()` SECURITY DEFINER RPC,
  same shape as `accept_employee_invitation`) — PR #311, merged.
  **Local migration only — no Cloud `db push` yet, needs separate
  explicit Founder approval** before the fix is live in Preview/Prod and
  before the banner itself can be live-QA'd again.
- **WP A3** (compact "Needs attention" card row, `attention-panel.tsx`)
  — PR #308.
- **WP A4** (Manage-staff popup: search + Active/Deactivated/All filter,
  `manage-staff-popup.tsx` + `staff-filter.ts`) — PR #309. Also fixed a
  real pre-existing bug caught during this WP's QA: every `.cardView`
  call site's inline `style` had `display: 'flex'` unconditionally,
  which always overrode `manager-dashboard.module.css`'s
  `display: none` above 767px — the mobile-only card list was rendering
  under the table at every viewport width, desktop included. Fixed at
  the source (CSS Module now owns `display`).
- **WP A5a** (Manage-inventory popup, `inventory-popup.tsx` +
  `InventoryDashboardBody`'s new `embedded` prop) — PR #310.
- **WP A5b** (Manage-recipes popup, `recipes-popup.tsx` +
  `RecipesListBody`/`RecipeDetailBody`'s `embedded` props + new
  `getRecipeDetailForPopup` Server Action) — PR #312. Recipe list AND
  detail are two views of the SAME `Modal` (view-swap, not page
  navigation) per Founder's explicit "popups look like one component"
  direction.
- **A5a/A5b's role-aware redirect pattern** (important, reusable for any
  future "make an existing shared Staff+Manager page a Manager popup"
  work): `/inventory` and `/recipes` are shared by both roles — only a
  caller who passes the same `hasManagerAccess` gate `/manager` itself
  uses gets redirected into `/manager?popup=inventory|recipes`; Staff
  keeps the exact unchanged standalone page. **The plan's original text
  said to blindly redirect everyone — that would have broken Staff's
  access entirely. Caught before implementing, confirmed with the
  Founder to make it role-aware instead. Do not re-introduce a blind
  redirect.**

Test count at handoff: **1115**, all green
(`pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build`).

### Known accepted minor gaps (do not "fix" without a new reason to)
- Inventory/Recipes popups: pressing Escape while a nested Add/Edit form
  is open closes the form AND the whole popup in one step, not layered
  one-level-at-a-time like WP A4's Manage-staff popup. Documented in
  `inventory-popup.tsx`'s own comment; not worth re-architecting for
  this reason alone.
- A deep-link auto-opened popup (`?popup=inventory|recipes`, no real
  click that triggered it) restores focus to `<body>` on close, not a
  trigger button, since there was no real opener element. Acceptable —
  same as a fresh page load, not a broken state.

---

## 4. Repository / environment state (VERIFIED)

- Repo: `D:\Dev\line-business-os`. Base branch: `dev`.
- **Important local quirk**: another local worktree
  (`D:\Dev\line-business-os-founder-audit`) has `dev` checked out, so
  `git checkout dev` / `gh pr merge` (which tries to switch to the base
  branch locally) fails with `fatal: 'dev' is already used by worktree`.
  Workaround already established this session: after merging a PR via
  `gh pr merge <n> --squash --delete-branch` (the merge itself succeeds
  remotely even though the local worktree-switch step errors), verify
  with `gh pr view <n> --json state,mergedAt`, then
  `git fetch origin dev && git checkout -b <new-branch-name> origin/dev`
  for the next piece of work, deleting the old local branch with
  `git branch -D`.
- `apps/web/package.json`'s `test` script is an **explicit file list, not
  a glob** — a new `*.test.ts` file is silently never run unless added to
  that list by hand. Always sanity-check the total test count moved by
  roughly the expected number of new cases after adding a test file (see
  `project_web_test_script_explicit_filelist` memory).
- Local Supabase (Docker) is running (`supabase_db_line-business-os` etc.
  containers). `npx supabase migration up --local` (or
  `db reset --local` if that fails) applies pending migrations.
- Test accounts (shared Cloud Preview DB, tenant `oruwa-cafe`):
  - `manager@oruwa-cafe.test` / `NewTestSmoke456!`
  - `konstantin.a.chvykov@gmail.com` / `StaffAAnNChnHvHBXZ!2` (staff
    identity 田中美咲, has account access)
  - `konstantin.a.chvykov+staffc@gmail.com` / `StaffAAnNChnHvHBXZ!3`
    (staff identity 鈴木健太, has account access)
  - `konstantin.a.chvykov+staffb@gmail.com` (staff identity 佐藤陽介,
    invite still pending as of handoff — do not "fix" this, it is real
    fixture state, not a bug)
- **No direct Supabase Cloud DB credential access in this sandboxed
  session** — `.env.cloud.local` is blocked by permission settings. Any
  live-DB read-only investigation needs the Founder to run SQL in
  Supabase Studio and paste back results (worked well this session for
  Gate 1 — draft the SQL, ask the Founder to run it, iterate from their
  output).
- chrome-devtools MCP is available for live Preview QA
  (`mcp__chrome-devtools__*` tools) — used extensively this session for
  desktop (1440x900) + mobile (375x812, `mobile,touch` emulation) QA.
  Note: if it errors with "browser is already running", a stale
  automation Chrome process from a prior session may be holding the
  profile lock — find it via
  `wmic process where "name='chrome.exe'" get ProcessId,CommandLine` and
  look for `--user-data-dir=...chrome-devtools-mcp\chrome-profile`, then
  `taskkill //PID <n> //F` (safe — it's a dedicated automation profile,
  not the user's real browser).

---

## 5. How to continue — Track B (LINE LIFF login), recommended step order

Follows `docs/architecture/workforce-line-liff-entry-plan.md` §11
verbatim (read that file in full before starting — it already designs the
whole flow: Rich Menu → LIFF → `apps/api` server-side ID-token
verification → resolve via `core.line_accounts` blind-index hash →
session; manager-approved/one-time-code linking, never bare self-link).
Do not conflate with `supabase/config.toml`'s unused `[auth.external.line]`
block — that is a different (incompatible, redirect-OAuth) mechanism.

### B1 — Schema check
`0004_line_registry.sql` already defines `core.line_channels` (per-tenant
LINE OA channel config, secrets encrypted at app layer) and
`core.line_accounts` (blind-index-hashed LINE user id ↔ `core.users`
link) — VERIFIED present in the migrations directory at handoff time.
**Verify at build time** whether this existing scaffolding already fully
covers what B2/B3 need, or whether a new column/table is needed (e.g. a
dedicated `staff_line_links` join if `core.line_accounts` alone isn't
enough for the manager-approval/one-time-code flow the architecture doc
describes). If a migration is needed: **local only**, no Cloud `db push`
without separate explicit Founder approval at execution time. RLS
reviewed for tenant isolation (own-tenant/cross-tenant/anon/no-JWT), same
bar as `docs/architecture/workforce-rls-security-plan.md` §12 (if that
file still exists under that name — verify).

### B2 — `apps/api` LIFF ID-token verification endpoint
New `apps/api/src/line/liff-entry.controller.ts` (sibling to the existing
`line-webhook.controller.ts` pattern — read that file first for the
established controller/service split) + `liff-entry.service.ts`: verifies
the LINE ID token server-side against LINE's own servers (never trusts a
client-supplied claim), extracts the LINE user id, looks up
`core.line_accounts` by blind-index hash scoped to the tenant resolved
from the channel config (never from client input). Reuse
`apps/api/src/auth-boundary/*` helpers. Confirm via the existing
service-role-key test pattern that no secret/service-role key is
introduced into `apps/web`.

Acceptance: unit tests for expired/wrong-audience/malformed token,
unlinked user (never auto-self-link), linked user resolves the correct
`staff_profiles` row, cross-tenant channel/staff mismatch rejected.

### B3 — Staff identity linking flow (highest-risk part)
Manager-facing "Link LINE account" action inside the **already-merged**
A4 Manage-staff popup (`apps/web/src/app/(protected)/manager/manage-staff-popup.tsx`)
— approve a pending link, or issue a one-time code. New
`apps/web/src/lib/workforce/line-links-actions.ts` calling B2's
endpoints. **Never a bare self-link.**

Acceptance: tests for rejected unapproved self-link, successful approved
link, one-time-code expiry/single-use.

### B4 — Minimal LIFF entry route in `apps/web`
New `apps/web/src/app/liff-entry/page.tsx`: accepts the LIFF-provided ID
token client-side, forwards to B2, establishes a session on success,
redirects into the same authenticated routes used by direct web login
(LIFF is an entry wrapper, not a separate app surface). Email/password
login stays untouched as the secondary entry method for PC/homescreen
use.

**Explicitly out of scope for Track B right now**: Rich Menu image/
console setup (manual, per-tenant, later), any live LINE Official Account
testing/verification — ships as reviewed, tested-with-mocked-LINE-
responses architecture; live end-to-end verification is deferred to
after Cafe v2.2 per Founder direction and the design doc's own §13. Do
not attempt to fabricate a "live" LINE test in this phase.

### Per-PR discipline (same as every WP this mission)
Each B-step ships as its own bounded PR: `pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build`
green, plus (for `apps/api` changes) whatever that package's own
equivalent checks are — verify the exact commands from its `package.json`
before assuming they match `apps/web`'s. Live Preview QA where there's a
UI surface to check (B3's Manage-staff popup addition, B4's entry route);
B1/B2 are backend-only and rely on unit tests instead.

---

## 6. If picking Track A polish or Track C instead

Not recommended first (see §2's Founder direction), but if redirected:
- **Track A remaining** (A6 shift-schedule header/staff-name popup/
  legend, A7 labour cost, A8 settings, A9/A10 tooltip/hover polish) — see
  the plan file's own A6-A10 section text, unchanged since mission start.
- **Track C** (C1 extend the Staff dashboard's existing 2.5s poll pattern
  to Recipes, C2 inert LINE-notification-queue stub) — see the plan
  file's own Track C section text, unchanged since mission start.

---

## 7. Naming caveat

Branch names this session followed `fix/cafe-manager-parity-<wp-slug>` —
not semantically "fix" for the feature PRs (A3/A4/A5a/A5b), just the
established naming stem for this workstream's branches. Keep using that
stem (or switch to `feat/cafe-manager-parity-track-b-<slug>` for Track B
work, which is more accurate) for consistency; not a hard rule, just what
was used.
