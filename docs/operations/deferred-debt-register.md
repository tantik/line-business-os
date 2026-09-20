# ORUWA deferred debt register

The single register of everything that is **known, real, and deliberately not
done yet**. Created 2026-09-19 by consolidating deferral lists that were
scattered across `docs/ai/current-task.md` pointers, session handoffs, the
Whole-Product Gate register, and mission reports. Governed by Operating Model
§19 (`docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`).

This register is different from its neighbours:

| Document | Holds |
|---|---|
| `docs/operations/risk-register.md` | Standing operational risks (things that could go wrong). |
| **This register** | Known gaps and deferrals, each with a trigger for when it must be revisited. |
| `docs/ai/current-task.md` | Current stage and next gate only. |
| Candidate backlog / roadmap | New product ideas. Not defects, not debt. |

## Rules

1. **Nothing is deferred silently.** A mission may not report "complete" while
   it has an unresolved finding, an untested coverage dimension (Operating
   Model §19), or a scope cut that is not in this register.
2. Every entry needs a **trigger**: the event that forces a revisit. "Someday"
   is not a trigger. Trigger vocabulary:
   - `T-DEMO` before any customer-facing demo
   - `T-ACCEPT` before or during Full Integrated Cafe v2.2 Acceptance
   - `T-TOUCH` when a mission next touches that surface (fix on touch)
   - `T-CUSTOMER` before the first real customer tenant holds real data
   - `T-PROD` before any production enablement
   - `T-DECISION` waiting for a Founder decision, no code trigger
   - `T-VERTICAL` before a second vertical, second language, or second location
     depends on the behaviour
3. **Status** is `OPEN` (a source records it as open and no later source or
   code check contradicts it) or `UNVERIFIED` (recorded long ago, or later
   work may have touched it; re-check against code before acting and never
   present it as a still-open fact). The `Source` column names the evidence.
   Neither status is a fresh verification; only a row edited in a PR that says
   so carries a new check date.
4. **Closing:** delete the row in the same PR that fixes it and name the ID in
   the commit message; git history keeps the record. If the Founder accepts an
   item permanently, move it to "Accepted, will not fix" with the decision
   date.
5. **Review:** the Lead Agent reads this register at every mission close and
   before every acceptance, demo, or release gate, and tells the Founder (in
   Russian) which triggered items are due.
6. **Class** follows `docs/ai/review-checklists.md`: **A** must be resolved,
   or accepted by the Founder, before its trigger fires (a release or demo
   blocker); **C** is backlog. (B, an approved improvement, is not used here:
   once approved it becomes a mission, not debt.)
7. **Owner** is who moves it next: `Founder` (decision), `Lead` (Claude Lead
   Agent), `GPT` (ChatGPT brief author: research, copy, briefs), `Native`
   (native Japanese speaker).

## A. Demo and customer-facing readiness

Founder-acknowledged in Mission 9. DEBT-001 to DEBT-003 must be decided before
any live customer demo.

