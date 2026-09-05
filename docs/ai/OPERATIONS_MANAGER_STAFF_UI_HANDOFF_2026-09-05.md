# Operations Manager/Staff UI — Handoff (2026-09-05)

Status: **CLOSED. Cafe v2.2 WP1 Operations now has a complete, live-QA'd
Manager+Staff UI on top of the WP1-A backend (0099–0111).** This was the
canonical next implementation step named in `docs/project/master-state.md`
§14 step 5; it is now done. Read this file first if anything about the
Operations UI, `/manager?popup=operations`, `/staff?popup=operations`, or
`apps/web/src/app/(protected)/operations/**` comes up.

## What shipped (7 PRs, all merged to `dev`, no `main`/production touch)

1. **PR #500** — Manager: Templates & Items config (create/edit/retire
   templates, add/edit/retire/replace checklist items: boolean/numeric/text,
   critical/required, numeric min/max/unit).
2. **PR #502** — Manager: Scheduling (apply a template to a location with
   daily/weekday recurrence + due time/window; revise/deactivate/cancel).
   Needed one additive migration, `0115_operations_schedules_read_view.sql`
   (`api.operations_schedules` read view — the write RPCs existed since
   August but no read view had ever been added).
3. **PR #505** — Staff: task execution (today's tasks at their own location,
   per-item structured responses, report-a-problem, complete task; completed
   tasks become read-only).
4. **PR #506** — Manager: "Today" read-only task overview + "Attention" feed
   (open exceptions — threshold violations and Staff-reported problems —
   with a resolve action).
5. **PR #507** — Polish fixes found in live QA: Staff entry point had been
   missing entirely; a schedule/items *read failure* was silently rendered
   as "no schedule yet" instead of an error (this is what hid the
   undeployed-migration problem below during QA); duplicate-schedule
   creation now asks for confirmation instead of silently stacking; a
   Staff-facing "schedule not found" error got friendlier copy.
6. **PR #508** — Perf: `/operations` (now the popup data-fetch path) chained
   4 sequential DB round trips before its own parallel batch of 5;
   `listTenantModules`/`listTenantLocations` now run in parallel.
7. **PR #509** — Converted Operations from a standalone `/operations` page
   into a **popup opened from the Manager/Staff dashboard**, matching every
   other Cafe module (Recipes/Inventory/Purchases/Mail) — Founder-requested
   consistency fix. `/operations` is now a thin fallback redirect
   (`/manager?popup=operations` / `/staff?popup=operations`), mirroring
   `/purchases/page.tsx`'s exact shape. `apps/web/src/lib/operations/*`
   (the whole read/write service layer) was untouched by this — only WHERE
   the data is fetched and HOW it's presented changed.

Also in this session, **unrelated but adjacent process changes**:

- `scripts/ai-hooks/guard-git-push.mjs`: push to `dev` (not just
  `feature/*`) is now auto-allowed for non-force pushes — Founder granted
  standing authority (`main` remains hard-denied, unchanged, both by this
  hook and by `permissions.deny` in `.claude/settings.json`).
- `scripts/ai-dev-merge.sh`: migration-touching PRs are no longer
  auto-blocked outright — it now scans the migration's added SQL for a
  destructive-pattern list (DROP TABLE/COLUMN/FUNCTION/VIEW, TRUNCATE,
  DELETE FROM, disabling/un-forcing RLS, DROP POLICY, widening anon/public
  grants) and only blocks those, auto-merging routine additive migrations
  like any other dev-bound PR. **Found and fixed a real bug in this same
  session**: the first version's scan used `gh pr diff <PR> -- <pathspec>`,
  which is not a valid `gh` invocation — it errored, and the destructive
  scan silently saw an empty diff and always passed. Fixed by pulling each
  migration file's patch via the GitHub API's own `.patch` field instead;
  verified against a throwaway PR containing a real `DROP TABLE` (correctly
  blocked) before trusting it for anything.
