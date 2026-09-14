# Session Handoff — 2026-09-14

## TL;DR

**Cafe v2.2 WP3 "Owner Weekly Review" is CLOSED.** PR #518 merged into
`dev` (squash `ef04b69`), migration `0119` applied to Cloud DEV
(`pehcoenozjtsjdvjietj`), live Preview Browser QA passed end-to-end
(including a real bug found and fixed mid-session), independent review
PASS (zero P0/P1/P2). Two small follow-up PRs also landed this session:
**#520** (a real mobile-truncation bug caught by live QA, merged
autonomously) and **#521** (docs pointer, merged autonomously). **One loose
end remains: PR #519** (comment-only clarification of the `0119` rollback
section's row count — the migration's actual behavior was always correct,
only a code comment's wording was ambiguous) is still **open, awaiting
Founder merge** because it touches `supabase/migrations/**` (RED path).
**Next step is not yet chosen** — Founder picks WP4, a bounded
quality-sweep follow-up, or something else. Do not start WP4 or any further
WP3 work without a fresh prompt.

## Repo state

| | |
|---|---|
| Branch | `dev` |
| HEAD | `f1653f5` = `origin/dev` (docs pointer commit, on top of PR #518/#520/#521's squashes) |
| Working tree | clean |
| `main` | untouched |
| Production | untouched, still separately gated |
| Cloud DEV migrations | `0119` applied and ledger-verified (`supabase migration list --linked`) |
| Open PR | **#519** — comment-only, RED path (touches `supabase/migrations/0119_weekly_review_summary.sql`), CI green, awaiting Founder merge via GitHub. Not urgent (cosmetic), but check its state before assuming the migration file's comments read exactly as described below. |

## What happened this session

Mission: `ORUWA CAFE v2.2 — MISSION 5 — WP3 OWNER WEEKLY REVIEW`, run
autonomously per the ORUWA Operating Model, with two genuine Founder Gates
(both resolved same-session) plus one mid-flight documentation correction
requested by the Founder.

1. **Recovery phase** (background agent, read-only): mapped the actual
   module registry/entitlement model (`core.module_code`,
   `core.tenant_modules`, `core.has_module_access`), confirmed
   `packages/core/src/permissions.ts` is stale (missing `operations.*`/
   `issues.*` keys — DB `core.permissions` seed rows are the real source of
   truth), confirmed no distinct "Owner" runtime role exists (permission-key
   gating, not role-name gating, is the correct pattern), located the
   reusable Monday-Sunday timezone-aware week model
   (`apps/web/src/lib/workforce/period.ts`), catalogued Operations/Issues/
   Inventory-Purchasing schema and vocabulary (canonical term is
   **"shortage"**, not "deficit"; purchase status is `'bought'|'pending'`,
   not "open/completed"), and identified `api.purchases_needed` as the
   precedent for a multi-table `security_invoker` view/RPC.

2. **Design decision** (Lead Agent, autonomous): no new `module_code`, no
   `core.tenant_modules` row — WP3 is a permission-gated composition over
   already-enabled modules (`core.weekly_review.view`, granted only to
   `tenant_owner`/`tenant_admin`/`manager`). One `SECURITY INVOKER` RPC
   (`api.weekly_review_summary`) over a set of small views, because several
   sections need to degrade to an explicit `null` (module OFF) vs `0`
   (module ON, genuinely empty) in the same response — a plain view
   composition can't branch that way.

3. **Implementation** (delegated to `oruwa-engineer` on feature branch
   `feature/cafe-v2-2-wp3-weekly-review` — worktree isolation was attempted
   first but refused due to a stale `.claude/worktrees/*` `core.worktree`
   redirect in this repo, so the branch was built directly against the main
   checkout instead):
   - `supabase/migrations/0119_weekly_review_summary.sql` — permission
     `core.weekly_review.view` + role grants (owner/admin/manager only) +
     `api.weekly_review_summary(p_tenant_id, p_location_id, p_week_start,
     p_week_end, p_week_starts_at, p_week_ends_at_exclusive) returns jsonb`,
     `security invoker`. Week/timezone boundaries are resolved in
     TypeScript and passed in already-resolved — the RPC does not
     re-implement timezone conversion in SQL. Reuses
     `api.inventory_item_status`/`api.purchases_needed` verbatim for the
     Purchasing section rather than re-deriving "shortage"/"pending".
   - `supabase/tests/0060_weekly_review.sql` — 26 pgTAP assertions
     (permission gating, tenant/location isolation, week-boundary edge
     case, module-OFF → real `null` not `0`, quiet week, problem week).
     100% pass; full suite re-verified against a clean local baseline —
     same pre-existing 7-file/22-subtest failure set (`0002`, `0006`,
     `0008`, `0012`, `0023`, `0047`, `0058`), zero new.
   - Manager UI: `apps/web/src/app/(protected)/_ui/weekly-review-manager-popup.tsx`
     (Dialog shell) + `.../weekly-review/weekly-review-manager-body.tsx`
     (Team/Operations/Issues/Purchasing sections, Prev/Next nav, quiet-week
     empty state, "Still open" rollup, drill-down handlers into the
     existing Operations/Issues/Purchases/Inventory/Shift-requests/
     Shift-exchanges popups). New dashboard entry in
     `manager-dashboard-client.tsx`, gated by the new permission via
     `apps/web/src/lib/weekly-review/access.ts`. JA term chosen:
     `週次レビュー` (not `今週のまとめ`/`週間レビュー`) — reasoning recorded
     in `weekly-review-i18n.ts`'s header comment (the feature is
     multi-week-navigable, not "this week only").

