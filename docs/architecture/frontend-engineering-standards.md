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

- Modals/dialogs: use the shared `Modal` component; consistent open/close/
  Escape/backdrop behavior everywhere.
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
