# current-task.md §2.3 and §2.4 archive (Cafe v2.1 closure, Commercial Launch Readiness)

**ARCHIVE. Historical record, NOT current state.** Moved verbatim on
2026-09-19 out of `docs/ai/current-task.md` when that file was reduced to a
current-state document. Both sections were already partly stale when moved
(§2.4 itself carries a "superseded ordering" notice). A short summary of
each remains in `docs/ai/current-task.md` §2.3 and §2.4.

---

### 2.3 Whole-Product Gate and Final Bounded Closure

The Whole-Product Integrity & Completeness Gate completed after PR #240 with
verdict `CAFE_V2_1_READY_AFTER_BOUNDED_FIXES`: **P0 = 0, P1 = 2**. Full
evidence and the durable P2/P3 register are in
`docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`.

The only authorized implementation closure scope is:

1. **F1** — localize the Manager Add/Edit Staff modal.
2. **F2** — localize the Manager Shift Cell Editor.

Implementation merged into `dev` through PR #241 (`ed1de927`); CI and Vercel
passed. **Authenticated Preview QA, independent review, and Final Founder
Acceptance have since completed** (2026-08-16): both F1 and F2 verified
PASS live on `preview.oruwa.jp` (JA rendering confirmed in the Add/Edit
Staff modal and the shift-assignment editor, persisted across reload), no
P0/P1 regression found. Full evidence:
`docs/product/cafe-package-v2-1-final-founder-acceptance-2026-08-16.md`.
**Cafe v2.1 is CLOSED on this basis.**

Known P2/P3 findings remain durable **Cafe Hardening / Deferred Debt**. They
are not fixed, forgotten, or release blockers, and they are not automatically
authorized as the next mission. Cafe Product Growth (Checklists, Manuals
integration, report/problem lifecycle, lightweight Training, Weekly Review,
Inventory improvements) is a separate post-v2.1 candidate category. The IA/
navigation and visual/UX reconciliation of the canonical surface against the
Surface A reference (route naming, mobile styling, presentation polish) is
also not started by this closure — it is planned future work
(`docs/strategy/go-to-market-roadmap.md` §3; `../ORUWA-info.md` §15 Horizon
B) and requires its own bounded Product/Founder decision to begin, same as
any other post-v2.1 category.

### 2.4 Cafe Commercial Launch Readiness (separate, higher gate — step 1 in progress)

**Superseded ordering notice (2026-08-25):** the "Sequence (recommended)"
step 2 below ("Platform Foundation critical path" right after step 1's
Cafe IA/visual reconciliation, i.e. before any Cafe v2.2/Product-Growth
work) is **superseded** by `docs/strategy/oruwa-master-roadmap.md`
(Founder-approved 2026-08-25), which places Cafe v2.2 Product Research/
Implementation/Acceptance (its Phases 2-4) and SaaS Hardening (Phase 5)
*before* Platform Foundation Reconciliation (Phase 6). This also matches
the Founder's 2026-08-23-stated roadmap (see the
`project_roadmap_v21_v22_provisioning_sales` memory: v2.1 -> v2.2 ->
hardening -> ...). The step 1 content below (Cafe IA/visual reconciliation,
mechanical items, Hardening register) remains factually accurate and
still-relevant detail — only its position relative to Platform Foundation
in the "Sequence (recommended)" list is stale. Read
`docs/strategy/oruwa-master-roadmap.md` for the current phase order; this
section stays as a historical record of what step 1 actually contained.

**"Cafe v2.1 CLOSED" (§2.3) is a bounded, code-scoped closure — F1/F2 only,
against the frozen Whole-Product Gate backlog.** It is not the same claim as
"Cafe is ready to sell." Founder decision 2026-08-16: a distinct, higher gate
— **Cafe Commercial Launch Readiness** — must pass before Cafe is treated as
commercially launch-ready. This gate is intentionally **not** folded back
into "Cafe v2.1," because it bundles two different kinds of work with
different owners and timelines:

- **Cafe-specific work** (belongs to this product, no other vertical depends
  on it): IA/route reconciliation (`/dashboard/workforce/manager` is
  internal/technical, not decided customer-facing IA) and visual/UX
  reconciliation of the canonical surface against the Surface A reference,
  plus the remaining Cafe Hardening / Deferred Debt items above.
- **Platform-wide work** (not Cafe-specific — required by any future
  vertical, tracked at Horizon C / `docs/foundation/platform-foundation-roadmap.md`,
  not owned by a Cafe mission): the accepted critical path Entitlements
  engine → Module Registry → Shared Navigation/Settings → Notifications →
  Event Bus.

