# MODULE_ACCESS_SECURITY_REMEDIATION_COMPLETION_REPORT (2026-08-26)

Closing report for the Module Access Security Remediation mission (WP-S1
through WP-S6). Per the mission's own governance rules, this file is the
final deliverable; once the Founder accepts it, this mission is CLOSED — no
further work under this mission name is authorized. This is not the trigger
to start Cafe v2.2 WP1 Foundation Prerequisite, or any other next mission —
that remains a separate, later Founder decision.

## 1. Mission objective (recap)

Every tenant has a `core.tenant_modules` row per module (`is_enabled`
boolean). Before this mission, RLS/RPC/view access across every domain
(Purchases, Inventory, Booking, Workforce, AI) was gated only by
`core.has_permission(...)`/self-scope predicates — a tenant with a module
turned OFF (or never provisioned) still had full tenant-facing access to
that domain's data, as long as the caller held the right permission. This
mission closed that gap: turning a module OFF now blocks tenant-facing
reads/writes/RPCs for that domain, while preserving existing data and
restoring access unchanged when the module is turned back ON. The
three-layer security model enforced throughout:

```
Module access (core.has_module_access)
AND
Permission (core.has_permission / core.has_permission_in_tenant / self-scope)
AND
Domain rule (status/ownership/location/etc., unchanged by this mission)
```

## 2. Final status matrix

| Domain | Implemented | Tested (local pgTAP) | Reviewed (independent) | Merged | Remote DB applied | Live-verified (Preview/Cloud) |
|---|---|---|---|---|---|---|
| **Core helper** (`core.has_module_access`) | YES — `0093_core_has_module_access.sql` | YES — 21 assertions, `0040_core_has_module_access.sql` | PASS | **YES**, PR #448, `7fe8daf` | NO | NO |
| **Purchases** | YES — `0094_purchases_module_access_gate.sql` | YES — `0041_purchases_module_access_gate.sql` | PASS | **YES**, PR #449, `c993f6d` | NO | NO |
| **Inventory** | YES — `0095_inventory_module_access_gate.sql` | YES — `0042_inventory_module_access_gate.sql` | PASS (2 rounds — a near-regression was self-caught and reverted before merge, see §4) | **YES**, PR #450, `1ba5b6f` | NO | NO |
| **Booking** | YES — `0096_booking_module_access_gate.sql` | YES — `0043_booking_module_access_gate.sql` | PASS | **YES**, PR #451, `7bf4bba` | NO | NO |
| **Workforce** | YES — `0097_workforce_module_access_gate.sql` | YES — 51 assertions, `0044_workforce_module_access_gate.sql`; 22 pre-existing fixture files updated (see §5) | PASS | **YES**, PR #453, `1ccdf4e` | NO | NO |
| **AI** | YES — `0098_ai_module_access_gate.sql` | YES — `0045_ai_module_access_gate.sql` | PASS | **YES**, PR #454, `36874e7` | NO | NO |

**Remote DB applied: NO for all six rows.** Every migration above exists
only on `dev` (and, once each PR merged, on `origin/dev`). No `supabase db
push`, no Supabase Cloud dev-project migration, and no production deploy
happened at any point in this mission. The linked Cloud dev project
(`pehcoenozjtsjdvjietj`) still runs its pre-mission schema.

**Live-verified: NO for all six rows**, for the same reason — there is
nothing to live-verify on Preview/Cloud until the migrations are actually
applied there. All verification this mission produced is against the
**local** Supabase stack only (`pnpm exec supabase db reset` + `pnpm exec
supabase test db`), run fresh at least once per domain and again at the very
end of the mission (see §6).

`main` was never touched by this mission. `core.has_permission()`,
`core.billing.manage`, and every pre-existing non-module-access permission
are unchanged.

## 3. What is now protected

- **Purchases**: `purchases_actions_select`/`insert` RLS and
  `api.record_purchase_action`, gated on Inventory's own module flag (by
  design — Purchases has no separate `core.module_code`).
- **Inventory**: every RLS policy on `items`/`stock_counts`/
  `check_sessions`/`check_session_items`, the `inventory-media` Storage
  bucket, and `inventory.permanently_delete_item()` (SECURITY DEFINER,
  explicit in-body pre-check).
- **Booking**: all six RLS policies (`bk_services_*`, `bk_staff_*`,
  `bk_hours_*`, `bk_blocked_rw`, `bk_bookings_*`, `bk_events_read`). Booking
  remains scaffold-only/unreachable tenant-facing regardless (no
  `authenticated` grant on the schema exists).
