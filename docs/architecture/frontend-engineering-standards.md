# Frontend Engineering Standards

## Document Metadata

| Field | Value |
|---|---|
| Status | Living |
| Level | Architecture detail (`CLAUDE.md` "Source of truth" §6) — subordinate to Foundation, ADRs, and `docs/security/security-requirements.md` |
| Owner | Founder / CTO |
| Origin | Migrated verbatim in substance from `docs/AI_PLAYBOOK.md` §4–6 (engineering decision standard, performance patterns, UX implementation standard) during the ORUWA AI Governance Consolidation, Phase 2C. These sections were confirmed unique — not duplicated in `docs/foundation/oruwa-engineering-principles-and-governance.md` (which covers architecture/module/database/security governance, not component-level engineering or UX implementation detail) or any other canonical document. |
| Supersedes | `docs/AI_PLAYBOOK.md` §4–6 |

This document does not restate architecture, security, or database rules —
those live in `docs/foundation/oruwa-engineering-principles-and-governance.md`,
`.cursor/rules/*`, `AGENTS.md`, and `docs/security/security-requirements.md`.
It covers durable, code-level engineering and UX-implementation standards
that apply across ORUWA's frontend and general implementation work,
independent of any one mission.

## 1. Engineering decision standard

For implementation or recommendation work:

1. Inspect the current implementation first — do not assume.
2. Establish evidence before proposing a change.
3. Check whether a current, modern implementation provides a real, measurable
   advantage over what exists.
4. Prefer the simplest production-grade solution.
5. Prefer native platform/browser capabilities when they are sufficient.
6. Do not introduce libraries/frameworks for fashion or novelty.
7. Measure before optimizing.
8. Preserve proven working architecture.

For UX/technical decisions, benchmark interaction and engineering patterns
used by strong modern products (e.g. Linear, Notion, GitHub, Figma, Slack,
Google Workspace, Apple, Stripe, Shopify, Vercel) — never copy their visual
design, only proven patterns with measurable benefit for ORUWA.

Every recommendation must state: evidence, expected benefit, complexity,
risk, and why it fits ORUWA. If no meaningful benefit exists: **keep the
current implementation.**

## 2. Proven performance patterns

- Avoid duplicate data fetches for the same data in one request/render cycle.
- Avoid unnecessary request waterfalls; parallelize independent work.
- Do not resolve the same auth/tenant/membership context twice in one request.
- State needed across a modal's close/reopen cycle must live above the
  component that unmounts on close, not inside it.
- Do not regenerate signed URLs on every modal open; reuse until they expire.
- Use delta/targeted refresh when only one record changed, not a full refetch.
- Image/list loading must be viewport-aware, not an arbitrary "first N eager"
  rule; prefer native lazy loading when it is sufficient.
- Reserve image geometry (explicit width/height or aspect-ratio) to avoid
  layout shift.
- Any visible operation that takes noticeable time needs clear pending/loading
  feedback.
- Do not add caching, virtualization, queues, or similar infrastructure
  without evidence that it is actually needed.

## 3. UX implementation standard

- Modals/dialogs: use `@line-os/ui`'s `Dialog`/`ConfirmDialog` (Radix-based,
  §4) for new/touched code; consistent open/close/Escape/backdrop behavior
  everywhere. `components/shared/design-kit/Modal` is legacy (no focus trap,
  no scroll lock, `document`-level Escape unaware of nesting) — do not add
  new call sites; migrate on touch.
- Focus/keyboard: sensible focus trap and return-focus-on-close; Escape
  closes non-destructive dialogs.
- Forms: label every field, validate before submit, preserve user input on
  validation failure.
- Destructive actions require an explicit confirmation step; never require
  optimistic UI for dangerous/non-reversible actions.
- Loading: skeletons or spinners for real waits — **the UI must never appear
  frozen during a real wait.**
- Empty states and error states must be explicit, not a blank screen.
- Mutations that succeed give visible success feedback.
- Responsive/mobile usability and basic accessibility (contrast, focus
  visibility, tap targets) apply to every customer-facing screen.