Recording both under a single "Cafe v2.1" label would conflate one
product's versioning with platform-wide infrastructure completion — this
gate exists precisely to avoid that conflation while still giving the
Founder the single "is it actually ready to launch" answer they asked for.

Sequence (recommended):

1. Cafe IA/visual reconciliation + remaining Cafe Hardening items (one
   focused pass, same surface). **In progress, partially complete as of
   2026-08-16:**
   - **Done, merged to `dev`:** IA/route reconciliation
     (`/dashboard/workforce/{manager,staff}` → `/manager`, `/staff`, old
     paths redirect, PR #246); `ORPHAN-1` (dead `/workforce` stub deleted,
     PR #246); `STAFF-I18N-1` expanded (whole Workforce landing hub now
     JA/EN, not just the profile card, PR #246); `F3` (Manager LINE-link
     form localized, PR #246); `I18N-DOC-1` (stale comment fixed, PR #246);
     `F5` (Admin member table `tenantKind`/`membershipStatus` localized, PR
     #247); `MOB-1` (wide tables on Manager/Staff contained to their own
     horizontal scroll instead of moving the whole page at 390px, PR #248).
     Each PR passed typecheck/lint/1089–1091 tests/build plus live
     authenticated Preview QA before merge.
   - **Also done, merged, and deployed** (Founder-approved 2026-08-16,
     each decision item resolved individually rather than deferred as a
     block):
     - Visual/brand reconciliation: `@/lib/ui/theme.ts`'s palette replaced
       1:1 with `@/lib/demo/cafe/theme.ts`'s warm/light tokens (the Surface
       A reference), PR #250. No call-site changes needed; repaints the
       whole canonical dashboard. Live-confirmed against the reference
       tenant.
     - `LOC-1`: Manager/Staff location resolution now fails closed (exactly
       one active location for Manager; the employee's own active location
       for Staff), matching the Surface A reference's existing behavior,
       PR #251. Live-confirmed no behavior change on the single-location
       reference tenant.
     - Defect C (onboarding-interruption half): new Manager-triggered
       "アクセスを回復" action sends a real Supabase password-recovery
       email to a first-time hire whose Auth identity was confirmed but
       who never finished password setup — closes the gap the normal
       resend path cannot (it deliberately sends nothing to an
       already-registered Auth user, Founder decision 8). Code in PR #252;
       the required `supabase functions deploy invite-employee` to the
       Cloud dev project (`pehcoenozjtsjdvjietj`) was run and separately
       approved 2026-08-16. Live-confirmed end-to-end on the reference
       tenant: clicking the action against the now-deployed function
       returns the `recovery_email_sent` outcome (actual email delivery
       not independently verified — no test-inbox access — but the server
       round-trip proves the deployed function recognizes
       `action: 'recover'`).
   - **Still open, needs a Founder decision before any code change**: full
     visual/brand reconciliation is done (see above); the remaining
     decision items are `I18N-JA-1` (native Japanese copy review — needs a
     native speaker, not code, not something an AI agent session can
     close) and Surface A retain-vs-retire timing (whether/when to remove
     the `%5Fclient-preview/mame-to-cha/**` reference surface now that
     Surface B has closed the P1/P2 gaps that motivated keeping it as a
     UX/acceptance reference — a product decision, not a code change by
     itself). `F4` (`InvitationCell` JA-only) was intentional per an earlier
     Founder scope decision, but is now superseded: the Founder asked
     2026-08-21 (during the Cafe Manager UI/UX Parity mission's Manage
     Staff redesign) for `InvitationCell` to be localized like the rest of
     the now-bilingual Manage Staff popup, closed the same day.
2. Platform Foundation critical path (per the already-accepted document;
   this work is not blocked by step 1 and could run in parallel, but
   sequential is preferred here to avoid re-creating the "audit → fix →
   next audit finds a neighbor problem" context-blur pattern this project
   has already hit more than once). Not started.
3. New-Tenant / One-Hour Provisioning Test (`docs/strategy/go-to-market-roadmap.md`
   §7) — creating a genuinely new tenant with zero application-code changes
   is the actual evidence this gate exists to produce, not a formality. Not
   started.
4. A single combined QA + Founder acceptance pass over the result of 1–3,
   not a re-run of the narrow F1/F2-style acceptance from §2.3. Not started.

None of the still-open items in step 1, or steps 2–4, is authorized to
start by this entry alone — the Founder selects which one begins next (see
§5).
