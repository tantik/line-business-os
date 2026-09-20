# Mission: Cafe v2.2 Full Integrated Acceptance (master-roadmap Phase 4)

Governed by [`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`](ORUWA_AI_ENGINEERING_OPERATING_MODEL.md) v1.9.0
(§18 Prompt Review, §19 coverage matrix, §12 reviewer selection). Prepared
2026-09-20 by the Lead Agent for a fresh session; nothing below has been
executed yet. Companion handoff: [`SESSION_HANDOFF_2026-09-20.md`](SESSION_HANDOFF_2026-09-20.md).

## Founder authorization

Founder, 2026-09-20 (chat): "подготовь все чтобы начать в новом чате" after the
Lead Agent proposed this mission as the next step. `docs/project/master-state.md`
and the older `current-task.md` pointers said this mission needed "its own
Founder prompt"; that prompt is this instruction. Standing rules from the same
session: the Lead Agent decides everything itself except the RED tier of
Operating Model §9 (merging into `main`, production, any write to a real
database, secrets, billing, real LINE broadcast, merging a PR that touches
`supabase/migrations/**`); it does not ask the Founder routine questions.

## Prompt Review

None. Founder-originated (no external brief). Scope below comes from
`docs/strategy/oruwa-master-roadmap.md` Phase 4 and `docs/project/master-state.md`
items 15b and 16.

## Objective

Decide, with evidence, whether Cafe v2.2 can be called **CLOSED**: "can this be
given to a real cafe and charged for?" — real Manager and Staff workflows,
security, reliability, mobile, Japanese, performance, data integrity — and
close every release-blocking gap found, so the Founder gets one verdict.

## Scope

Track A — **Copy Audit + Feature Map + Demo Readiness** (master-state item 15b,
must precede the acceptance):
- A1. Full JA/EN Copy Audit: inventory every user-facing dictionary
  (`*-i18n.ts` under `apps/web/src/app/(protected)/**`), find hardcoded strings
  and raw-value fallbacks, produce a first-pass Japanese review packet for GPT
  (no secrets, no tenant data). Native final review stays DEBT-018.
- A2. Founder-facing **Russian Feature Map**: what the Cafe product does today,
  per role, per module, in plain Russian, derived from code and live QA (not
  from old docs).
- A3. Demo Readiness check against DEBT-001 to DEBT-005 and `docs/project/master-state.md` item 15b.

