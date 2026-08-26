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

## Status

Open. Not authorized to start by this document alone — a separate, small,
explicitly scoped task/PR when picked up next.