4. **Lead Agent's own review caught a real bug before independent review**:
   the quiet-week check in `weekly-review-manager-body.tsx` initially only
   tested week-scoped counts (`criticalMissedCount`, `newIssuesCount`,
   etc.) and omitted the "as of now" counts (`openExceptionsCount`,
   `shortageItemsCount`) — meaning a week with zero new events but real,
   old, still-open Operations exceptions or inventory shortages could have
   shown a false "all clear" banner, burying the "Still open" section
   behind it. Fixed immediately (both counts added to the quiet-week
   condition), before independent review.

5. **Independent fresh-context review** (`general-purpose` agent):
   **PASS**, zero P0/P1/P2. Explicitly re-verified the quiet-week fix above
   was present and complete, and found no other gap in that logic. Two P3
   nitpicks: a few unused i18n dictionary keys reserved for future granular
   error messaging; a degenerate "every module OFF" tenant would render the
   quiet-week state rather than a distinct message (both deferred,
   non-blocking, don't apply to the real reference tenant).

6. **PR #518 → CI green → Founder Gate #1 (merge)**: `scripts/ai-dev-
   merge.sh` correctly refused (RED path — touches
   `supabase/migrations/**`). Founder squash-merged directly on GitHub
   (`ef04b69`).

7. **Founder's approval message added a condition**: before running
   `db push`, verify/fix an apparent inconsistency between the gate
   report's prose ("removes two rows") and the migration's actual rollback
   comment. On inspection, the migration's rollback DELETE statements were
   always correct and complete (a single `DELETE ... WHERE permission_key =
   ...` with no role filter already removes all 3 seeded role grants, plus
   a separate DELETE for the 1 permission-catalog row) — the ambiguity was
   in the Lead Agent's own gate-report paraphrase, not the SQL. Clarified
   the comment to state the row counts explicitly. **This fix missed the
   PR #518 merge window** (the Founder merged before the fix commit
   propagated) — it shipped instead as a separate follow-up, **PR #519**,
   which is **still open** (RED path, needs Founder merge; low priority,
   comment-only, no behavior change).

8. **Founder Gate #2 (Cloud DEV migration apply)**: completed the full
   read-only preflight (linked project confirmed `pehcoenozjtsjdvjietj` via
   `SUPABASE_URL`; `supabase migration list --linked` showed ledger synced
   through `0118`, pending = **exactly** `0119`). `supabase db push
   --linked` is a **hard `deny`** in `.claude/settings.json` — the Lead
   Agent session cannot run it under any instruction, including an explicit
   Founder approval message referencing it by name; the Founder ran it
   themselves. Post-apply `migration list` confirmed the ledger applied
   both sides.

9. **Live Preview Browser QA** (`preview.oruwa.jp`, real
   `manager@oruwa-cafe.test` + Staff-A sign-ins via `chrome-devtools` MCP,
   isolated browser contexts per role):
   - **Cross-module trace proven exact** for all three drill-down-capable
     domains: Operations (28 critical-missed in the review matched the real
     "対応が必要 (28)" tab exactly), Issues & Handover (3 new issues + 1 new
     handover matched 4 real history records dated inside the reviewed
     week exactly), Purchasing (1 pending purchase matched the real
     Purchases popup's single 未購入 item exactly).
   - **Week-boundary correctness proven live**: switching between Sep 7–13
     (28 critical-missed) and Aug 31–Sep 6 (3 critical-missed) showed
     genuinely different week-scoped counts, while "any date"/"as of now"
     counts (23/28/4/1) correctly stayed constant across weeks.
   - **Upper bound proven live**: repeated "Next week" clicks correctly
     disable exactly at the current week, with an "In progress — not yet
     complete" badge; never advances into a genuine future week.
   - **Quiet-week fix proven against real data**: 5 weeks back
     (Jul 27–Aug 2) had zero week-scoped events but real nonzero "still
     open" backlog (28/23/4/1) — the quiet-week banner correctly did NOT
     appear. A genuinely all-zero quiet week could not be forced live
     because the reference tenant carries months of accumulated QA residue
     (28 open Operations exceptions, 23 pending shift requests) —
     documented as a QA-data limitation, not a product defect.
   - **A real bug was found and fixed mid-QA**: at 375×667, `MetricRow`
     wrapped its `ListRow` title in `MetadataText` (an `inline-flex` span);
     `text-overflow: ellipsis` does not apply through an `inline-flex`
     child, so long labels hard-cut mid-word with no "…" instead of
     truncating cleanly. Fixed (`title` passed as plain text instead),
     shipped as **PR #520**, merged autonomously (no RED path, CI green),
     re-verified clean live after Preview redeployed.
   - **JA/EN**: full popup chrome verified bilingual; `Sep 7–13` (en dash)
     vs `9月7日〜9月13日` range-formatting convention followed correctly.
   - **Responsive**: 1440×900 and 768×1024 clean; 375×667 clean after the
     PR #520 fix.
   - **Accessibility**: `Escape` closes the dialog; Tab-cycling through all
     16 focusable elements inside the dialog wraps back to the first
     without ever leaking focus to the page behind it — focus trap
     confirmed live.
   - **Negative permission check**: signed in as Staff (田中 美咲, isolated
     browser context) — the Weekly Review entry point is entirely absent
     from the Staff dashboard, confirming the permission gate end-to-end.
   - **Tenant/location isolation**: proved via the independently-reviewed
     pgTAP suite (a tenant with an explicit module-OFF row, not just
     `is_enabled=false`), not live (single-tenant, single-location
     reference tenant, same evidence-bar precedent as WP1/WP2).

10. **Canonical docs updated**: `docs/ai/current-task.md` §5 (new newest
    pointer, full session record), `docs/project/master-state.md` (top
    summary line, WP3 status row, §14-adjacent narrative line) — this
    file. All committed via PR #521, merged autonomously.

## Deferred / explicitly NOT done this session (real, documented, not forgotten)

- **AI-generated summary**: explicit mission non-goal, not built.
- **Financial/payroll/performance-scoring fields**: explicit mission
  non-goal, not built.
- **Week-over-week percentage comparison**: only plain "any date" vs "this
  week" counts exist; no delta math (the mission allowed a trivial
  "N more than last week" only if cheap — judged not worth the added
  complexity/noise, deferred).
- **A durable weekly-snapshot table**: this is a live, recomputed-every-call
  read model, per the mission's strong preference against new analytics
  storage.
- **A date-range picker**: Prev/Next only, as specified.
- **Multi-location aggregation**: single resolved location only (LOC-1
  fail-closed pattern) — `oruwa-cafe` is single-location, so this wasn't
  exercised against a real multi-location tenant.
- **PR #519** (rollback-comment wording clarification): open, RED path,
  awaiting Founder merge. Purely cosmetic — the migration's actual behavior
  was always correct.
- The already-known standing debt from prior sessions (badge "9 vs 4+4" in
  `AttentionPanel`, raw `part_time`, Purchasing/Inventory copy
  inconsistencies, the shared focus-restore-after-`router.refresh()` gap)
  — untouched by this mission, still open candidates for a future bounded
  quality sweep.

## Hard rules still in force

- No `main`, no production deploy, no Supabase Cloud writes (`db push`/
  `db pull`/`link`/`migration repair`) — all hard-`deny`'d for the agent in
  `.claude/settings.json`, not just policy; require the Founder to run them
  personally even with an explicit approval message naming the exact
  command.
- Founder-facing language = Russian.
- QA credentials: `oruwa-cafe` Manager/Staff-A accounts in repo-root `.env`
  are Founder-classified PUBLIC DEMO — usable for Preview Browser QA,
  transcript exposure accepted, no rotation; does not extend to any real
  secret. `DATABASE_URL` is NOT populated in this session's `.env` (direct
  psql/service-role verification is not available — functional live-QA
  proof is the accepted substitute, same as WP2's precedent).
- Worktree isolation (`Agent` tool's `isolation: "worktree"`) is currently
  broken in this repo — a stale `core.worktree` redirect under
  `.claude/worktrees/agent-*` causes it to refuse. A future session wanting
  worktree isolation should investigate/clean that up first, or just work
  directly on a feature branch in the main checkout (what this session did
  instead).
- Do not start WP4, further WP3 work, or any destructive demo-data cleanup
  without a fresh explicit prompt.

## Reading order for a fresh session

1. `AGENTS.md` → `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` →
   `docs/ai/current-task.md` (its newest pointer, 2026-09-14).
2. `docs/project/master-state.md` §7's WP table + top summary line for the
   updated WP3 row.
3. This file.
4. **First action**: check PR #519's state
   (`gh pr view 519`) — if still open, it's a zero-risk comment-only merge
   whenever convenient; if merged, no action needed.
5. `supabase/migrations/0119_weekly_review_summary.sql` for the full
   Weekly Review read-model contract if extending it.
6. `apps/web/src/lib/weekly-review/**` and
   `apps/web/src/app/(protected)/weekly-review/**` for the frontend/
   service-layer pattern if building the next UI slice on top.