Track B — **Integrated live acceptance** on `oruwa-cafe` (Cloud DEV,
`https://preview.oruwa.jp/sign-in`), following `docs/ai/review-checklists.md`
"Founder Acceptance order" plus the surfaces added by WP1 to WP5:
- Authentication and session first (Founder Acceptance order #1): sign-in,
  sign-out, role-based redirect (`/manager`, `/staff`), session persistence on
  reload, an unauthenticated visit to a protected route.
- Manager: dashboard and Attention Panel, Weekly Schedule, shift requests and
  exchanges, correction requests, Staff management (including invitations and
  LINE linking), Recipes (with WP5 cost and allergens),
  Inventory, Purchasing (Order/Receive/History), Operations (Today,
  Templates, HACCP), Issues & Handover, Weekly Review, Mail, Settings, Help.
- Staff (real session, 田中美咲): landing, shifts, requests and exchange and
  correction, clock-in and work status (DEBT-034, CLK-1), work report,
  transport, Recipes, Inventory, Purchases, Issues, Operations tasks, Mail,
  account menu and language toggle.
- Help surfaces (the shared `HelpIconButton` popups) live, the still-open part
  of the Help Content Pass v2 QA (DEBT-047).
- Role boundaries as negatives: Staff must not reach Weekly Review, cost,
  management controls. A no-role user and a module-OFF tenant cannot be
  reached on the single-tenant `oruwa-cafe` without a second credential or an
  entitlement write (out of scope): those are NOT TESTED live, covered only by
  pgTAP and code review, and registered as DEBT-049.
- One real mutation per role per module where the surface writes (DEBT-007).
- EN pass on every popup (DEBT-006); viewports 320, 375, 768, 1440 for both
  roles (DEBT-042); instrumented performance for Operations, Issues, Weekly
  Review, Inventory, Purchasing, Schedule (DEBT-008); keyboard Tab-cycle,
  focus trap and focus restore across popups (DEBT-009).
- Local pgTAP suite re-run against the known baseline (DEBT-037: 5 files /
  11 subtests pre-existing failures: `0002`, `0006`, `0008`, `0012`, `0023`;
  Operations `0047`/`0058` are day-of-week dependent) to prove no new failure.

Track C — **Bounded repair** of class-A findings (release fixes, per
`docs/ai/review-checklists.md`) only, each with its own PR, review, and live
re-verification.

Track D — **Verdict and records**: acceptance report, updated
`current-task.md` §5, `master-state.md`, register rows, handoff.

## Out of scope

- Any new feature or scope expansion (Phase 4 ends feature creep). Class B and
  C findings go to the register, not into a PR.
- Merging into `main`, production deploy, production ENV or keys (DEBT-035,
  DEBT-036, DEBT-043).
- Any write to a real database beyond ordinary QA actions through the product
  UI. No bulk delete, no cleanup script, no `db push`, no migration apply. The
  clean demo tenant (DEBT-004) and the fate of DEBT-001 to DEBT-003 are Founder
  decisions and a separate mission (roadmap Phase 7, Clean Tenant Acceptance).
- Platform Foundation wiring, Billing, LINE broadcast, customer data.
- Migrating Purchasing and the other legacy `theme.ts` files to Design System
  v1 (DEBT-011) unless a finding proves it blocks release.

## Source of truth

`AGENTS.md`, Operating Model v1.9.0, `docs/ai/oaes-project-profile.md`,
`docs/ai/current-task.md`, `docs/operations/deferred-debt-register.md`,
`docs/ai/review-checklists.md`, `docs/development/product-acceptance-workflow.md`,
`docs/project/master-state.md` (§7, §12, §14 to §16), `docs/strategy/oruwa-master-roadmap.md`
Phase 4, and the handoffs `SESSION_HANDOFF_2026-09-18.md`,
`SESSION_HANDOFF_2026-09-18-MISSION9.md`, `SESSION_HANDOFF_2026-09-20.md`.

## Constraints

- Production, `main`, Cloud writes, secrets, billing, real customer data:
  Founder-only (Operating Model §9).
- QA data created through the UI carries a "(v2.2 acceptance QA)" suffix and is
  resolved through the normal product workflow, never deleted (same precedent
  as WP2/WP5). New Operations/shift-request residue increases DEBT-002, so keep
  it minimal and log it. Some QA mutations are append-only and cannot be
  resolved (purchase order and receipt log, stock counts, clock-ins): list that
  residue in the report and register it as a new row instead of hiding it in
  DEBT-002.
- Public demo QA credentials are Founder-classified; the sandbox blocks reading
  `.env`, so the Founder pastes what is needed (or the browser profile is
  already signed in). Never write credentials into a file, PR, or chat log
  beyond what the session already shows.

## Mission size

High-risk in verification terms (the verdict is what the Founder sells on),
Standard in change terms (repairs are bounded and non-RED unless a finding
forces a migration, which then follows the RED path). Independent review is
mandatory (§12).

## Definition of Done

1. Every applicable row of the coverage matrix below is VERIFIED, N/A with a
   reason, or NOT TESTED with a register row (status then CLOSED WITH GAPS).
2. Track A deliverables exist: Copy Audit report, Russian Feature Map, Demo
   Readiness note.
3. Acceptance report `docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_<date>.md`
   with a findings register (ID, module, severity P0-P3, class A-D, exact
   reproduction, expected, actual, evidence, role, language, viewport).
4. Every class-A finding is fixed and re-verified live, or explicitly accepted
   by the Founder.
5. Verdict stated in Russian to the Founder using the three distinct terms:
   **Engineering PASS**, **Founder Technical Freeze**, **Commercial Release**
   (they are not synonyms; production stays gated).
6. Records updated in the same session: `current-task.md` §5 replaced,
   `master-state.md`, `deferred-debt-register.md`, and a new session handoff.

## Verification requirements

Live authenticated Browser QA (chrome-devtools MCP) for both roles; real
screenshots at each viewport; console and network inspection; `pnpm --filter
@line-os/web test` (expect 1347 tests, all pass at start), typecheck, lint,
build for any repair PR; local `supabase test db` against the DEBT-037
baseline; CI and Vercel Preview per repair PR; post-merge smoke on canonical
`preview.oruwa.jp`.

## Reviewers (Operating Model §12)

`oruwa-ux-i18n-reviewer` for any UI repair; `oruwa-db-security-reviewer` for
any migration, RLS, RPC, or permission finding or repair (always, regardless
of size); `oruwa-reviewer` on the final report and coverage matrix. If a
reviewer type is unavailable, use a general-purpose agent told to follow that
agent's `.md` file.

## Escalation boundaries

Likely hits: a repair that needs a migration (RED path: Founder merges, Founder
applies to Cloud DEV); a finding whose right answer is a data change on
`oruwa-cafe` (Founder decision); anything touching auth, permissions, or PII.
Stop and report at each; do not route around.

## Coverage matrix (planned)

| # | Dimension | Status and plan |
|---|---|---|
| 1 | Tenant and location isolation | Single-tenant, single-location live; isolation proven by pgTAP re-run against the DEBT-037 baseline plus code review of any repaired path. Live cross-tenant is NOT TESTED (no second tenant credential); register as a row if still true. |
| 2 | Roles and permissions | Live as Manager and Staff, negatives included (Staff cannot see Weekly Review, cost, management controls). No-role user: NOT TESTED live (DEBT-049), pgTAP and code review only. |
| 3 | Live role QA | Both roles in real sessions, one real mutation per role per module (closes DEBT-007). |
| 4 | JA and EN | Every popup in both languages (closes DEBT-006); Track A Copy Audit; fixed-locale formatting checked. |
| 5 | Viewports | 320, 375, 768, 1440 for both roles (closes DEBT-042). |
| 6 | States | Loading, empty, error, denied, double-submit exercised per module. Module-OFF live: NOT TESTED (DEBT-049), pgTAP `0059`/`0060`/`0061` module-off cases and code review only. |
| 7 | Data realism | Existing QA residue (DEBT-001 to 003) noted, not cleaned; long values and many-row lists observed; timezone boundaries checked on Schedule and Weekly Review. |
| 8 | Accessibility and keyboard | Tab-cycle, focus trap, focus restore, Escape across all popups (closes DEBT-009, checks DEBT-016). |
| 9 | Performance | Instrumented request count and time for the six modules named in DEBT-008; duplicate-request check. |
| 10 | Design system | Report any new legacy `theme.ts` use; DEBT-011 stays deferred unless it blocks release. |
| 11 | Security and privacy | No `service_role` in `apps/web` (grep), no PII in UI or console, Staff cannot fetch Manager-only data (network tab), mutations exercised in QA leave an audit record (checked where an audit view exists, else code review). |
| 12 | Compatibility and rollout | No migration expected; if a repair needs one, additive plus rollback plus Founder Cloud gate. Entitlements and module flags respected by any repair. |
| 13 | Extension impact | Note Cafe-specific hard-wiring found; feeds SaaS Hardening (Phase 5). |
| 14 | Neighbouring regressions | Attention badge (DEBT-014), Weekly Review against Operations/Purchasing counts after any repair. |
| 15 | Docs and state | Report, `current-task.md` replaced, `master-state.md`, register, handoff; new tests counted in the run. |

## Stop condition

The verdict and records above are delivered and the handoff is written. Do not
start SaaS Hardening (Phase 5), the clean demo tenant, or any new feature; do
not begin Production work. Report to the Founder and stop (Operating Model §16).

## Operating mode

Autonomous within the boundaries above. Routine decisions (which finding is
class A, which repair, when to merge into `dev` via `scripts/ai-dev-merge.sh`)
are the Lead Agent's. Founder-facing text in Russian. Use Operating Model
"Command discipline": plain allow-listed command forms, no `cd … &&`, no
`node -e` heredocs, no pipes. Suggested order: Repository Recovery and register
check → Track A → Track B (Manager, then Staff, then cross-role negatives, then
performance/keyboard/EN/viewports) → findings register → Track C → Track D.
Tooling note from WP2: chrome-devtools `emulate` with `deviceScaleFactor=2` can
misalign clicks; use `resize_page` or scale 1 for interaction.
