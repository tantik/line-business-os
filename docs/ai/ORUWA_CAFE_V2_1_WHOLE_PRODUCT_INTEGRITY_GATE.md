# ORUWA Cafe v2.1 — Whole-Product Integrity & Completeness Gate

**Mission type:** Research/audit mission — read-only. No application code, migrations, RLS, Auth, or configuration were modified while producing this document.

**Date:** 2026-08-16
**Repository state inspected:** `origin/dev` @ `7c82e6d79b0cf15a8cac2985f75672fcd64290bc` (merge of PR #240), inspected from local branch `dev-audit-readonly` (created off `origin/dev`, working tree clean throughout). This includes:
- PR #239 / commit `8681c71` — Mission 1, "customer-facing product integrity & Japanese-first baseline"
- PR #240 / commit `16fad5e` — Mission 2, "Manager Attention layer + canonical Manager JA/EN localization"

Both merge commits and both missions' CI (`typecheck / test / build / lint`) were independently confirmed via `gh pr view` — **SUCCESS** for both. `npx tsc --noEmit` was independently re-run against current HEAD this session — **exit 0, zero errors** (TEST_VERIFIED).

**Note on mission-prompt evidence**: the mission brief instructed reading `docs/ai/ORUWA_CAFE_V2_1_PRODUCT_UX_RECONCILIATION_AUDIT.md`. That file does not exist anywhere in this repository's git history (`git log --all` finds zero commits creating it), despite Mission 1's own commit message citing it as the audit it was closing findings from. The actual, real audit document covering this ground is `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`, which this gate treats as the baseline. **This is itself a findable governance gap** — see §21 DOC-1.

---

## 1. Executive Verdict

```
CAFE_V2_1_READY_AFTER_BOUNDED_FIXES
```

Cafe v2.1's canonical product — Staff surface, Manager surface (including the new Attention layer), Inventory, Recipes, and onboarding — is architecturally sound, security-sound, and functionally coherent. The single genuine P0 identified by the prior reconciliation audit (Manager could not act on a Staff shift-exchange request anywhere in production) is **confirmed closed** by Mission 2, independently re-verified by direct code reading, not merely trusted from the commit message. No new P0 was found.

However, Mission 2 localized the Manager dashboard's page shell and primary panels but left two of the Manager's most frequently-used write surfaces — the Add/Edit Staff modal and the shift-assignment editor — **entirely hardcoded in English**, unaffected by the JA/EN toggle it just introduced on the same page. For a Japanese-first product whose commit message specifically claims "canonical Manager JA/EN localization," a JA-speaking owner toggling to Japanese still hits English-only text the moment they try to add a staff member or edit a shift — the two most common Manager actions. This is a real, bounded, low-effort gap, not a redesign, and is the one item this gate treats as a genuine v2.1 closure blocker (see §28).

Everything else found is P2/P3 polish, pre-existing and previously-documented (mobile styling, live clock-in/out, staff profile-card i18n, location-fallback leniency, an orphaned dead route) or explicitly out of v2.1's scope (Checklists, Training, Weekly Review, etc.).

---

## 2. Evidence Scope

| Marker | What it covers this session |
|---|---|
| **TEST_VERIFIED** | `npx tsc --noEmit` on `apps/web`, re-run this session, exit 0. CI `typecheck / test / build / lint` for PR #239 and #240, confirmed SUCCESS via `gh pr view`. |
| **STATIC_VERIFIED** | The large majority of this report — direct file reads of route/auth/business-logic code by four parallel subagents plus the Lead Agent, cross-checked against prior audit claims, with file:line citations preserved in this document's tables. |
| **LIVE_VERIFIED** | **None.** No disposable QA credentials exist in this repository (`docs/QA_ACCESS.md`, referenced by a prior evidence doc, does not exist in this branch's history — see §21 DOC-2). No authenticated browser session was performed. |
| **NOT INDEPENDENTLY VERIFIED THIS SESSION** | Every "live-verified locally" claim inside Mission 2's own commit message (sign-in, JA default render, EN toggle, calm/non-empty Attention states, Approve-and-disappear, 390px mobile) — plausible and consistent with the code read, but not re-run live by this gate. |
| **UNKNOWN** | Whether Surface B's live schedule polling behavior matches Surface A's (carried forward, unresolved, from the 2026-08-15 audit); whether any real (non-QA) tenant currently has data affected by any P2 item below. |

Given the absence of QA credentials, this gate's evidence is code-and-CI based, not click-through QA. That is disclosed, not concealed, per §21 of the mission brief ("If an exact live path cannot safely be tested, document the evidence level instead of forcing it").

---

## 3. Current Canonical Product Surface Map

Re-verified directly against current HEAD (not merely cited from the 2026-08-15 audit).

| Route | Classification | Notes |
|---|---|---|
| `(protected)/dashboard/page.tsx` | CANONICAL (hub) | `requireTenantContext()` only |
| `(protected)/dashboard/workforce/page.tsx` | CANONICAL | Workforce landing hub |
| `(protected)/dashboard/workforce/staff/page.tsx` | CANONICAL | Staff surface |
| `(protected)/dashboard/workforce/manager/page.tsx` | CANONICAL | Manager surface, incl. new Attention layer |
| `(protected)/dashboard/workforce/recipes/**` | SUPPORTING | Recipes/manuals |
| `(protected)/dashboard/inventory/page.tsx` | CANONICAL | Inventory |
| `(protected)/dashboard/admin/page.tsx` | CANONICAL, real gate now | See §4 |
| `(protected)/dashboard/auth-boundary-smoke/page.tsx` | LEGACY/DEV-ONLY | Self-documented "LOCAL/DEV-ONLY DIAGNOSTIC PAGE... Not a product feature" |
| `%5Fclient-preview/mame-to-cha/**` (Surface A) | PREVIEW_ONLY | Reachable only on `preview.oruwa.jp`; unchanged, still the UX-reference environment; retain/retire decision still open per current-task.md §2.3 |
| `mame-to-cha/**`, `demo/cafe/**` (Surface A′) | PREVIEW_ONLY / public marketing | Unchanged, intentional public demo surfaces, out of scope |
| `apps/web/src/app/workforce/page.tsx` | **ORPHAN — still unresolved across two more missions** | Dead static stub; `next.config.mjs` still carries two dangling redirects to non-existent routes (`/shifts`, `/manager`); zero inbound links repo-wide |
| `auth/accept-invite/**` | CANONICAL (onboarding) | Untouched by either mission; prior "proven end-to-end" conclusion holds |

No new surface, no surface deletion, no route restructuring occurred in Mission 1 or 2. The surface map itself has not materially changed since the 2026-08-15 audit except the Admin route's authorization tightening (§4).

---

## 4. Role / Authorization Matrix

Server-side checks re-verified by direct code read, not by trusting hidden navigation.

| Route | Owner/Admin | Manager | Staff |
|---|---|---|---|
| `/dashboard` | `requireTenantContext()` only | same | same (read-only shell) |
| `/dashboard/admin` | `hasTenantAdminAccess()` → `core.member.invite` RPC, checked **before** any admin-only read (`admin/page.tsx:29-38`) — **STATIC_VERIFIED, Mission 1's claim confirmed true**, superseding the prior audit's "no gate, currently inert" finding | passes only if also holding `core.member.invite` | denied, `UnauthorizedState` |
| `/dashboard/workforce/manager` | passes if holding `workforce.staff.manage` | `hasManagerAccess()` → `api.has_permission('workforce.staff.manage')` RPC, fails closed on RPC error | denied |
| `/dashboard/workforce/staff` | passes | passes | passes — module-enable gate only |
| `/dashboard/inventory` | passes | `canManage=true` | passes, `canManage=false`, write UI hidden; RLS remains the real boundary, not the hidden UI |

No case found where hiding a nav affordance substitutes for a server check — every gate above is enforced before data is read or a write action is exposed.

---

## 5. Manager End-to-End Journey

Verified by direct, full-file reading of `manager-dashboard-client.tsx` (current, post-Mission-2 version) and `manager/page.tsx`.

| Step | Status |
|---|---|
| Login → tenant context | STATIC_VERIFIED wired |
| Manager-only authorization | STATIC_VERIFIED, checked before any manager-only read |
| Attention panel (calm/needs-action) | STATIC_VERIFIED, correct aggregation, no duplicated logic (§9) |
| Staff roster/visibility | STATIC_VERIFIED |
| Schedule visibility/management/publish | STATIC_VERIFIED |
| Staff shift-preference visibility | STATIC_VERIFIED — Manager sees a real, populated preferences table, not just stored data |
| Correction request decide | STATIC_VERIFIED, wired, closes the loop (§8) |
| Shift-exchange decide | **STATIC_VERIFIED, now present** — full Approve/Reject UI wired to the real `decideShiftExchange` action, with a `canApprove` guard matching the server's own rejection rule. This resolves the prior audit's headline P0. |
| Inventory status | STATIC_VERIFIED — Attention panel surfaces shortages with a working deep-link to `/dashboard/inventory` |
| Recipes/Manuals access from Manager | **Not found.** No Recipes/Manuals link located anywhere in `manager-dashboard-client.tsx` or `manager/page.tsx`. Reachable only via the Workforce hub, one level up, not directly from the Manager page itself. Informational, not a blocker (§20). |

A Manager can understand what happened, what needs attention, what action is required, where to take it, and — because decide handlers call `router.refresh()` and Attention state is a `useMemo` over fresh props — resolved items correctly disappear with no stale-state bug found.

---

## 6. Staff End-to-End Journey

Verified by full-file reading of `staff-dashboard-client.tsx` and its form components (current, post-Mission-1 version).

| Step | Status |
|---|---|
| Login → correct tenant/location | STATIC_VERIFIED, with a known leniency caveat (§16) |
| Canonical Staff landing | STATIC_VERIFIED |
| Own profile | STATIC_VERIFIED, present, but partially untranslated (§12) |
| Published schedule / week nav | STATIC_VERIFIED |
| Shift preferences (submit) | STATIC_VERIFIED — correctly INSERT-only by design; no decision state to surface (verified against `shift-requests.ts` comment) |
| Work reporting | STATIC_VERIFIED — manual entry only, no live clock (§17) |
| Correction request (submit + see decision) | STATIC_VERIFIED, closed loop via a persistent status-badge table |
| Shift exchange (submit + see decision) | STATIC_VERIFIED, closed loop, but surfaced only inside a per-shift modal, not a persistent list — less discoverable than corrections (P3, §10) |
| Inventory access | STATIC_VERIFIED — direct link present; no shortage summary shown inline on the Staff page itself (P3) |
| Recipes/Manuals | STATIC_VERIFIED, reachable |

All four Staff-facing lists (schedule, preferences, work-reports, corrections) have explicit empty/unavailable messaging — no silent blanks, no state that would read as broken (§13).

---

## 7. New Staff Onboarding Integrity

Confirmed via `git show --stat` on both mission commits: **neither Mission 1 nor Mission 2 touched any file in the onboarding chain** (`auth/accept-invite/route.ts`, `lib/workforce/invitation-actions.ts`, `SetPasswordForm.tsx`, or the Staff landing redirect). The prior audit's "proven end-to-end for a genuine first-time hire" conclusion (`docs/ai/current-task.md` §2.2) is **not re-derived here — it is unaffected by these two missions and continues to hold** by non-modification, per the mission brief's own instruction not to unnecessarily recreate destructive test data when code is provably unchanged.

Unresolved from prior audits, unaffected by Missions 1/2, carried forward: **Defect C** — no self-service recovery path if a user's invite token is consumed but password setup never completes. Still open; out of scope for this gate to fix, listed for completeness in §26.

---

## 8. Manager ↔ Staff Closed-Loop Workflows

| Workflow | Status |
|---|---|
| Staff submits correction → Manager decides → Staff sees result | **PASS** — decision renders in a persistent, always-visible status-badge table on Staff's page |
| Staff submits shift exchange → Manager decides → Staff sees result | **PASS**, but the decision state on the Staff side is buried inside a per-shift-cell modal rather than a persistent list (UX inconsistency vs. corrections, P3 — §10) |
| Staff submits shift preference → Manager can use it | **PASS** — a real, populated preferences table is shown on the Manager dashboard, not just written to the DB |
| Manager approves attendance correction → attendance record actually updates | **PASS, re-verified this session.** A prior live-QA doc (`docs/product/cafe-package-v2-1-final-live-founder-acceptance.md`, dated 2026-08-10, testing Surface A pre-canonicalization) found this broken (FR-01). Direct code reading of the current `decideCorrectionRequest` function (`shift-requests.ts:270-330`) shows an explicit atomicity guarantee was added afterward: approval and attendance-application happen together, with an automatic revert-to-pending if the attendance write fails, so "Approved" can never be left standing without the hours actually applied. Confirmed via `git log` that the fix (`6160e3c`/`dc10eea`) predates both current missions. **This 2026-08-10 finding is stale and superseded — flagged explicitly, not silently dropped.** |

No write-only forms were found anywhere in the canonical surface — every write path checked has a corresponding read surface reflecting the result.

---

## 9. Manager Attention Integrity

`apps/web/src/lib/workforce/manager-attention.ts` is a genuinely pure function (STATIC_VERIFIED — no I/O, deterministic, unit-tested with 5 cases including calm-state and null-omission). It aggregates three already-computed signals (pending corrections, actionable exchanges, inventory shortages) without re-deriving business logic. Inventory correctly omits its line entirely (not "0 items") when the module is disabled or the read failed, distinguishing "nothing wrong" from "not applicable." Deep-links (`#correction-requests`, `#shift-exchange-requests`, `/dashboard/inventory`) all resolve to real, matching on-page anchors — no dead links. Resolved items disappear correctly because decide handlers call `router.refresh()`, which recomputes the `useMemo`-derived Attention list from fresh server props — no stale-state bug found.

No misleading counts, no duplicate business logic, no notification-wall behavior (calm-by-default, only 0–3 lines shown, ordered decision-items-before-operational). No current v2.1 state that clearly requires Manager action was found unsurfaced, beyond what's already covered by the three signals in scope.

---

## 10. Cross-Module Integrity

Hub-and-spoke navigation (Workforce → Staff/Manager/Recipes) is intact with no dead ends — each spoke links back to the hub. Inventory and Admin link back to the top-level dashboard rather than the Workforce hub, which is architecturally correct (they are top-level modules, not Workforce sub-pages), not a bug.

Findings:
- Manager's Attention panel correctly surfaces Inventory shortages (cross-module, working).
- Manager sees Staff-submitted shift preferences in a usable table (cross-module, working).
- Staff has a direct link to Inventory but no inline shortage summary — must click through (P3, minor, matches existing "Staff just needs the link" scope).
- No duplicated business logic, no write-only forms, anywhere in the canonical surface.

---

## 11. UX Consistency

All four canonical pages (Manager, Staff, Inventory, Admin) import the same base design tokens (`lib/ui/theme.ts`) plus, for Workforce pages, the same additive `workforce-theme.ts`. No second color palette or divergent button system was found — this part of the product genuinely feels like one system.

One objective (not stylistic) inconsistency: Admin's member table renders two raw DB values (`tenantKind`, `membershipStatus`) directly, breaking the label-helper pattern (`correctionStatusLabel`/`attendanceStatusLabel`/`exchangeStatusLabel`) that Manager and Staff otherwise apply consistently. P2 — Admin is lower-traffic and self-documented as internal-facing, but the raw-English-word-inside-JA-prose effect is the same commercial-presentability issue flagged elsewhere in this report.

---

## 12. Localization Integrity

**Confirmed resolved by Mission 1/2:**
- The prior "all-Russian" Admin chrome is now JA/EN via the shared mechanism — zero Cyrillic characters found anywhere under `dashboard/**` (full grep, zero hits).
- `attendance_status` now renders through a proper label helper on both Staff and Manager.
- Shift-preference, work-report, and correction-request section headings on the Staff page are now dictionary-driven, not hardcoded.
- One shared `LangProvider`/`useLang` mechanism is used consistently across all five canonical client components (Manager, Staff, Inventory, Admin, Recipes) — not several independent reimplementations. Persistence is via `localStorage`, so language choice survives navigation between pages (with a brief flash-of-JA-default on each fresh page load — P3, cosmetic).

**Newly found this session, not previously documented:**
- **F1 (P1)**: Manager's Add/Edit Staff modal (`staff-form.tsx`) is entirely hardcoded English — no `useLang` import at all — despite being the primary write action on the page Mission 2 just localized.
- **F2 (P1)**: Manager's shift-assignment editor (`shift-cell-editor.tsx`) is likewise entirely hardcoded English — the primary scheduling interaction.
- **F3 (P2)**: Manager's LINE-account-link form (`line-link-form.tsx`) is hardcoded English, including a raw `window.confirm()` dialog string.
- **F4 (P3, documented/intentional)**: `InvitationCell` is deliberately JA-only "per Founder direction" (in-code comment) — silently ignores the EN toggle on the same page. Intentional, but still an inconsistency an EN-toggling user would notice.

**Still open from before (unaffected by these missions):**
- Staff's own profile card (`"My staff profile"`, `"Position"`, `"Employment type"`, `"Status"`) remains English-only — Mission 1's fixes covered shift-preference/work-report/correction-request sections but not the profile card, matching its own commit message scope, not a broken claim.
- `employmentType` remains a raw, unmapped free-text value everywhere it's shown (Staff, Manager, Admin) — **confirmed by design, not a bug**: it's a free-text DB field with no fixed value set to build a label map from, unlike the true enum `attendance_status`.

All machine-translated JA copy in `manager-dashboard-i18n.ts` is self-flagged in the file's own header comment as unreviewed — tagged **NEEDS_NATIVE_JAPANESE_REVIEW** wholesale, per the mission's instruction not to rewrite Japanese in this gate. Two specific strings use a raw ASCII `--` mid-sentence (`publishedReadOnly`, `autoDistributionDescription`), which reads as unnatural to a native speaker — flagged, not fixed.

---

## 13. Empty / Loading / Error States

All four Staff-facing lists (schedule, preferences, work-reports, corrections) and the Manager's decision panels have explicit, non-blank messaging for the empty/unavailable case — no state found that would present as broken. Form submission errors route through dedicated error-description helpers into a visible alert block in each form. No internal/technical error text was found leaking to the user in any reviewed component.

---

## 14. Mobile Baseline

STATIC_VERIFIED, static code review only (no live device/viewport testing performed this session — no browser access).

**No responsive or mobile-specific styling exists anywhere in the four canonical pages.** `lib/ui/theme.ts`'s `pageStyle()` is a single fixed 32px padding with no media query — directly contrasted with the preview reference surface's `lib/demo/cafe/theme.ts`, which explicitly documents a `mobilePageStyle()` with near-edge padding and 56–64px touch targets. `workforce-theme.ts` — the one file both missions touched — added only color/badge helpers, zero mobile accommodation. A repo-wide grep for `@media`, `mobilePageStyle`, or `touch-action` inside `dashboard/**` returns zero matches; only one incidental `minHeight: 44` exists on a single button.

One partial mitigation found: a modal component (`components/demo/cafe/Modal.tsx`) used for Staff's day-cell detail view is itself mobile-aware (bottom-sheet under 640px) — this is new since the 2026-08-15 audit's "no modal pattern" finding, which is now **stale and superseded** (self-correction, per §5 of the Operating Model).

Classified **P2**: real usability degradation for a hourly-staff, phone-first user base, but tables/cards still reflow via `overflow-x: auto` wrappers rather than breaking outright — degraded, not broken.

---

## 15. Tenant / Location / Security Integrity

- `service_role` / `SUPABASE_SERVICE_ROLE_KEY` / `createServiceClient`: 13 matches in `apps/web/src`, every one confirmed by direct read to be a test file or an explicit prohibiting comment. **Zero production usage confirmed** — AGENTS.md rule upheld.
- Neither Mission 1 nor Mission 2 touched `supabase/migrations/**` at all (confirmed via `git show --stat` on both commits) — no new RLS surface to review from these two missions.
- Manager permission gate (`workforce.staff.manage`) and Admin gate (`core.member.invite`) are both checked server-side before any privileged read, fails closed on RPC error.
- No case found where either the Manager or Staff surface can read data that RLS correctly restricts on the other.
- `api.workforce_staff_roster` (migration 0061) remains confirmed unused by any application code — unchanged, Founder decision (wire in or drop) still outstanding, carried forward unresolved from two prior audits.

**SECURITY = PASS** (no new issue found; existing boundaries independently re-confirmed, not merely cited).

---

## 16. Location Fallback Reassessment

Re-verified directly against current code, not inherited from the prior audit's severity.

- **Staff** (`staff/page.tsx`): still lenient — falls back `own location → first active tenant location → tenantLocations[0]` when the employee's own location doesn't resolve. Unchanged line-for-line from the 2026-08-15 audit.
- **Manager** (`manager/page.tsx`): falls back to `first active location → tenantLocations[0]`, with no scoping to the manager's own assignment at all.

**Reachable in a normal single-location cafe?** No differently than the correct answer — with one location, the fallback and the correct value are identical, so this never manifests as a visible defect for the majority-case single-location tenant.

**Multi-location risk**: if an employee's assigned location becomes inactive/removed (a data-maintenance edge case, not a routine one), they would silently see another location's schedule/shift-type data — same-tenant only, no cross-tenant leak, an availability/correctness bug rather than a security boundary break.

**Classification: P2**, not P0/P1 — same conclusion the prior audit reached, re-confirmed rather than escalated or downgraded. **Not a v2.1 blocker.**

---

## 17. Live Clock-In / Clock-Out Decision

**What the current product actually supports**: schedule (assignment/publish) plus manual, after-the-fact work-report entry via a `<input type="time">` field. No live "clock in now" action exists anywhere on the canonical Manager or Staff surface. The only live-punch component (`PreviewClockPanel`) exists exclusively on the preview reference surface, not reachable from production routes. Neither Mission 1 nor Mission 2 touched this.

**Classification: `SHOULD_FOLLOW_V2_1`.**

Evidence for this classification, not an assumption that "workforce software must have clock-in": attendance data can already be captured and written through the same shared write path used everywhere else in the product; nothing is broken or unusable today, only less convenient and more prone to self-reported-time inaccuracy than a live-punch action would be. No commit, doc, or Founder decision found stating live clocking is part of v2.1's promised scope — it was the reference surface's UX advantage, not a stated v2.1 commitment. **Not a v2.1 blocker.**

---

## 18. Commercial Presentability

Grepped all canonical `.tsx` files for `TODO`, `FIXME`, `console.log`, `debugger`, `lorem` — **zero matches**. No placeholder/demo artifacts leaked into the canonical surface. No Russian text anywhere. No obviously broken control found.

The one presentability issue that would embarrass a live demo: switching a Manager's language to Japanese and then clicking "Add staff" or editing a shift lands the user in an English-only modal mid-Japanese-session (F1/F2, §12) — a visible, easily-noticed inconsistency for exactly the audience (a Japanese cafe owner) this product is built for. This is the basis for this gate's one closure-blocking recommendation.

---

## 19. Five-Minute Product Test

**Evidence, not marketing inference**: a Manager landing on the dashboard sees, within one screen, a calm or actionable Attention panel (what needs attention), a staff roster and schedule (what Manager can control), and links to Inventory/Recipes. A Staff member sees their schedule, submitted requests with visible decision states, and a way to report work and request corrections/exchanges. The connective tissue between modules is real (Manager sees Staff preferences and Inventory shortages in one place; Staff's submissions visibly resolve), not merely present as disconnected pages.

Would a Cafe owner understand what ORUWA does, what needs attention, what Staff/Manager can do, and why this beats spreadsheets/messages, within 5–10 minutes? **On the evidence read this session: plausibly yes**, for a Japanese-first cafe owner using the product in Japanese consistently — with the caveat that the two English-only Manager modals (F1/F2) would be the first thing to visibly break that impression the moment they try to act.

---

## 20. Existing Modules Improvement Classification

| Idea | Classification |
|---|---|
| Manager Attention layer | ALREADY_EXISTS (this mission) |
| Manager visibility into shift-exchange requests | ALREADY_EXISTS (this mission) |
| Checklists / Opening / Closing | FUTURE_PRODUCT_CAPABILITY — no directory, route, or table for this exists anywhere in the tree |
| Manuals integration | PARTIAL_CURRENT_CAPABILITY — Recipes/Manuals exists and is reachable from Staff and the Workforce hub, not directly from Manager's own page |
| Staff Report lifecycle (beyond current correction/work-report) | PARTIAL_CURRENT_CAPABILITY — submission + decide + visible-result loop exists for corrections and exchanges; nothing further found or expected |
| Handover | FUTURE_PRODUCT_CAPABILITY — not found anywhere |
| Training / onboarding LMS | FUTURE_PRODUCT_CAPABILITY — not found anywhere |
| Weekly Review | FUTURE_PRODUCT_CAPABILITY — not found anywhere |
| Live clock-in/out | SHOULD_FOLLOW_V2_1 (§17) |
| Inventory improvements (opening/closing check sessions) | DO_NOT_BUILD for v2.1 — explicitly feature-flagged off on the reference surface already; no evidence this is required for v2.1's own promised scope |
| `api.workforce_staff_roster` wiring | POST_V2_1_IMPROVEMENT / Founder decision outstanding (wire in or drop) |

None of these were designed or implemented in this gate.

---

## 21. Defect / Gap Register

| ID | Finding | Type | Severity | Evidence | Blocks v2.1? | Recommended disposition |
|---|---|---|---|---|---|---|
| F1 | Manager Add/Edit Staff modal (`staff-form.tsx`) entirely hardcoded English, ignores JA/EN toggle | PRODUCT_INTEGRITY | **P1** | STATIC_VERIFIED | **Yes** | Fix before v2.1 closure — extend existing `manager-dashboard-i18n.ts` mechanism |
| F2 | Manager shift-assignment editor (`shift-cell-editor.tsx`) entirely hardcoded English | PRODUCT_INTEGRITY | **P1** | STATIC_VERIFIED | **Yes** | Fix before v2.1 closure — same mechanism |
| F3 | Manager LINE-link form hardcoded English, incl. raw `window.confirm()` | PRODUCT_INTEGRITY | P2 | STATIC_VERIFIED | No | Bundle into the same follow-up i18n pass, not urgent enough to block |
| F5 | Admin member table shows raw `tenantKind`/`membershipStatus` DB values | PRODUCT_INTEGRITY/UX | P2 | STATIC_VERIFIED | No | Low-effort follow-up, add label helper |
| MOB-1 | No mobile-responsive styling anywhere on canonical surface | UX | P2 | STATIC_VERIFIED | No | Post-v2.1 polish, degraded not broken |
| CLK-1 | No live clock-in/out on canonical surface | MISSING_REQUIRED_WORKFLOW (borderline FUTURE) | P2 | STATIC_VERIFIED | No | `SHOULD_FOLLOW_V2_1` (§17) |
| LOC-1 | Staff/Manager location fallback is lenient (same-tenant only) | PRODUCT_INTEGRITY | P2 | STATIC_VERIFIED | No | Post-v2.1, or explicit Founder decision to keep as-is |
| STAFF-I18N-1 | Staff profile card remains English-only | PRODUCT_INTEGRITY | P2 | STATIC_VERIFIED | No | Bundle into the i18n follow-up pass |
| ORPHAN-1 | `apps/web/src/app/workforce/page.tsx` + 2 dangling redirects still present, unfixed across 3 missions now | PRODUCT_INTEGRITY | P2 | STATIC_VERIFIED | No | Delete — zero risk, zero inbound links, flagged three times now |
| EXCH-UX-1 | Staff-side exchange decision buried in a modal vs. corrections' persistent table | UX | P3 | STATIC_VERIFIED | No | Optional polish |
| INV-UX-1 | Staff Inventory link has no inline shortage summary | UX | P3 | STATIC_VERIFIED | No | Optional polish |
| F4 | `InvitationCell` is JA-only by explicit Founder direction, silently ignores EN toggle | DOCUMENTATION (intentional) | P3 | STATIC_VERIFIED | No | No action — already a recorded decision |
| I18N-DOC-1 | Stale comment claims Manager dashboard doesn't use `LangProvider` (now false) | DOCUMENTATION | P3 | STATIC_VERIFIED | No | One-line comment fix, any future pass |
| I18N-JA-1 | Two JA strings use raw `--` mid-sentence (unnatural); whole Manager i18n file self-flagged unreviewed MT | POLISH | P3 | STATIC_VERIFIED, NEEDS_NATIVE_JAPANESE_REVIEW | No | Native review pass, not this gate |
| FLASH-1 | Brief flash of JA default before `localStorage` language preference loads | UX | P3 | INFERRED (code path unambiguous, not live-observed) | No | Optional polish |
| DOC-1 | Mission brief/Mission-1 commit message cite `docs/ai/ORUWA_CAFE_V2_1_PRODUCT_UX_RECONCILIATION_AUDIT.md`, which does not exist anywhere in git history | DOCUMENTATION | P2 (governance hygiene) | STATIC_VERIFIED (`git log --all` empty) | No | Founder should confirm whether this doc was lost, never committed, or the citation is simply wrong; do not recreate it speculatively |
| DOC-2 | `docs/QA_ACCESS.md`, referenced by a retained evidence doc as the source of QA credentials, does not exist in this branch's history | DOCUMENTATION | P3 | STATIC_VERIFIED | No | Blocks future live-QA missions from being self-service; Founder should confirm where/how QA credentials are actually issued today |

No P0 finding. No SECURITY or DATA_ISOLATION finding.

---

## 22. P0 Findings

None.

---

## 23. P1 Findings

1. **F1** — Manager Add/Edit Staff modal is entirely hardcoded English, ignoring the JA/EN toggle Mission 2 just added to the surrounding page.
2. **F2** — Manager shift-assignment editor is entirely hardcoded English, same pattern.

Both are the same class of gap (Mission 2 localized the page shell/panels but not two child components it invokes), both are small, bounded, low-risk fixes using the exact mechanism already proven elsewhere on the same page (`manager-dashboard-i18n.ts` + `useLang`) — not new architecture.

---

## 24. P2 Findings

F3, F5, MOB-1, CLK-1, LOC-1, STAFF-I18N-1, ORPHAN-1, DOC-1 (8 items — see §21 table for detail).

---

## 25. P3 Findings

EXCH-UX-1, INV-UX-1, F4, I18N-DOC-1, I18N-JA-1, FLASH-1, DOC-2 (7 items — see §21 table for detail).

---

## 26. Future Product Capabilities — explicitly NOT v2.1 blockers

Checklists/Opening/Closing, Training/onboarding LMS, Weekly Business Review, Handover, CRM, Loyalty, LINE customer engagement, advanced analytics, purchasing/supplier management, waste management, advanced Inventory (opening/closing check sessions — already flagged off on the reference surface), Platform Billing, Customer Portal, ORUWA Platform Admin, live clock-in/out (classified `SHOULD_FOLLOW_V2_1`, not required). Also carried forward, unaffected by this gate: Defect C (no self-service invite-recovery path), Surface A's long-term retain/retire status (Founder decision still outstanding).

---

## 27. What Should NOT Be Built Before v2.1 Closure

- No new Attention signal types beyond the three already shipped.
- No modal/detail-overlay redesign of Staff's remaining flat sections — a modal pattern already exists for day-cell detail; further density work is P3 polish, not a blocker.
- No mobile redesign — MOB-1 is real but P2, not urgent enough to gate closure.
- No live clock-in/out implementation as part of v2.1 closure — classified `SHOULD_FOLLOW_V2_1`, i.e. the next mission after closure, not inside it.
- No rewrite of any Japanese copy in this pass — native review is a separate, explicitly scoped task.
- No deletion of Surface A/A′ — retain/retire remains an open Founder decision, unaffected by this gate.

---

## 28. Exact Remaining v2.1 Closure Scope

The smallest evidence-supported set of work that must complete before v2.1 can close:

1. **Localize `staff-form.tsx` (Manager Add/Edit Staff modal)** using the existing `manager-dashboard-i18n.ts` + `useLang` mechanism already proven on the same page. (F1, P1)
2. **Localize `shift-cell-editor.tsx` (Manager shift-assignment editor)** using the same mechanism. (F2, P1)

That is the entire genuine blocker list. Everything else in §21 is P2/P3, previously documented or newly found but not release-blocking under the mission's own anti-scope-creep rule (§24 of the mission brief): none of the P2/P3 items would leave a real cafe unable to use, trust, understand, or responsibly buy the current promised product.

---

## 29. Founder Decisions Required

1. **`docs/ai/ORUWA_CAFE_V2_1_PRODUCT_UX_RECONCILIATION_AUDIT.md`** (DOC-1) — confirm whether this document was ever actually written/committed, or whether Mission 1's commit message cited the wrong filename. This affects trust in the evidence chain for future missions, not this gate's verdict.
2. **QA credentials** (DOC-2) — confirm where disposable QA identities for live browser verification are maintained today, since `docs/QA_ACCESS.md` does not exist in this branch and no live QA was possible this session as a result.
3. **`api.workforce_staff_roster`** — wire it into application code or drop it (carried forward, unresolved across three audits now).
4. **Surface A's long-term retain-vs-retire status** — still open, unaffected by this gate, carried forward from `docs/ai/current-task.md` §2.3.
5. **Live clock-in/out timing** — confirm `SHOULD_FOLLOW_V2_1` is the right call, i.e. it becomes the next mission after v2.1 closes, not a requirement inside closure.

None of these block the verdict in §1 or the scope in §28 — they are open items for the Founder's own tracking, not blockers this gate is asserting.

---

## 30. Final Gate Matrix

```
SECURITY                    = PASS
TENANT_ISOLATION             = PASS
ROLE_BOUNDARIES               = PASS
MANAGER_WORKFLOW               = PASS (localization gap noted, not a workflow break)
STAFF_WORKFLOW                  = PASS
MANAGER_STAFF_CLOSED_LOOPS       = PASS
ATTENTION_LAYER                   = PASS
INVENTORY                          = PASS
RECIPES_MANUALS                     = PASS
LOCALIZATION                         = FAIL (F1/F2 — bounded, two-component fix)
MOBILE_BASELINE                       = PASS (degraded, not broken; P2 polish)
COMMERCIAL_PRESENTABILITY               = PASS (contingent on F1/F2 closing — a live JA demo would visibly hit them)
PRODUCT_COHERENCE                        = PASS
```

---

## 31. Final Verdict

```
B. CAFE_V2_1_READY_AFTER_BOUNDED_FIXES
```

**Exact bounded fixes required:**
1. Localize `apps/web/src/app/(protected)/dashboard/workforce/manager/staff-form.tsx` via the existing `manager-dashboard-i18n.ts`/`useLang` mechanism.
2. Localize `apps/web/src/app/(protected)/dashboard/workforce/manager/shift-cell-editor.tsx` via the same mechanism.

No RLS, migration, Auth, security, or architectural change is required for either fix — both reuse a mechanism already proven correct on the same page this session.

---

## 32. Recommended Next Mission

**One mission**: a small, bounded closure mission scoped to exactly F1 and F2 (§28) — localize the two remaining hardcoded-English Manager sub-components using the existing i18n mechanism, verify via the existing `manager-dashboard-i18n.test.ts` pattern, and re-run CI. Do not fold in any P2/P3 item from this register; those remain candidates for a future, separately-scoped polish mission.

Once that closure mission merges, recommend proceeding to Founder Acceptance for Cafe v2.1 — this gate found no other blocker.

---

## Repository state at close of this gate

- Branch used for inspection: `dev-audit-readonly`, tracking `origin/dev` @ `7c82e6d`, working tree clean throughout, no commits made.
- No PR opened by this mission (none needed — this is a documentation-only, read-only report).
- No code, migration, RLS, Auth, or configuration changed.