- **Workforce** (largest surface): every RLS policy on `employees`,
  `shifts`/`shift_types`, `shift_requests`, `leave_requests`, `attendance`,
  `shift_exchanges`, `recipe_categories`/`recipes`/`recipe_ingredients`/
  `recipe_steps`/`recipe_notes`, `employee_line_links`,
  `schedule_settings`, `employee_invitations` (manager-facing policies
  only — see the deliberate exception below), `staff_messages`; the
  `recipe-media` Storage bucket; `api.workforce_staff_directory` (restates
  its own predicate, so the check was added directly to the view, not left
  to base-table RLS alone); and 6 SECURITY DEFINER functions that bypass
  RLS entirely — `workforce.is_caller_employee_in_scope`,
  `workforce.is_employee_active_for_schedule`,
  `workforce.shift_request_location_timezone`,
  `workforce.upsert_employee_invitation`,
  `workforce.permanently_delete_employee`,
  `workforce.permanently_delete_recipe`.
- **AI**: all four RLS policies (`ai_proposals_read/insert/update`,
  `ai_prompt_logs_read`). AI remains scaffold-only/unreachable tenant-facing
  regardless (no `authenticated` grant on the schema exists, and
  `supabase/config.toml` doesn't expose the `ai` schema to PostgREST at
  all).

## 4. Deliberate exceptions and judgment calls (Founder-visible, not hidden)

- **Workforce employee invitations are split.** Manager-facing read/revoke
  (`wf_employee_invitations_manager_read`/`_manager_revoke`) and
  Invite/Resend (`workforce.upsert_employee_invitation`) ARE gated — a
  Manager cannot invite/manage staff into a module-OFF tenant. The invited
  person's own pending-invitation read
  (`workforce.my_pending_employee_invitations`) and the accept path
  (`workforce.accept_employee_invitation`) are deliberately NOT gated:
  accepting only creates a `core.role_assignments`/`tenant_memberships` row
  and exposes no Workforce operational data (no shifts/attendance/recipes/
  messages), and the invited person controls nothing about whether the
  tenant's module state changes after their invite was issued — blocking it
  would only strand a legitimate pending invite for no security benefit.
  This is a product-policy judgment call, not a pure security gap. Full
  rationale in `0097_workforce_module_access_gate.sql`'s header. **If this
  split should instead be symmetric (fully gated), that is a one-line
  follow-up migration, not a re-architecture — flag it if the Founder wants
  it changed.**
- **Inventory's `permanently_delete_item()` pre-existing quirk** (found,
  not fixed, during WP-S3): the function's live body blocks deletion when
  stock-count history exists, contradicting an earlier migration's own
  header claiming a cascade-delete-never-refuse design. Out of this
  mission's scope (module-access gating only); needs its own explicitly
  Founder-approved task if it should change.
- **Workforce's `permanently_delete_recipe()` pre-existing quirk** (found
  during this session's WP-S5 test-writing, not fixed): the function calls
  `core.has_permission(tenant_id, 'workforce.recipe.manage', location_id)`
  unconditionally, never branching to `has_permission_in_tenant` for a
  tenant-wide recipe (`location_id is null`) the way every RLS policy on
  the same table does — so a location-scoped Manager can never permanently
  delete a tenant-wide recipe, even one they can otherwise fully manage.
  Same category as the Inventory quirk above: pre-existing, out of this
  mission's scope, not touched.
- **`guard_shift_exchange_update()` trigger** was deliberately left
  unmodified. It re-derives its own authorization decisions independently
  of the calling RLS policy, but every UPDATE policy on
  `workforce.shift_exchanges` is now gated, and Postgres RLS filters rows
  in `USING` before an UPDATE ever reaches a trigger — so the trigger
  cannot fire for a module-OFF tenant through any normal access path.
  Independently confirmed by this mission's own reviewer.
- **`packages/ai/src/proposals.ts`** is real, unwired library code that
  calls the `ai` schema directly via supabase-js; nothing in `apps/api`
  imports it today. Flagged (not fixed — nothing to fix) for whoever wires
  it up next: doing so will need its own migration for schema exposure/
  grants, and WP-S6's gate is already in place to cover that future path.

## 5. Test-fixture debt this mission also paid down

