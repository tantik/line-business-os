# FOLLOW-UP: Purchases visibility when Inventory module is OFF (2026-08-26)

Small, scoped follow-up item spun out of
`docs/ai/MODULE_ACCESS_SECURITY_CLOUD_PREVIEW_ROLLOUT_COMPLETION_2026-08-26.md`
§7/§9. This document records the issue and its scope only — **it does not
implement a fix.**

## Observed behavior (Preview, Founder-verified)

With Inventory OFF for a tenant:

- The Inventory entry-point action correctly disappears.
- The Purchases entry-point action **remains visible**.
- Opening Purchases shows: "Purchases is temporarily unavailable."

The security boundary is correct — Purchases' RLS/RPC access already gates
on `core.has_module_access(tenant_id, 'inventory')` (Purchases has no
separate `core.module_code`; see
`docs/ai/MODULE_ACCESS_SECURITY_REMEDIATION_COMPLETION_REPORT_2026-08-26.md`
§2/§3). **This is not a security vulnerability.** It is a UX/product
consistency gap: an action is shown as available when it is not.

## Root cause, as found by inspection (not yet fixed)

`apps/web/src/app/(protected)/staff/staff-dashboard-client.tsx` builds the
Staff dashboard's `EntryPointsCard` button list. The Inventory button is
conditionally included via `...(inventoryEnabled ? [...] : [])`
([staff-dashboard-client.tsx:530-541](../../apps/web/src/app/(protected)/staff/staff-dashboard-client.tsx#L530-L541)),
but the Purchases button right after it is included unconditionally
([staff-dashboard-client.tsx:542-549](../../apps/web/src/app/(protected)/staff/staff-dashboard-client.tsx#L542-L549)).

For comparison, `apps/web/src/app/(protected)/manager/manager-dashboard-client.tsx`
**already** wraps its Purchases button in the same `inventoryEnabled` gate as
Inventory itself
([manager-dashboard-client.tsx:987-998](../../apps/web/src/app/(protected)/manager/manager-dashboard-client.tsx#L987-L998)).
So Manager's dashboard does not have this inconsistency — only Staff's does.

This is stated as **what this session's inspection found**, not a
prescription for the eventual fix's exact diff — a future implementer should
re-inspect the current code before changing anything, since this document
may go stale.

## Desired behavior

If Purchases fully rides Inventory's own module flag under the current
ownership model, then when Inventory is OFF, Purchases should not appear
available either.

Preferred MVP behavior: gate the Purchases entry-point action behind the
same `inventoryEnabled` condition already used for Inventory (matching the
pattern Manager's dashboard already uses).

## Scope for the eventual fix

- **In scope**: UI/app-layer only (entry-point visibility), and only if
  inspection at implementation time confirms this is still the right/only
  place — do not assume this document's line numbers still apply without
  re-checking.
- **Out of scope**: any RLS or migration change; any new `core.module_code`
  value; creating a standalone Purchases module; any change to the existing
  security ownership model (Purchases continues to ride Inventory's module
  flag).

## Resolution (2026-08-28)

**CLOSED.** Fixed exactly as the "Desired behavior" section prescribed.

- **Root cause:** UI-only. `staff-dashboard-client.tsx`'s `EntryPointsCard`
  button list gated the Inventory button behind `...(inventoryEnabled ? [] : [])`
  but included the Purchases button unconditionally. Manager's dashboard
  already gated both. `inventoryEnabled` is derived server-side in
  `staff/page.tsx` from the `inventory` module flag.
- **Files changed:**
  - `apps/web/src/app/(protected)/staff/staff-dashboard-client.tsx` — wrap the
    Purchases entry-point button in the same `inventoryEnabled` guard as
    Inventory. PurchasesPopup's "temporarily unavailable" fallback left intact
    for other failure scenarios.
  - `apps/web/src/app/(protected)/staff/staff-dashboard-client.test.ts` —
    source-text regression guard asserting both actions are gated and Purchases
    is not an unconditional entry.
- **Tests:** new guard runs via the existing `pnpm --filter @line-os/web test`
  script (file already listed). Full suite 1267 pass; typecheck, lint, build
  all green.
- **Reviewer:** independent fresh-context review — PASS, no findings (UI-only
  confirmed, no backend/RLS/migration/ownership change, Inventory ON unchanged,
  Inventory OFF hides both, fallback kept, no scope creep).
- **PR:** #457 → `dev`.
- **Merge:** autonomous DEV merge via `scripts/ai-dev-merge.sh` (UI-only
  STANDARD fix, all gates green, reviewer PASS).
- **Security/RLS/DB:** NOT CHANGED.
- **Live verification:** Inventory ON state only (no Cloud `tenant_modules`
  write performed). Live Inventory OFF acceptance relies on the Founder's
  existing rollout verification plus the new automated regression test; not
  re-tested live after the fix.
