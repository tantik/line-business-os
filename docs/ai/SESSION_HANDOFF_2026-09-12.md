# Session Handoff — 2026-09-12

## TL;DR

**Cafe v2.2 WP2 "Issues & Handover" is CLOSED.** PR #517 merged into `dev`
(squash `390b507`), migrations `0117`/`0118` applied to Cloud DEV
(`pehcoenozjtsjdvjietj`), `issues` module enabled for the `oruwa-cafe`
reference tenant, live Preview Browser QA passed end-to-end, independent
review PASS (zero P0/P1/P2). Docs pointer commit `d7c435d` on top. Nothing
is in flight. **Next step is not yet chosen** — Founder picks WP3, a
bounded quality-sweep follow-up, or something else. Do not start WP3 or any
further WP2 work without a fresh prompt.

## Repo state

| | |
|---|---|
| Branch | `dev` |
| HEAD | `d7c435d` = `origin/dev` (docs pointer commit, on top of PR #517's squash `390b507`) |
| Working tree | clean |
| `main` | untouched |
| Production | untouched, still separately gated |
| Cloud DEV migrations | `0117`, `0118` applied and ledger-verified (`supabase migration list --linked`) |
| `issues` module | registered `beta` in `core.module_registry`; **enabled only for `oruwa-cafe`** (Founder-run `core.tenant_modules` write — no other tenant) |

## What happened this session

Mission: `ORUWA CAFE v2.2 — MISSION 4 — WP2 ISSUES & HANDOVER`, run
autonomously per the ORUWA Operating Model, with exactly two genuine
Founder Gates (both narrow, both resolved same-session):

1. **Recon phase** (background agent, read-only): mapped existing Mail
   (`workforce.staff_messages`), Operations exceptions
   (`operations.task_exceptions` + `api.operations_report_problem`/
   `operations_resolve_exception`), the two disconnected "Attention"
   surfaces (`AttentionPanel` client-side aggregation vs. Operations'
   own `api.operations_open_exceptions`-backed popup — including the
   already-documented "9 vs 4+4" badge bug at `attention-panel.tsx`
   lines ~265/294), `core.module_registry`'s two-step enum-then-row
   registration pattern, and cataloged the full `@line-os/ui` v1
   component surface plus its cleanest recent reference screen
   (`operations/attention-section.tsx`).

2. **Design decision** (Lead Agent, autonomous per mission's "Better
   Solution Rule"): did **not** extend `operations.task_exceptions`
   (Handover is not an "exception" semantically, and every existing
   exception is anchored to a checklist instance/schedule — a
   free-standing note doesn't fit) and did **not** reuse `staff_messages`
   (pure 1:1 DM, no severity/status lifecycle). Built a new, generic,
   vertical-agnostic capability instead: schema `issues`, module code
   `issues`, single flat table `issues.issues` (no polymorphic
   mega-table, no event-sourcing), explicit nullable
   `operations_exception_id` cross-link column reserved for a future
   integration slice (nothing writes it in this MVP).

3. **Slice A — DB foundation** (delegated to `oruwa-engineer`, its own
   feature branch `feature/wp2-issues-handover-foundation`):
   - `supabase/migrations/0117_core_module_code_add_issues.sql` — adds
     the `'issues'` `core.module_code` enum value (own migration,
     mirrors `0099`'s two-step pattern).
   - `supabase/migrations/0118_issues_foundation.sql` — `issues.issues`
     table (`kind` issue/handover, `category`, `severity`, `status`
     open→acknowledged→resolved, `business_date`, `reported_by`/
     `reported_by_role`, `acknowledged_*`/`resolved_*`/`resolution_note`,
     `source`, `operations_exception_id`); guard trigger
     `issues.guard_issue_update()` (only status/acknowledge/resolve
     columns mutable post-insert); 2 permission keys (`issues.report`
     Staff+Manager, `issues.manage` Manager-only); RLS (SELECT by either
     permission at location; INSERT requires `issues.report` +
     server-side actor-role coherence — a caller holding `issues.manage`
     MUST report as `'manager'`, one who doesn't MUST report as
     `'staff'`, blocking spoofing both directions; UPDATE requires
     `issues.manage`; **no DELETE policy at all**); 3 `SECURITY INVOKER`
     RPCs (`api.issues_create`/`issues_acknowledge`/`issues_resolve`,
     each re-validating module-access/permission/input server-side); 2
     `security_invoker` views (`api.issues_open` = open+acknowledged,
     `api.issues` = full history); module registration folded into the
     same migration (registry table already existed, unlike Operations'
     history) — **no `core.tenant_modules` row inserted**, module enabled
     for no tenant by the migration itself.
   - `supabase/tests/0059_issues_foundation.sql` — 41 pgTAP assertions
     (module-OFF gating, cross-tenant isolation, actor-role-spoof
     resistance both directions, guard-trigger immutability per column,
     status-transition coherence, view visibility). Verified against a
     freshly re-run baseline (not trusted from a prior session): 7
     files / 22 pre-existing failures unchanged, zero new.

4. **Slice B — Manager UI** (same branch, `oruwa-engineer`): own
   dashboard entry chip with its own open-count badge
   (`kind=issue && severity=important && status=open`) —
   **deliberately not folded into `AttentionPanel`'s combined total**,
   the explicit anti-pattern named in the mission brief. Open/History
   view, Acknowledge/Resolve (resolve auto-stamps acknowledge if
   skipped), and a Manager report form (kind/category/severity/note) —
   all pure `@line-os/ui`/Tailwind. `attention-panel.tsx` untouched
   (confirmed by diff and, later, live QA: the "9" total never moved).

5. **Slice C — Staff UI** (same branch, `oruwa-engineer`): mobile-first
   quick-report (severity defaults to `'normal'`, a single "mark as
   important" checkbox rather than the Manager form's upfront
   `SegmentedControl` — fewer taps for the common case, same underlying
   value set) and a read-only relevant-issues view at the Staff's own
   location; no acknowledge/resolve controls (RLS blocks it — Manager-
   only in this MVP, an explicit judgement call carried from Slice A).

6. **Independent fresh-context review** (general-purpose agent playing
   `oruwa-reviewer`'s role per `.claude/agents/oruwa-reviewer.md` — that
   named agent type isn't in this environment's available list, so the
   rubric/persona was loaded manually into a `general-purpose` agent):
   **PASS**, zero P0/P1/P2. One P3/D-class note: the shared
   `HelpIconButton` still routes through legacy `theme.ts`, inherited
   from the identical pattern `operations-manager-popup.tsx` already
   uses — pre-existing, not introduced by this branch.

7. **PR #517 → CI green → Founder Gate #1 (merge)**: `scripts/ai-dev-
   merge.sh` correctly refused (RED path — touches
   `supabase/migrations/**`; its destructive-SQL scanner also flagged
   the idempotent `DROP POLICY IF EXISTS` lines and the rollback-comment
   block as false positives, exactly as documented behaviour). Founder
   squash-merged directly on GitHub (`390b507`).

8. **Founder Gate #2 (Cloud DEV migration apply)**: completed the full
   read-only preflight the Founder's approval message required (local
   `dev` fast-forwarded to `390b507`; `SUPABASE_URL` confirmed pinned to
   `pehcoenozjtsjdvjietj` via the existing `publishable-key-smoke` tool,
   never printing the key; `supabase migration list --linked` showed
   pending = **exactly** `0117`+`0118`, nothing else). `supabase db push
   --linked` is a **hard `deny`** in `.claude/settings.json` (not an
   `ask`) — the Lead Agent session cannot run it under any instruction,
   including an explicit Founder approval message; the Founder ran it
   themselves. Post-apply `migration list` confirmed the ledger applied
   both sides. A read-back verification via `supabase-js` +
   `SUPABASE_SECRET_KEY` hit an unrelated `403`/schema-exposure quirk,
   reproduced identically against the untouched, already-shipped
   `api.operations_open_exceptions` view — not a WP2 regression, and
   live Browser QA below independently proved every object works.

9. **Module enablement**: the Founder enabled `issues` for `oruwa-cafe`
   directly in Cloud DEV (a `core.tenant_modules` write — no `api.*`
   self-service RPC exists for this by design, and the session had no
   `DATABASE_URL` to do it itself).

10. **Live Preview Browser QA** (`preview.oruwa.jp`, real
    `manager@oruwa-cafe.test` + Staff-A sign-ins via `chrome-devtools`
    MCP, isolated browser contexts per role):
    - **Scenario A (Issue)**: Staff created a critical-equipment issue
      (mobile 375×667) → reload persisted → Manager saw it immediately
      (desktop 1440×900, correct note/severity/reporter/business-date)
      → resolved with a note → reload persisted → badge recalculated to
      empty correctly on both dashboards.
    - **Scenario B (Handover)**: Manager created a handover note → Staff
      saw it immediately (reporter "Manager", `Handover` tag, no
      management controls — RLS-correct) → persisted across reload.
    - **Acknowledge path** tested standalone: item stayed in the open
      feed with a `確認済み` badge, `確認する` disappeared, `解決する`
      remained; resolving afterward did not double-stamp
      `acknowledged_at`.
    - A **false-positive** was caught and corrected mid-session: an
      immediate snapshot right after a create/resolve submit looked like
      "the list didn't update" — this is the same async
      `router.refresh()` pattern already used by Operations/Mail
      (`onChange={() => router.refresh()}`), confirmed via `wait_for`
      that the refreshed list arrives correctly without a manual reload.
      Documented so a future session doesn't misdiagnose it as a defect.
    - **Tenant isolation**: proved via the independently-reviewed pgTAP
      suite (no second tenant credential available live) — acceptable
      per the mission's own "automated security tests" evidence bar.
    - **Location isolation**: `oruwa-cafe` is single-location; RLS
      location-scoping verified in code + review, not live
      multi-location.
    - **JA/EN**: full UI chrome verified bilingual live; user-authored
      note content correctly left unmachine-translated in both locales.
    - **Responsive**: Manager 1440×900 and 768×1024 clean; Staff 375×667
      and 320×667 clean, full-width one-tap primary CTA. (One tooling
      artifact discovered and resolved: the `chrome-devtools` `emulate`
      tool's `deviceScaleFactor=2` silently misaligned click coordinates
      at 768×1024, making clicks land on the dialog backdrop —
      switching to `deviceScaleFactor=1` fixed it; not a product bug,
      confirmed by re-testing the same interaction cleanly.)
    - **Accessibility**: `Escape` correctly closes every dialog. Focus
      does **not** return to the trigger button afterward (lands on
      `<body>`) — reproduced **identically** on the already-shipped,
      untouched Operations Staff popup, confirming this is the
      pre-existing "focus-restore gap after a mutation-triggered
      `router.refresh()`" already named as deferred debt in the
      2026-09-11 handoff, not a WP2 regression. Not fixed here (mission
      §43 on-touch policy — WP2 didn't introduce it).
    - **QA residue**: every test record (suffixed `(WP2 QA test...)`)
      was resolved through the normal workflow (Acknowledge/Resolve),
      never deleted — confirmed moved to History via reload.

11. **Canonical docs updated**: `docs/ai/current-task.md` §5 (new newest
    pointer, this session's full record), `docs/project/master-state.md`
    (top summary line, WP2 status row, §14 P2 debt-register line) —
    committed and pushed (`d7c435d`).

## Deferred / explicitly NOT done this session (real, documented, not forgotten)

- **Operations-exception cross-link**: `operations_exception_id` column
  exists and is FK-safe, but no RPC writes it yet — a future integration
  slice decides whether/how an Operations-reported problem promotes to
  an Issue.
- **Manager-Attention-dashboard integration**: Issues has its own entry
  chip/badge, deliberately not merged into `AttentionPanel`'s combined
  total (same posture Operations itself already has). If a future
  mission wants Issues folded into the main "要確認" total, the existing
  "9 vs 4+4" bug (unread mail folded into the badge number but not into
  the breakdown text, `attention-panel.tsx` lines ~265/294) is a direct
  cautionary precedent for getting that arithmetic wrong again.
- **Staff self-acknowledge**: not built — Acknowledge and Resolve are
  both Manager-only (`issues.manage`) in this MVP, an explicit judgement
  call from Slice A, not revisited by later slices.
- **Focus-restore-after-`router.refresh()`**: confirmed (not
  introduced) to also affect the new Issues popups, exactly as it
  already affects Operations. Still an open, dedicated-fix candidate for
  a future bounded quality sweep — not WP2's to fix.
- Attachments/photos/AI classification/notifications/comment threads/
  SLA/priority-matrix — all explicit mission non-goals, none built.

## Hard rules still in force

- No `main`, no production deploy, no Supabase Cloud writes (`db push`/
  `db pull`/`link`/`migration repair`) — all hard-`deny`'d for the agent
  in `.claude/settings.json`, not just policy; require the Founder to run
  them personally even with an explicit approval message.
- Founder-facing language = Russian.
- QA credentials: `oruwa-cafe` Manager/Staff-A accounts in repo-root
  `.env` are Founder-classified PUBLIC DEMO — usable for Preview Browser
  QA, transcript exposure accepted, no rotation; does not extend to any
  real secret.
- Do not start WP3, further WP2 work, or any destructive demo-data
  cleanup without a fresh explicit prompt.

## Reading order for a fresh session

1. `AGENTS.md` → `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` →
   `docs/ai/current-task.md` (its newest pointer, 2026-09-12).
2. `docs/project/master-state.md` §7's WP table + §14 for the updated
   WP2 row and debt register.
3. This file.
4. `supabase/migrations/0118_issues_foundation.sql` for the full
   `issues` domain contract if extending it.
5. `apps/web/src/app/(protected)/issues/**` and
   `apps/web/src/lib/issues/**` for the frontend/service-layer pattern
   if building the next UI slice on top (e.g. an Operations cross-link
   or Manager-Attention integration).