| ID | Item | Class | Source | Trigger | Owner | Status |
|---|---|---|---|---|---|---|
| DEBT-001 | Staff↔Manager Mail thread on `oruwa-cafe` holds real Russian QA chatter, visible to anyone opening "メール". Options: new realistic JA thread, or clear the thread. | A | `SESSION_HANDOFF_2026-09-18-MISSION9.md` | T-DEMO | Founder decides, Lead executes | OPEN |
| DEBT-002 | Operations backlog on `oruwa-cafe`: 52 open "対応が必要" items (48 a generic "タスク" group) and 23 unaddressed shift requests, identical in Attention Panel, Operations, Weekly Review. A data decision; no bulk-resolve tooling exists in `packages/db/scripts/*`. | A | Mission 9 handoff | T-DEMO | Founder decides, Lead executes | OPEN |
| DEBT-003 | Two Inventory items named "QAフィクスチャー：抹茶パウダー" and "…：紙コップ（Mサイズ）". The name is the dedup key in `packages/db/scripts/oruwa-cafe-fixture.ts`; rename only together with that script. | A | Mission 9 handoff | T-DEMO | Founder decides, Lead executes | OPEN |
| DEBT-004 | No Demo Data / Reset mechanism (recommended 2026-09-11, never built). **Systemic fix for DEBT-001 to 003:** a fresh, seeded demo tenant (new client = new tenant) instead of hand-cleaning the QA tenant. | C | `SESSION_HANDOFF_2026-09-11.md` | T-DEMO | Founder scopes, Lead designs, GPT may draft the brief | OPEN |
| DEBT-005 | Operations template "Opening checklist": items ("Fridge temperature", "Front door unlocked") are English-only real content; sibling templates are bilingual. Content decision, not a UI fix. | C | Mission 9 handoff | T-DEMO | GPT drafts JA, Founder approves | OPEN |
| DEBT-006 | EN toggle not pixel-verified on Manager Operations/Issues/Weekly Review/Recipes/Inventory/Purchasing or Staff Recipes/Inventory/Purchases/Issues popups; only dashboard chrome and Staff Operations were EN-verified. | C | Mission 9 handoff | T-ACCEPT | Lead | OPEN |
| DEBT-007 | No real mutation ever run from a Staff session in live QA (clock-in, stock count, purchase order); Mission 9 Staff QA was read-heavy. | C | Mission 9 handoff | T-ACCEPT | Lead | OPEN |
| DEBT-008 | No instrumented performance measurement of Operations, Issues, Weekly Review, Inventory, Purchasing, Schedule (only Recipes was measured). | C | Mission 8/9 handoffs | T-ACCEPT | Lead | OPEN |
| DEBT-009 | No full keyboard Tab-cycle / focus-trap audit across popups beyond the specific cases checked in Missions 8/9. | C | Mission 9 handoff | T-ACCEPT | Lead | OPEN |
| DEBT-010 | LIFF real-device CSS baseline never checked (no device available). | C | `SESSION_HANDOFF_2026-09-11.md` | T-CUSTOMER | Founder provides device, Lead checks | OPEN |

## B. UI, copy and i18n quality

| ID | Item | Class | Source | Trigger | Owner | Status |
|---|---|---|---|---|---|---|
| DEBT-011 | **F7:** Purchasing plus about 58 other files are still on legacy `theme.ts`, not Design System v1; includes the shared `HelpIconButton`. A rollout mission, not a bounded fix. | C | Mission 8 handoff; WP2 review P3 | T-TOUCH (or a dedicated DS rollout mission) | Lead | OPEN |
| DEBT-012 | **F12:** Inventory/Recipe unit `pcs` has no Japanese label. | C | Mission 8 handoff | T-TOUCH | Lead, GPT for the term | OPEN |
| DEBT-013 | **F13:** Purchasing footer omits Ordered/Received counts (still visible in the filter tabs). | C | Mission 8 handoff | T-TOUCH | Lead | OPEN |
| DEBT-014 | Manager dashboard attention badge total is inconsistent with its own breakdown ("9" vs "4+4") in `AttentionPanel`. WP2/WP3 deliberately did not fold new counts into it. Not mentioned as fixed in Missions 8/9. | C | `current-task` archive, WP5 pointer (2026-09-17) | T-TOUCH | Lead | UNVERIFIED |
| DEBT-015 | Purchasing `仕入れ`/`購入` term inconsistency and Inventory `不足` copy. | C | DS v1 pointer (2026-09-11) | T-TOUCH | GPT copy review, Lead | UNVERIFIED |
| DEBT-016 | Focus is not restored to the trigger when a mutation-triggered `router.refresh()` closes a DS v1 dialog (reproduced on Operations Staff and Issues popups). Mission 8 F5 fixed only `components/shared/design-kit/Modal.tsx`. | C | WP2 pointer (2026-09-12); Mission 8 handoff | T-TOUCH | Lead | UNVERIFIED for DS v1 `Dialog` |
| DEBT-017 | No server-side language resolution: `LangProvider` is client-only and defaults to `'ja'`. Causes manual bilingual workarounds in `staff/page.tsx` early returns and a brief JA flash before the stored language loads (old FLASH-1). Platform-level change. | C | Mission 9 handoff; Gate register FLASH-1 | T-VERTICAL | Lead | OPEN |
| DEBT-018 | **I18N-JA-1:** native Japanese review pass. The Manager i18n file self-flags unreviewed machine translation; two strings use a raw `--` mid-sentence. Needs a native speaker; GPT can do a first pass. | C | Gate register I18N-JA-1 | T-DEMO | GPT first pass, Native final | OPEN |
| DEBT-019 | Full IA reconciliation of the technical `/dashboard/**` admin shell, and a legacy generic-landing root surface seen on a raw Vercel URL, queued for a "Cafe Functional Reality Audit" that was never run. Confirmed not reachable by Manager/Staff through normal login. | C | Mission 9 handoff; 2026-09-04 pointer | T-ACCEPT | Lead | UNVERIFIED |
| DEBT-020 | **Surface A** (`%5Fclient-preview/mame-to-cha/**`): retain vs retire still undecided. | C | Gate §2.3 (archived) | T-DECISION | Founder | UNVERIFIED |
| DEBT-021 | No dedicated Owner surface; a single-cafe owner uses the Manager surface with full rights. | C | Mission 9 handoff | T-DECISION | Founder | OPEN |