- Cloud DEV state changed by the Founder (not by an agent, per standing
  policy): `operations` module enabled for the `oruwa-cafe` tenant (was
  registered but enabled for no tenant since 2026-09-03); migration `0115`
  applied via Supabase Studio SQL Editor (the git-merge of a migration file
  does **not** apply it to any real database — this tripped up live QA once
  and is worth remembering for the next migration-adding session).

## Live QA evidence (2026-09-05, on `preview.oruwa.jp`, both real logins)

Full loop tested end-to-end, both as Manager (`manager@oruwa-cafe.test`)
and Staff (a real employee account): created a template with a boolean item
and a numeric item (0–5°C range, critical), created a daily 06:00 schedule,
completed the task as Staff with an out-of-range numeric value (12°C) —
confirmed a `threshold`/`action_required` exception opened automatically,
completed the task (form correctly went read-only), then resolved the
exception as Manager with a note — confirmed it dropped out of Attention.
JA/EN toggle confirmed on both roles. Popup conversion (PR #509) re-verified
live after merge on both dashboards.

**Known trivial residue from testing** (not a defect, not cleaned up,
harmless): the `oruwa-cafe` reference tenant now has one retired duplicate
"Opening checklist" template-schedule pair and 2-3 completed/overdue task
instances from the QA session dated 2026-09-05. Fine to leave, or a future
session can delete them via the UI if it matters for a demo.

## What is explicitly still NOT built (all deliberately out of scope so far)

- **Cafe HACCP presets** — content/config on top of the generic Operations
  module (opening/closing hygiene checks, cleaning checks, temperature
  checks, corrective-action record, recheck — per
  `docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` §7).
  This is pure **product content** (create the actual templates/items/
  schedules through the UI just built, or via a seed script), **not** new
  code/schema — the D3 scope decision (HACCP is presets on the generic
  module, never module code) still holds. **This is the canonical next
  step**, see `docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md`
  §7 for the exact preset list and D4 for severity derivation guidance.
- Photo/evidence capture (D2 — never in WP1 at all).
- Unifying the Operations "Attention" feed with the existing tenant-wide
  Workforce `attention-panel.tsx` — flagged by the slice-4 implementation as
  a real future idea, deliberately not built (different structural
  assumptions, needs actual design work).
- A Staff-facing history/past-days view (today only, by design so far).
- WP1 bounded acceptance gate, then WP2 Issues & Handover → WP3 Owner
  Weekly Review → WP4 Purchasing v2 → WP5 Recipe Intelligence Lite → full
  Cafe v2.2 Integrated Acceptance (`docs/project/master-state.md` §14,
  unchanged by this session).

## How this session worked (context for a fresh session's expectations)

Each UI slice (and each polish/perf/refactor pass) was scoped by the Lead
session with exact RPC/view contracts read directly from the migration SQL,
then delegated to an isolated `oruwa-engineer` background agent with a
detailed brief (architecture to mirror, exact contracts, explicit in/out of
scope, DoD). The Lead session then independently re-verified every result
(re-read the diff, re-ran typecheck/lint/test/build itself rather than
trusting the agent's own report, and did the actual live browser QA) before
opening and merging each PR. This pattern is available and worked well; a
new session can either continue the same way or work directly — the
existing 4 slices' code is the best reference for established conventions
(`apps/web/src/lib/operations/*` service-layer shape, `operations-i18n.ts`
bilingual dictionary, `error-copy.ts` RPC-error mapping, the `_ui/*-popup.tsx`
pattern).

## Immediate next-session starting point

Founder-stated next step: **Cafe HACCP presets**. Suggested approach for a
fresh session: read the scope doc §7 boundary list first, decide with the
Founder whether presets are entered through the just-built Manager UI by a
human (fastest, zero new code) or via a one-time seed script for the
reference tenant (faster to replicate across future tenants, more
"product-shaped" but is still just data, no schema/RPC change) before
writing anything.