WP-S3 (Inventory) and WP-S5 (Workforce) both hit the same class of issue:
pre-existing pgTAP fixture files created tenants without an explicit
`core.tenant_modules` ON row for the domain under test, which the mission's
new fail-closed default then broke. Fixed by adding one additive
`insert into core.tenant_modules (...) values (..., '<module>', true)` row
per affected fixture tenant — WP-S3 fixed 4 files (`0014`/`0017`/`0023`/
`0041`), WP-S2 fixed 1 (`0038`), WP-S5 fixed 22 files (the full list is in
PR #453's description). Every fix was pure fixture-data addition, zero
assertion changes, verified by re-running the full suite until it matched
the true pre-mission baseline exactly (see §6).

## 6. Full pgTAP baseline (confirmed at mission close)

Running `pnpm exec supabase db reset && pnpm exec supabase test db` against
this mission's final state (`origin/dev` at `36874e7`, all 98 migrations,
45 test files) produces exactly **11 pre-existing, unrelated failures**,
identical in file/test-number/count to the baseline this mission
independently confirmed multiple times against bare `origin/dev` before any
of its own migrations existed:

- `0002_security_rls.sql` — 3 (tests 14, 20-21)
- `0006_api_has_permission.sql` — 1 (test 5)
- `0008_workforce_staff_recipes_rls.sql` — 1 (test 5)
- `0012_workforce_cafe_api_facade.sql` — 2 (tests 20-21)
- `0023_inventory_permanent_delete.sql` — 4 (tests 8-11)

These are grant-count baseline drift from unrelated, earlier migrations
(Purchases/staff-messages/media grants added after the original assertions
were written) — not introduced or worsened by this mission at any point.
**Zero new failures anywhere, at any stage of this mission.**
`pnpm -w typecheck` / `lint` / `build` / `test` are all green throughout —
this mission never touched any `apps/*` or `packages/*` application code,
only `supabase/migrations/**` and `supabase/tests/**`.

## 7. Review discipline

Every domain got at least one independent, fresh-context adversarial review
(a `general-purpose` subagent with no memory of the implementing session,
explicitly tasked to find a way the gate could be bypassed or incomplete)
before its PR was opened, per the mission's own quality gate. Inventory got
a second round after the first round's reviewer caught a near-regression
(a comment-fix attempt had accidentally reintroduced old cascade-delete
logic — caught via the `0023` tests unexpectedly passing, reverted before
merge). Every review's final verdict was READY TO MERGE with zero blocking
findings by the time each PR was opened.

## 8. Merge governance followed

Every one of the six PRs (#448–#451, #453, #454) touches
`supabase/migrations/**` and was therefore a RED path per
`scripts/ai-dev-merge.sh`/`.claude/settings.json` — the Lead Agent
implemented, tested, self-reviewed, got independent review, opened the PR,
and then explicitly requested Founder merge for each one; the Founder
merged all six directly on GitHub. No autonomous merge, no `db push`, no
Cloud/production write happened at any point in this mission.

## 9. What is explicitly still open (not this mission's job)

- **Remote DB apply**: none of migrations `0093`–`0098` have been pushed to
  the linked Supabase Cloud dev project or any production environment. If
  the Founder wants this mission's protections live on `preview.oruwa.jp`,
  that is a separate, explicit `supabase db push` approval request — not
  automatically implied by this report.
- **Live/Preview verification**: since nothing is deployed remotely yet,
  there has been no live click-through confirmation that toggling a module
  off actually changes what a real browser session sees. That would need
  to follow the remote-apply step above.
- The two pre-existing quirks in §4 (Inventory and Workforce permanent-delete
  functions) are documented, not fixed — each needs its own explicitly
  scoped Founder-approved task if they should change.
- The Workforce employee-invitations split (§4) is a judgment call, not a
  unilateral final answer — flagged for Founder review, reversible with a
  small follow-up migration if the Founder disagrees.
- **Cafe v2.2 WP1 Foundation Prerequisite**, or any other next mission, is
  NOT authorized to start by this report. Per the mission's own closing
  rule, this report is the deliverable; the next mission requires its own
  separate Founder go-ahead.

## 10. Mission status

**CLOSED**, pending Founder acceptance of this report. All six domains
(Core/Purchases/Inventory/Booking/Workforce/AI) implemented, tested,
independently reviewed, and merged to `dev`. No further work under the
Module Access Security Remediation name is authorized past this point.