## C. Product deferrals (Founder-accepted scope limits, not defects)

Do not build any of these without a fresh Founder prompt.

| ID | Item | Class | Source | Trigger | Owner | Status |
|---|---|---|---|---|---|---|
| DEBT-022 | WP1: no ad-hoc same-day recheck task. | C | WP1 acceptance §19 | T-DECISION | Founder | OPEN |
| DEBT-023 | WP1: no per-location threshold override on a shared template (HACCP thresholds are Manager config). | C | WP1 acceptance §19 | T-VERTICAL (second location) | Founder | OPEN |
| DEBT-024 | WP1: `critical_missed` is materialised at Manager-Operations read time, not by a scheduled worker (writer is worker-ready). Real scheduled-cron firing has not been observed live. | C | WP1 acceptance §19; 2026-09-04 pointer | T-CUSTOMER | Lead | OPEN |
| DEBT-025 | WP1-A review F2 (broad grant lets a Manager raw-`INSERT` a backdated non-overlapping schedule version) and F4 (cosmetic comment), tracked for the Operations config slice; not confirmed closed by migration `0105`. | C | 2026-08-28 pointer | T-TOUCH | Lead | UNVERIFIED |
| DEBT-026 | WP2 Issues: `operations_exception_id` column exists but nothing writes it; no Attention integration beyond the module chip; no Staff self-acknowledge; no attachments, photos, AI, or notifications. | C | WP2 pointer | T-DECISION | Founder | OPEN |
| DEBT-027 | WP3 Weekly Review: no AI summary, week-over-week deltas, snapshot table, date-range picker, or multi-location aggregation. P3: unused i18n keys; an all-modules-off tenant shows the quiet-week state instead of a distinct message. | C | WP3 pointer | T-DECISION | Founder | OPEN |
| DEBT-028 | WP4 Purchasing: Supplier entity, item↔supplier mapping, preferred supplier, draft→approval flow, automatic ordering, invoices, payments, OCR, procurement analytics. Founder confirmed the narrowing was deliberate (2026-09-16). | C | WP4 pointer | T-DECISION | Founder | OPEN |
| DEBT-029 | WP5 Recipe Intelligence: supplier/invoice/margin/menu-engineering, price history, nutrition claims, automatic consumption. P3s: location-mismatch trigger is only pgTAP-tested via direct insert (not the RPC path); cost/reference-data server actions rely on the RPC-level permission check with no separate server-side `canManage` gate (defense in depth only). | C | WP5 pointer | T-DECISION / T-TOUCH | Founder / Lead | OPEN |
| DEBT-030 | Weekly Schedule: no schedule-change audit history (`SCHEDULE_CHANGE_HISTORY_GAP`), no employee notification mechanism. | C | 2026-08-22/23 pointers | T-DECISION | Founder | UNVERIFIED |
| DEBT-031 | Shift Requests popup redesign and hand-icon hover (Founder mockup 2026-08-23, queued). | C | 2026-08-23 pointer | T-DECISION | Founder | UNVERIFIED |
| DEBT-032 | Staff header Manager-decision unread badge (needs persisted read-state, no column to reuse); Transport intentionally excluded from the Correction workflow. | C | `CAFE_STAFF_SHIFT_SCHEDULE_V2_HANDOFF_2026-08-25.md` | T-DECISION | Founder | UNVERIFIED |
| DEBT-033 | Employee **Permanent Delete privacy purge**: keep name only, strip PII and Mail on genuine offboarding. Real APPI and labour-record-retention weight; needs a legally aware scope, do not improvise. | C | Mail module handoff (2026-08-26) | T-CUSTOMER | Founder, GPT research | OPEN |
| DEBT-034 | v2.1 Gate register leftovers whose status was never re-checked: CLK-1 live clock-in/out on canonical surface, EXCH-UX-1, INV-UX-1 (P3 polish). | C | Gate §21 | T-ACCEPT | Lead | UNVERIFIED |

