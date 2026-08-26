# MODULE_ACCESS_SECURITY_REMEDIATION_HANDOFF (2026-08-26)

Durable handoff for a **fresh** Claude Code session continuing the
Module Access Security Remediation implementation mission. This file, git,
and the repository's own tests/docs are the source of truth — not any prior
chat's conversational memory. Everything below is VERIFIED against tool
output in the session that wrote this handoff, unless explicitly marked
INFERRED or UNKNOWN (Operating Model §6).

## 1. Repository / git state (VERIFIED)

- Base branch: `dev`. As of this handoff, `origin/dev` HEAD is `1ba5b6f`
  (PR #450, WP-S3, merged).
- Current session's last working branch: `feature/module-access-security-s4-booking`,
  HEAD `8149050`, pushed to origin, working tree clean, nothing
  uncommitted. This branch is PR #451 (see §2) — **do not delete or force-
  push it** until #451 merges.
- Each staged domain used its own feature branch off `dev` (or, when the
  prior stage hadn't merged yet, off the prior stage's branch, then rebased
  onto `origin/dev` once it merged — see each PR's own history for the
  exact base at open time). Recommended for the next session: branch
  WP-S5 (Workforce) as `feature/module-access-security-s5-workforce` from a
  freshly-fetched `origin/dev` (fetch first — do not assume #451 is merged
  without checking).

## 2. Relevant merged/open PRs

| PR | Domain | Migration(s) | Test file(s) | Status |
|---|---|---|---|---|
| #448 | WP-S1 core helper | `0093_core_has_module_access.sql` | `0040_core_has_module_access.sql` | **MERGED** |
| #449 | WP-S2 Purchases | `0094_purchases_module_access_gate.sql` | `0041_purchases_module_access_gate.sql` (new), `0038_purchases_module.sql` (fixture fix) | **MERGED** |
| #450 | WP-S3 Inventory | `0095_inventory_module_access_gate.sql` | `0042_inventory_module_access_gate.sql` (new), `0014`/`0017`/`0023`/`0041` (fixture fixes) | **MERGED** |
| #451 | WP-S4 Booking | `0096_booking_module_access_gate.sql` | `0043_booking_module_access_gate.sql` (new) | **OPEN, Founder-approved, not yet merged** — CI green, Independent Reviewer PASS (one non-blocking note, see §4). Founder said he will merge it himself on GitHub (same RED-path reason as #448-450, see §11) but had not done so as of this handoff. **Check `gh pr view 451 --json state,mergedAt` before assuming either way.** |

All four PRs merge (or will merge) into `dev` only. `main` was never
touched. No Supabase Cloud/remote DB write happened at any point — every
`supabase db reset`/`test db` this mission ran was local-only.

## 3. Verified results (CLOSED — do not reopen without new evidence)

- `core.has_module_access(p_tenant_id uuid, p_module core.module_code) returns boolean`
  (0093, merged) is the reusable primitive: fail-closed (missing
  `core.tenant_modules` row or `is_enabled=false` → `false`), no
  `core.is_platform_staff()` bypass (deliberately, per Founder decision —
  distinct from `core.has_permission()`), `SECURITY DEFINER`, fixed
  `search_path`, EXECUTE revoked from PUBLIC/anon, granted to `authenticated`
  + `service_role` up front. Verified via 21 pgTAP assertions
  (`0040_core_has_module_access.sql`), Independent Reviewer PASS.
- **Purchases (WP-S2, merged):** `purchases_actions_select`/`insert` RLS and
  `api.record_purchase_action` all gate on
  `core.has_module_access(tenant_id, 'inventory')` (Purchases rides
  Inventory's own module flag, no separate `core.module_code` value — this
  was already `0089`'s design, just never enforced before WP-S2). Verified
  ON/OFF/ON-again lifecycle, RLS + RPC + direct-INSERT all blocked when OFF,
  rows preserved. Independent Reviewer PASS.
- **Inventory (WP-S3, merged):** every tenant-facing Inventory RLS path
  (`inv_items_select/insert/update`, `inv_stock_counts_select/insert`,
  `inv_check_sessions_read/write`, `inv_check_session_items_read/write`,
  `inventory-media` Storage bucket policies) plus
  `inventory.permanently_delete_item()` (SECURITY DEFINER, explicit
  in-function pre-check since it bypasses RLS entirely) now gate on
  `core.has_module_access(tenant_id, 'inventory')`. Closes the gap WP-S2
  flagged as pending: `api.purchases_needed` now goes fully empty when
  Inventory is OFF, not just its acknowledgement half. Verified via 23 new
  pgTAP assertions plus fixture fixes to `0014`/`0017`/`0023`/`0041`.
  Independent Reviewer PASS (two rounds — see §4 for the self-caught
  near-regression).
- **Booking (WP-S4, PR open, approved, not yet merged):** all six RLS
  policies from `0010_booking.sql` (`bk_services_read/write`,
  `bk_staff_read/write`, `bk_hours_rw/read`, `bk_blocked_rw`,
  `bk_bookings_read/write`, `bk_events_read`) now gate on
  `core.has_module_access(tenant_id, 'booking')`. **Independently confirmed
  fact, worth knowing for any future Booking work**: no migration has ever
  granted `authenticated` schema/table access to `booking` at all — the
  module is currently unreachable tenant-facing regardless of this PR (see
  `0013_authenticated_tenant_access.sql`'s own comment documenting "No
  grants to ... booking ..."). The new test file therefore grants itself
  test-only `usage on schema booking` / `select, insert on
  booking.services` to exercise the RLS logic — this is **not** identical
  to the `inventory`/`workforce` test-file-grant precedent, where a real
  product migration already granted schema access before the test ran (the
  Independent Reviewer flagged this nuance explicitly — non-blocking, but
  do not cite Booking as "same pattern as inventory/workforce" without this
  caveat in a future PR description).
- **Full pgTAP baseline**, confirmed identically on bare `origin/dev` HEAD
  (verified twice this mission, independently, at different points) and on
  every one of this mission's own branches: exactly 5 pre-existing,
  unrelated test failures — `0002_security_rls.sql` (3), `0006_api_has_permission.sql` (1),
  `0008_workforce_staff_recipes_rls.sql` (1), `0012_workforce_cafe_api_facade.sql` (2),
  `0023_inventory_permanent_delete.sql` (4). These are grant-count baseline
  drift from unrelated, earlier migrations (Purchases/staff-messages/media
  grants added after the assertions were written) — **not** introduced or
  worsened by this mission. Do not attempt to fix them as part of this
  mission unless the Founder explicitly asks; they are out of scope.

## 4. Known defects / open issues

- **`0023_inventory_permanent_delete.sql` tests 8-11 (pre-existing, out of
  mission scope):** `inventory.permanently_delete_item()`'s real live body
  on `dev` (last changed by `0085_inventory_item_media.sql`) **blocks**
  deletion when `inventory.stock_counts` history exists — even though
  `0085`'s own header comment claims to build on `0082`'s Founder-approved
  "cascade-delete real history, never refuse" decision. `0085` appears to
  have accidentally reverted `0082`'s fix when it dropped and recreated the
  function to add `media_path` support. **This session found this,
  confirmed it by reading `0085`'s real body directly from `origin/dev`,
  and deliberately did NOT fix it** — WP-S3's scope is module-access gating
  only, and silently changing delete semantics would have been an
  unauthorized scope expansion (the session's first attempt at fixing an
  unrelated review comment accidentally reintroduced cascade-delete logic;
  this was caught via the now-passing `0023` tests being a tell, and
  reverted — see `0095_inventory_module_access_gate.sql`'s own header
  comment for the full account). **If this is worth fixing, it needs a
  separate, explicitly-scoped Founder-approved task — not silently rolled
  into this mission.**
- No other known defects introduced by this mission.

## 5. Relevant existing documentation

- `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` — how this mission was
  run (autonomy tiers, DEV MERGE gate, RED-path override-free block on
  migrations — see §11 below). Still current, re-read at session start next
  time too.
- `docs/ai/current-task.md` — **not yet updated by this mission** (the
  mission is not complete — see §9/§10). The next session should update it
  only once the full mission (through WP-S6 + the final completion report)
  closes, per this mission's own §12/§15 instructions, not mid-mission.
- Each merged PR's own description (#448, #449, #450) and PR #451's
  description are the most detailed per-domain evidence record; this
  handoff summarizes but does not replace them.
- `supabase/migrations/0093`-`0096` and `supabase/tests/0040`-`0043` are
  the actual source of truth for exact behavior — read the code, don't
  trust this handoff's prose summary if anything seems inconsistent.

## 6. State believed relevant but not fully verified

- **WP-S5 (Workforce) scope has NOT been investigated yet this mission.**
  The original mission brief flags it as "the biggest blast radius" and
  names specific things to check first: `guard_shift_exchange_update()`,
  `api.workforce_staff_directory`, shift exchange trigger paths, recipes,
  attendance, employees, shift requests, staff messages, API views. TO
  VERIFY, not started: full policy inventory, which views are
  `security_invoker` vs. have their own logic, which SECURITY DEFINER
  functions exist in the `workforce` schema (there are several — permanent-
  delete functions for employees/recipes/staff-messages at minimum, per
  migration filenames `0056`/`0057`/`0091` — none audited yet for this
  mission).
- **WP-S6 (AI) has NOT been investigated yet this mission.** `core.module_code`
  includes `'ai'`; migration `0011_ai.sql` is scaffold-only per `AGENTS.md`
  ("Migrations `0009_workforce.sql`, `0010_booking.sql`, and `0011_ai.sql`
  are real schema migrations but scaffold-only"). Whether any AI proposal/
  approval RPC or view has since been built on top of it (the mission brief
  implies yes: "AI OFF means proposals cannot be created, tenant-facing
  proposal reads are unavailable, approve/apply through AI unavailable")
  has not been checked this session — TO VERIFY at the start of WP-S6, do
  not assume AI is still scaffold-only like Booking without checking.
- **PR #451's exact merge status** — TO VERIFY at the start of the next
  session (`gh pr view 451 --json state,mergedAt`), not assumed from this
  handoff's text.

## 7. Architecture / security constraints (binding)

Restated only where specific to this mission — see
`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` §8 and
`docs/security/security-requirements.md` for the general rules.

- Every gated RLS policy must **AND** `core.has_module_access(...)` with its
  existing `core.has_permission(...)` check — never replace, never OR. This
  was verified for every policy touched so far by at least one Independent
  Reviewer pass per PR.
- `core.has_module_access()` itself must never gain a
  `core.is_platform_staff()` bypass — this is an explicit, deliberate
  Founder decision (distinct from `core.has_permission()`'s existing
  bypass), re-confirmed structurally by a pgTAP assertion
  (`0040`'s `prosrc not ilike '%is_platform_staff%'` check).
- A SECURITY DEFINER function that bypasses RLS (e.g.
  `inventory.permanently_delete_item()`) needs its own explicit
  `core.has_module_access(...)` pre-check in the function body — RLS
  changes alone do not protect it. WP-S5 will very likely hit several more
  of these (permanent-delete functions, `guard_shift_exchange_update()`
  trigger).
- No migration in this mission may be destructive (no `DROP TABLE`, no data
  `DELETE` beyond what a pre-existing function already did). All four
  migrations so far are pure `DROP POLICY IF EXISTS` + `CREATE POLICY` /
  `CREATE OR REPLACE FUNCTION` — additive/replacement only.

## 8. Explicit prohibitions for the next session

Per the mission's own §6/§11/§12 (do not re-litigate):

- No `core.module_capabilities`, `core.has_capability()`, typed capability
  storage, HACCP capability, or Owner capability toggle — that is a
  separate future prerequisite for Cafe v2.2 WP1, not this mission.
- No `api.set_tenant_module_capability()` or any new Owner module-management
  RPC. `core.tenant_modules` still has no broad authenticated write grant —
  treat that as the safe current default, do not open it.
- No changes to `core.has_permission()`, `core.billing.manage`, or any
  existing non-module-access permission.
- No Event Bus / Notifications / LINE / WP1 Operations work — completely
  out of scope for this mission regardless of how related it may seem.
- No big-bang migration combining multiple domains — each staged domain
  (S1-S6) stays its own PR, per the approved staged order.
- No unrelated refactoring, no UI changes beyond the minimum a security
  behavior change strictly requires (none needed so far — no `apps/web`
  file has been touched by this mission).

## 9. New workstream — full objective (verbatim scope reminder)

Continue the **Module Access Security Remediation** mission exactly as
scoped in the Founder/ChatGPT-approved mission brief this session began
with (the user's original message in this conversation — read it in full
if starting fresh without that context available; it is long and detailed,
covering all of WP-S1 through WP-S6, the RLS/permission/module three-layer
model, the test matrix, and the final completion-report format). In short,
remaining work:

- **WP-S5 — Workforce** (biggest blast radius; full policy inventory first,
  then gate every tenant-facing Workforce RLS path, the shift-exchange
  trigger path, recipes, attendance, employees, shift requests, staff
  messages, and `api.workforce_staff_directory` specifically; full
  regression: Weekly Schedule, Attendance, Corrections, Exchange, Staff,
  Recipes, Messages, Manager/Staff reads/writes).
- **WP-S6 — AI** (gate tenant-facing AI proposal/log operations; AI OFF
  blocks proposal create/read/approve/apply; data preserved; do not change
  underlying non-AI domains).
- **Final `MODULE_ACCESS_SECURITY_REMEDIATION_COMPLETION_REPORT`** (per the
  mission's §12 format) once WP-S6 closes, with the IMPLEMENTED/TESTED/
  REVIEWED/MERGED/REMOTE DB APPLIED/LIVE VERIFIED matrix for all six rows
  (Core helper, Purchases, Inventory, Booking, Workforce, AI). **Then
  STOP** — the mission's own §15 final rule. Do not automatically start
  Cafe v2.2 WP1 Foundation Prerequisite afterward.

## 10. Required deliverable

Same PR-per-domain pattern already used for S1-S4:
`docs/ai/current-task.md` is updated only at the very end (full mission
close), not per-PR. Each domain PR needs: migration, pgTAP test file
(existing fixtures audited/fixed as needed), CI green, Independent Reviewer
PASS, then a request to the Founder for the actual merge (RED path — see
§11). The final deliverable beyond the PRs themselves is the completion
report named in §9.

## 11. Mission-specific approval boundaries / deviations

- **Every migration-touching PR in this mission is a RED path** per
  `.claude/settings.json`/`scripts/ai-dev-merge.sh`: the script
  structurally refuses to merge any PR touching `supabase/migrations/**`,
  with no override (confirmed directly, `bash scripts/ai-dev-merge.sh 448`
  → `BLOCK: PR #448 touches RED-operation path(s), requires Founder
  approval`, exit 1). This means **every one of WP-S1 through WP-S6's PRs
  needs the Founder to merge it directly on GitHub** — the Lead Agent
  cannot merge any of them, even with explicit Founder verbal/chat
  approval, because raw `gh pr merge` is also hard-denied in
  `.claude/settings.json` with no override. This is not a one-time
  exception to ask about — expect to hit it on every single remaining PR
  in this mission (WP-S5, WP-S6) and ask for the same narrow
  merge-approval-plus-Founder-executes-it pattern each time, exactly as
  happened for #448-#451.
- No remote/Cloud Supabase DB write has happened or is authorized — every
  verification this mission ran was `pnpm exec supabase db reset` +
  `pnpm exec supabase test db` against the **local** Supabase stack only.
  WP-S5/S6 should follow the same pattern; do not run `supabase db push`
  or touch the linked Cloud dev project without a separate, explicit
  Founder approval request (per `CLAUDE.md`'s highest-risk constraints).
- Independent Reviewer was run via a `general-purpose` subagent this
  session, not a named `oruwa-reviewer` agent — that agent type was not
  available in this session's agent list (`Agent type 'oruwa-reviewer' not
  found`). If it's available in a future session, prefer it; otherwise the
  `general-purpose` subagent with an explicit, detailed review-lens prompt
  (see any of this mission's own Agent tool calls for the exact prompt
  shape used) worked well and found real issues (the `0095` comment
  misattribution that led to catching the near-regression in §4).

## 12. What must NOT be accidentally modified

- `core.has_permission()` (0006) — untouched, must stay untouched.
- Any pre-0093 migration file — none were edited; only new migrations
  (0093-0096) and existing pgTAP **test** fixtures were touched (never
  product migrations retroactively).
- `inventory.permanently_delete_item()`'s actual delete semantics
  (block-on-history) — see §4, this is a known pre-existing quirk, not to
  be "fixed" as a side effect of any future gating work in this mission.
- The `feature/module-access-security-s4-booking` branch (PR #451) — do
  not delete until merged.

---

No secrets, passwords, tokens, or service_role values are recorded anywhere
in this handoff.