- Never degrade existing UX in service of new architecture — architecture
  should stay invisible to the operator using the product; anything a system
  does automatically (translation, auto-numbering, background recalculation)
  should be observable only in its effect, never its mechanism, on a screen a
  non-technical operator uses.

## 4. Design System v1 (ORUWA Product Quality Foundation)

Decided by the technical + browser/UX audits of 2026-09-10
(`docs/ai/ORUWA_DESIGN_SYSTEM_TECHNICAL_AUDIT_2026-09-10.md`,
`docs/ai/ORUWA_BROWSER_VISUAL_UX_PRODUCT_AUDIT_2026-09-10.md`) and
implemented the same day (Design System v1 Foundation + Operations pilot).

**Mechanism**: `@line-os/tokens` (primitives → semantic roles → generated
`--oruwa-*` CSS custom properties, `docs/design/tokens.md`) → Tailwind v4
(`apps/web/src/app/globals.css`'s `@theme inline` maps Tailwind utilities
onto the existing `--oruwa-*` variables — no duplicated token source) →
Radix Primitives (unstyled, the accessibility engine — focus trap, scroll
lock, keyboard nav, portal, stack-aware dismiss) → `@line-os/ui` (the
ORUWA-owned component layer: `Button`/`IconButton`, `Field`, `Input`/
`Textarea`/`NumberInput`, `Select`, `Checkbox`, `StatusBadge`/`CountBadge`/
`Tag`/`MetadataText`, `InlineAlert`, `Dialog`, `ConfirmDialog`,
`SegmentedControl`, `Tooltip`, `Menu`, `ListRow`, `FormActions`,
`EmptyState`, `Skeleton`/`SkeletonLines`) → feature code.

- Tailwind coexists with the ~1,900 existing inline `style={{}}` call sites —
  no big-bang migration. New/touched code uses `@line-os/ui` + Tailwind
  classes reading the token-backed utilities (`bg-accent`, `text-text-muted`,
  `shadow-card`, etc.); legacy inline styles keep working via
  `apps/web/src/lib/ui/theme.ts` until migrated on touch.
- **Status/Metadata/Action model** (required going forward on any surface
  using these primitives): `StatusBadge` is for a real lifecycle/severity
  state that needs interpretation (tones `neutral/info/success/warning/
  critical/muted`, with an icon in addition to color on the three alert
  tones); `MetadataText` is plain text for due time/category/location —
  never a pill; `CountBadge` is a numeral summary; `Tag` is user
  classification; an actionable affordance is a `Button`/`IconButton`/`Menu`
  item, never a badge.
- `Dialog`/`ConfirmDialog` correctly nest (Radix's layer stack — an inner
  dialog's Escape/outside-click only dismisses itself). A legacy
  `design-kit/Modal` or `ConfirmDialog` nested *inside* a new `Dialog` does
  **not** get this for free (its own `document`-level Escape listener is
  unaware of Radix's stack) — make the outer `Dialog` non-dismissible
  (`dismissible={false}`) while the legacy child is open, or migrate the
  legacy child too. See `template-detail-modal.tsx` for the guard pattern.
- Component contracts, evidence, and the full v1 component list:
  `docs/ai/ORUWA_DESIGN_SYSTEM_TECHNICAL_AUDIT_2026-09-10.md` §9–§11.
  Deferred items (dark mode, Storybook, full legacy migration, demo/preview
  tree consolidation) are out of v1 scope by design, not oversight.
- **Toast**: the audit (§10/P1-5) flagged that `components/shared/design-kit/Toast`'s
  `ToastProvider` existed and worked but was never mounted anywhere. Fixed by
  mounting it once in `apps/web/src/app/(protected)/layout.tsx` — the
  existing design-kit `Toast`/`useToast()` stays canonical; it was NOT
  rebuilt in `@line-os/ui` (already token-styled, already accessible
  `aria-live`, no evidence a Radix-based rebuild adds anything). New/touched
  code should call `useToast()` for success/error feedback rather than an
  ad-hoc banner.
- **Radio/RadioGroup, Switch**: not built in v1 — no current Operations-pilot
  or other touched-surface call site needed them (evidence-based v1 scope,
  mission §10 "implement the minimum coherent set", not an oversight). Add
  when a real call site needs one.
