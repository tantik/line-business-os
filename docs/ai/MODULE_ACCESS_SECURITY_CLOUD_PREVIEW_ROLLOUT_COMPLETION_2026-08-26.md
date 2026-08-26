# MODULE ACCESS SECURITY — CLOUD/PREVIEW ROLLOUT COMPLETION (2026-08-26)

This is a **rollout completion record**, not a rewrite of
`docs/ai/MODULE_ACCESS_SECURITY_REMEDIATION_COMPLETION_REPORT_2026-08-26.md`
(the "REMEDIATION" report). That report covers implementation/testing/review/
merge of migrations `0093`-`0098` to `dev` — read it first for the security
design itself. This document records the separate, later step: the Founder
manually applying those six migrations to the linked Supabase Cloud dev
project and doing a live Preview click-through, after the mission's own
report explicitly left "Remote DB apply" and "Live/Preview verification" as
open items (see that report's §9).

Everything below was reported to the Lead Agent by the Founder, who executed
these steps directly. The Lead Agent did not run any of the commands or
browser actions in §2-§4 itself and did not independently re-verify Cloud
state as part of writing this document.

## 1. Pre-rollout local backup (Founder-reported)

Before rollout, the Founder created a local pre-rollout dump:

- `D:\Dev\oruwa-backups\2026-08-26-pre-module-security\schema.sql` — 302449 bytes
- `D:\Dev\oruwa-backups\2026-08-26-pre-module-security\data.sql` — 363892 bytes

This is a **local dump taken by the Founder before rollout**, not a Supabase
managed/PITR backup and not a claim about Supabase's own backup system. These
files are not part of this repository and are not added to git by this PR.

## 2. Remote migration preflight (Founder-reported)

`supabase migration list` before rollout showed the Cloud dev project's
remote ledger applied through `0092` inclusive; `0093`-`0098` existed only
Local.

`supabase db push --dry-run` showed exactly these six pending migrations, in
this order:

1. `0093_core_has_module_access.sql`
2. `0094_purchases_module_access_gate.sql`
3. `0095_inventory_module_access_gate.sql`
4. `0096_booking_module_access_gate.sql`
5. `0097_workforce_module_access_gate.sql`
6. `0098_ai_module_access_gate.sql`

This matches exactly the six migrations from the REMEDIATION report's §2
status matrix — no unrelated migration was pending or applied.

## 3. tenant_modules / business-data preflight (Founder-reported)

Before rollout, tenant module-enablement and data presence were checked
directly:

**mame-to-cha**
- `workforce` = true, `inventory` = true, inventory data exists
- `purchases` data absent
- `booking` module row missing, booking data absent
- `ai` module row missing, ai data absent

**oruwa-cafe**
- `core` = true, `workforce` = true, `inventory` = true, inventory data exists
- `purchases` data exists
- `booking` module row missing, booking data absent
- `ai` module row missing, ai data absent

**smoke-tenant-a / smoke-tenant-b**
- `workforce` = true
- `inventory` module missing, inventory data absent
- `purchases` data absent
- `booking` module missing, booking data absent
- `ai` module missing, ai data absent

**Conclusion drawn from this preflight**: across every tenant checked, no
case existed of "module row missing + pre-existing business data" for
Inventory, Booking, or AI. This is a preflight observation about the
tenants checked, not a claim covering every conceivable tenant/data
combination in the Cloud project.

## 4. Actual Cloud rollout (Founder-reported)

The Founder ran:

```
pnpm exec supabase db push
```

The CLI applied the six migrations in sequence — `0093`, `0094`, `0095`,
`0096`, `0097`, `0098` — and completed with `Finished supabase db push.`

## 5. Post-rollout migration verification (Founder-reported)

After rollout, `pnpm exec supabase migration list` showed full Local =
Remote agreement through `0098 | 0098`.

## 6. Live Preview verification — Workforce (Founder-reported)

Verified live cycle on Preview:

- **Workforce ON** → Staff works, shows existing data.
- **Workforce OFF** → `/staff` shows: "Feature unavailable" / "This feature
  is not enabled for your workspace. Ask an administrator to enable it."
  Operational Workforce data is not shown. Browser console showed no
  errors/warnings.
- **Workforce ON again** → Staff fully restored, schedule and existing data
  returned, no data loss, console still clean.

This confirms the live ON → OFF → ON lifecycle with data preserved, for
Workforce specifically, on Preview.

## 7. Live Preview verification — Inventory + Purchases (Founder-reported)

**Inventory OFF:**
- The main Workforce/Staff page kept working.
- Inventory disappeared from available actions.
- Purchases remained visible, but opening it showed: "Purchases is
  temporarily unavailable." Console showed no errors/warnings.

**Inventory ON again:**
- Inventory reappeared, Purchases opened again, and prior Inventory/
  Purchases data was intact and accessible.

**Conclusion**: the Inventory module gate works live on Preview. Purchases
is in fact blocked together with Inventory (its RLS/RPC rides Inventory's
own module flag, per the REMEDIATION report §2/§3 design) — but see §9 below
for a UX-level inconsistency this surfaced (Purchases' entry-point button
staying visible while its content is blocked).

## 8. What this document does and does not claim

**VERIFIED LIVE (this rollout, Preview/Cloud):**
- Migration application (`db push` completed, six migrations applied in
  order).
- Post-rollout migration ledger (Local = Remote through `0098`).
- Workforce UI lifecycle (ON → OFF → ON), data preserved, no console errors.
- Inventory UI lifecycle (ON → OFF → ON), data preserved, no console errors.
- Purchases' dependency on Inventory's module flag, observed live.

**VERIFIED LOCALLY (carried over from the REMEDIATION report, not re-run
here):**
- The detailed pgTAP security matrix for all six domains (Core, Purchases,
  Inventory, Booking, Workforce, AI) from WP-S1 through WP-S6 — see that
  report's §2-§6.

**NOT LIVE-TESTED (explicitly out of scope for this rollout's acceptance):**
- Every direct PostgREST/RPC bypass path individually (only the UI-level
  ON/OFF/ON cycle was exercised for Workforce and Inventory).
- Booking ON/OFF live behavior — not exercised this rollout.
- AI ON/OFF live behavior — not exercised this rollout.
- Production — there is no production database; production remains
  separately gated and untouched.

This document does **not** claim a 100% Cloud security penetration test.
Acceptance here is scoped to: migrations applied correctly, ledger consistent,
and the two domains actually click-tested (Workforce, Inventory/Purchases)
behave correctly live with no data loss and no console errors.

## 9. Known follow-up spun out of this rollout

Purchases' entry-point button on the Staff dashboard stays visible and
clickable when Inventory is OFF, even though opening it then shows
"Purchases is temporarily unavailable." The security boundary itself is
correct (RLS/RPC access is genuinely blocked) — this is a UX/product-
consistency gap, not a security gap. See
`docs/ai/PURCHASES_VISIBILITY_INVENTORY_OFF_FOLLOWUP_2026-08-26.md` for the
scoped follow-up. This document does not implement that fix.

## 10. Final status

- **Module Access Security Remediation**: COMPLETE (per the REMEDIATION
  report, unchanged by this document).
- **Cloud Dev migration rollout**: COMPLETE — migrations `0093`-`0098`
  applied to the linked Supabase Cloud dev project, ledger verified
  Local = Remote.
- **Preview acceptance**: PASS for the tested scenarios — Workforce
  ON/OFF/ON lifecycle, Inventory/Purchases ON/OFF/ON lifecycle and
  dependency behavior, data preservation, no browser console errors in the
  tested paths.
- **Production**: NOT TOUCHED / NOT APPLICABLE — no production database
  exists for this project; `main` was not touched by this rollout.
- **Remaining security remediation work**: NONE discovered within this
  rollout's scope.
- **Known follow-up**: Purchases visibility when Inventory is OFF — UX only,
  tracked separately (§9), not folded into this closure and not
  auto-carried into the next product mission.

## 11. Explicit non-changes in this rollout / this PR

- No migration file was added, edited, or reordered by this PR or this
  rollout beyond the six already-merged migrations (`0093`-`0098`) applying
  cleanly to Cloud dev.
- No RLS policy was changed by this PR.
- No `tenant_modules` row was toggled by this PR (the ON/OFF/ON cycles in
  §6-§7 were live Preview clicks performed by the Founder as verification,
  not a change this PR makes or claims ownership of).
- No `db push` was run by this PR/session — the push described in §4 was
  executed by the Founder, reported here after the fact.
- `main` was not touched.