## D. Platform, engineering and environment

| ID | Item | Class | Source | Trigger | Owner | Status |
|---|---|---|---|---|---|---|
| DEBT-035 | **Production enablement blocked** pending a separate Founder-approved Production ENV/key gate (a `vercel env rm` on `preview` deleted a record shared with Production in 2026-09; Founder accepted, not restored). | A | `docs/operations/deployment-checklist.md`, ENV cleanup records | T-PROD | Founder | OPEN |
| DEBT-036 | Production Supabase key migration (legacy to `sb_publishable_*`/`sb_secret_*`) and JWT signing secret untouched; only Cloud DEV migrated. | A | `docs/operations/supabase-secret-key-migration-runbook.md` | T-PROD | Founder, Lead | OPEN |
| DEBT-037 | `supabase test db` has a pre-existing failing set (last recorded 5 files / 11 subtests: `0002`, `0006`, `0008`, `0012`, `0023`; earlier records said 7 files / 22 subtests). Also day-of-week-dependent Operations tests (`0047`, `0058`). Every mission re-proves "zero new failures" by hand. | C | WP5 pointer (2026-09-17); WP4 pointer | T-TOUCH | Lead | OPEN |
| DEBT-039 | Non-cloud Mame To Cha pilot/rehearsal tooling family and `MAME_TO_CHA_LOCAL_*` vars remain; deletion blocked because `oruwa-cafe-fixture` depends on `mame-to-cha-dates.ts`. | C | ENV cleanup step 2 (2026-09) | T-TOUCH | Lead | UNVERIFIED |
| DEBT-040 | The `SUPABASE_SECRET_KEY` used from Lead Agent sessions gets `403` on some `api.*` views, which blocks direct PostgREST read-back verification after a migration (reproduced on an untouched view, so not a regression). Live Browser QA is the fallback evidence today. | C | WP2 pointer (2026-09-12) | T-TOUCH | Lead | OPEN |
| DEBT-041 | Documentation hygiene: `risk-register.md` cites `docs/product/cafe-v2-2-candidate-backlog.md`, which does not exist; the Gate register also flagged DOC-1 (a cited audit doc missing from git history) and DOC-2 (`docs/QA_ACCESS.md` missing). `docs/project/master-state.md` §12 still lists `/dashboard/admin` having no role gate as P1 (Defect A), but the page now gates on `hasTenantAdminAccess` (VERIFIED in `dashboard/admin/page.tsx`); `PROJECT_BRIEF.md` §11-17, `docs/product/modules.md`, `docs/architecture/overview.md` (request flow, "anon key"), `AGENTS.md` read-order items 10-12 and several `docs/phase-1*.md` are recorded as stale in `master-state.md` §12 and Appendix C. | C | Gate §21; `master-state.md` §12 and stale-docs table; this PR's check | T-TOUCH | Lead | OPEN (backlog file), UNVERIFIED (DOC-1/2) |
| DEBT-042 | Viewport and role combinations never covered live by Missions 8/9: Manager at 320 and 375 px, Staff at 768 and 1440 px. | C | Mission 8/9 handoffs | T-ACCEPT | Lead | OPEN |
| DEBT-043 | `main` and `dev` diverge (`main` still carries historical `0069`-`0073`; `dev` is authoritative) and the `dev → main → production` release path is **undefined**. P1 before the first production release; `main` merge and production deploy stay two separate Founder gates. | A | `docs/project/master-state.md` §12; `cto-context.md` §6 | T-PROD | Founder, Lead | OPEN |
| DEBT-044 | Platform Foundation is "present but not wired": entitlements not enforced at the module gate, module registry not driving navigation, notifications outbox has no dispatcher, event bus has no consumers. By decision closed only per consumer, not as one burn-down project. Also three Platform-Foundation-reconciliation P3s (inputs for a future Operations config write-path / limit-view UI), listed in `master-state.md` §12. | C | `master-state.md` §12 | T-VERTICAL (when a real consumer needs each) | Lead | OPEN |
| DEBT-045 | Local ENV exceptions accepted in the ENV cleanup and not to be reopened: `.env.local.backup` kept (deletion blocked until PII-key recovery is independently proven); `apps/web/.env.local.cloud-backup` (public-only; replacement or retirement is a standalone follow-up); root `.env.local` and `.env.cloud.local` wait on the non-cloud Mame reconciliation (DEBT-039); `apps/web/.env.translation-script.local` and `supabase/functions/.env` wait for translation work and local Edge development. Minor leftovers in `master-state.md` §18: platform-managed Edge legacy names and an unused `OPENAI_API_KEY`. | C | `master-state.md` §12 (ENV Cleanup 3B) | T-DECISION | Founder | OPEN |
| DEBT-046 | Deferred approaches, not scheduled: AI demand forecasting and autonomous ordering (need usage history, explainability, Manager approval); heavy multi-agent orchestration (only when coordination complexity is real and measurable); Product #2 / second vertical (not selected). | C | `cto-context.md` §6 | T-VERTICAL | Founder | OPEN |
| DEBT-047 | Gates named in `master-state.md` before Cafe v2.2 can close whose completion was never recorded: full JA/EN Copy Audit, Founder-facing Russian Feature Map (item 15b), and the Help Content Pass v2 live Browser QA (recorded "remains open, non-blocking"). | C | `master-state.md` §7, item 15b | T-ACCEPT | Lead, GPT for the Feature Map draft | UNVERIFIED |
| DEBT-048 | `packages/db`, `packages/config`, `packages/line`, `packages/tokens` `test` scripts are hand-kept file lists (the `apps/web` version drifted silently and was fixed in PR #534). In sync on 2026-09-20: db 24/24, line 1/1, tokens 1/1; config lists 3 on purpose (includes `supabase/functions` tests). A new test there is never run unless added by hand. Fix: reuse the `apps/web` runner pattern. | C | PR #534 review | T-TOUCH | Lead | OPEN |
| DEBT-049 | Live checks that need a second identity or an entitlement write are impossible on the single-tenant, single-location `oruwa-cafe`: cross-tenant and cross-location isolation, a no-role user, and a module-OFF tenant. Today covered by pgTAP and code review only. | C | Integrated Acceptance mission plan | T-CUSTOMER (Phase 7 Clean Tenant Acceptance, a second tenant) | Founder provides a second tenant/credential, Lead | OPEN |

## Accepted, will not fix

None recorded yet.
