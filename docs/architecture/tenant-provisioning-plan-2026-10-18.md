# Stage 4B — Automated tenant provisioning: architecture plan (2026-10-18)

Status: **PLAN** (Lead/CTO, Operating Model §9). No code yet. Implements
roadmap Stage 4B (`docs/strategy/oruwa-roadmap-v2-2-close-to-production-2026-10-08.md`):
"new client in 3–5 minutes; the technical part takes seconds; one
idempotent, resumable operation; never half-created". Scale target 300+
tenants (AGENTS.md "Scale and cost").

Evidence markers per Operating Model §6.

## 1. What exists (VERIFIED in the repo, 2026-10-18)

| Piece | Where | Reuse |
|---|---|---|
| Local onboarding CLI: validate → plan (create / reuse / conflict) → dry-run txn → gated commit, entities tenant / user / location / membership / role_assignment / tenant_module, changed-only audit rows | `packages/db/scripts/onboard-*.ts` (local DB only by design) | **the plan model** (pure planner + idempotent apply) — port it, do not start from zero |
| Cafe package contract v2 | `packages/db/scripts/cafe-package-template.ts` | outdated: `requiredModules` = core, workforce, inventory (no operations / issues) → becomes template v3 |
| Plans / entitlements / limits | `core.entitlement_plans`, `core.tenant_plans` (status, `trial_ends_at`), `core.plan_default_limits`, `core.tenant_entitlement_limits`, `core.module_registry` | subscription/trial state at provisioning |
| Per-module settings | `core.tenant_settings`, `workforce.schedule_settings`, `workforce.shift_types` | defaults |
| HACCP presets with sourced default ranges | `packages/db/scripts/cafe-haccp-presets.ts` (#594), installer hardcoded to `oruwa-cafe` | DEBT-100: install for every new Cafe tenant |
| Invitation + Auth email | Edge Function `invite-employee`, `workforce.employee_invitations`, `api.accept_employee_invitation` (0064), `token_hash` callback | Owner invite uses the same mechanism, new `role` |
| Platform staff flag | `core.users.is_platform_staff` | gate for the admin console |
| System roles | `core.roles`: platform_owner, platform_support, tenant_owner, tenant_admin, manager, employee | Owner = `tenant_owner` |

## 2. Decision: one DB transaction + one Edge Function orchestrator

```
ORUWA admin console (platform staff)
   │  POST provision request (slug, business name, location, timezone, owner email, package, plan)
   ▼
Edge Function `provision-tenant` (service role, server-only)
   1. validate input (shared pure validator, ported from onboard-tenant.ts)
   2. rpc core.provision_tenant(request_id, payload jsonb)   ← ONE transaction
        tenant → location → tenant_plan (trial) → core.set_tenant_package(cafe) (0129; after the plan, so min_plan_code checks see it)
        → entitlement limits → schedule_settings + shift types
        → Operations HACCP templates/items/schedules (manifest)
        → owner invitation row (pending) → provisioning status 'db_done' → audit row
   3. send Owner invite (Supabase Auth admin, same token_hash flow as invite-employee)
   4. mark status 'ready' (or 'invite_failed' — resumable)
```

Why this split (alternatives rejected):

- **All in one SQL function** cannot send the Auth invite (Auth Admin API is
  HTTP, needs the service key) → Edge Function needed anyway.
- **All in the Edge Function as many PostgREST calls** cannot be atomic →
  "half-created" tenants on any failure. Rejected.
- **Hence:** everything that is data happens in **one Postgres transaction**
  (atomic: either the whole tenant exists or nothing); the only non-DB side
  effect (email) runs after commit and is **retryable** from the status row.

Idempotency / resume:

- `core.tenant_provisioning(request_id pk, tenant_id, slug unique, status, step, error_code, created_by, created_at, updated_at)`;
  states `requested → db_done → invite_sent → ready`, or `failed_db` /
  `invite_failed`.
- Re-running with the same `request_id` after `db_done` skips step 2 and
  retries the invite; after `ready` it is a no-op that returns the tenant.
- Slug uniqueness enforced by the DB; a different request with a taken slug
  fails before any write.

## 3. Template v3 (data, versioned, in code)

`cafe-package-template.ts` v3 becomes the single source the Edge Function
sends as `payload.template` (validated again in SQL):

- modules: core, workforce, inventory, operations, issues (+ the Weekly
  Review / Purchasing flags as they are modelled today — verify at
  implementation);
- plan: `trial` with `trial_ends_at` (length = Founder business input);
- schedule settings: headcount `[1,2,2,2,2,2,1]`, 160 h/month, 40 h / 5 days per week, auto-create day 15 OFF until the Owner turns it on;
- shift types: 早番 07:00–12:00, 中番 10:00–14:00, 遅番 12:00–17:00;
- HACCP: `CAFE_HACCP_PRESETS_MANIFEST` (fridge 0–5 °C, freezer ≤ −15 °C, hot-holding ≥ 65 °C) — closes DEBT-100;
- no demo recipes / inventory (a clean client tenant; the demo tenant is Stage 4D, same function with a `demo` seed flag).

## 4. Security and tenant boundary

- Only platform staff can request provisioning: the admin console checks
  `is_platform_staff`; the Edge Function re-checks it from the caller's JWT;
  `core.provision_tenant` is `SECURITY DEFINER`, `revoke all from public,
  anon, authenticated`, executable by `service_role` only.
- Owner email: stored encrypted + blind index (rule 6), never logged; the
  status row holds no PII.
- Audit: one `audit.audit_logs` row per provisioning (actor = platform staff
  user, entity = tenant, action = `provision`), plus one per retry.
- Rate limit: max N requests per platform user per hour (DB check on the
  status table).
- Production: the same code; running it against production is a Founder
  gate (first real customer).
- Mandatory reviews: DB/security (migration, SECURITY DEFINER, service role,
  Edge Function), general, UX for the console.

## 5. Owner and Manager appointment (DEBT-091, DEBT-094)

- Invitation gets a `role` (`tenant_owner` | `manager` | `employee`);
  accepting it creates the matching `core.role_assignments` row (location
  NULL for owner/manager-all, or one location). **4B-2 (0134):** a separate
  role-aware `core.tenant_invitations` table (`tenant_owner` | `manager`,
  location NULL or one location) instead of extending
  `workforce.employee_invitations`, which binds an employee row; the
  employee flow is unchanged. Only the Owner path is wired so far.
- Owner screen to appoint/revoke Managers per location (DEBT-091 a).
- Fix DEBT-094 in the same rework: revoke pending invitations on
  deactivate; `accept_employee_invitation` rejects an inactive employee.

## 6. Scale and cost (300+ tenants)

- One provisioning = 1 Edge Function call + 1 RPC + ~60 inserts + 1 email.
  300 tenants ≈ 300 calls total — negligible.
- Ongoing per-tenant cost is unchanged by provisioning; it is measured in
  4C (DEBT-097): function calls, Active CPU, Realtime connections/messages,
  DB size per tenant.
- No per-tenant code, no per-tenant cron: the existing hourly pg_cron
  auto-schedule runner already iterates tenants.

## 7. Phasing (each a PR with its own review and live check)

| Step | Content | Gate |
|---|---|---|
| 4B-1 | migration: `core.tenant_provisioning`, `core.provision_tenant(...)`, invitation `role`; template v3 + pure validator (ported); pgTAP: atomicity (forced failure rolls back everything), idempotency, slug conflict, non-staff denied | DB/security PASS, Cloud DEV apply. **DONE** (0133, PR #608; the invitation `role` moved to 4B-2) |
| 4B-2 | Edge Function `provision-tenant` (validate → RPC → invite → status), retry path; unit tests | DB/security PASS, deploy to Cloud DEV. **IN REVIEW** (this PR): migration 0134 `core.tenant_invitations` (role-aware, Owner now / Manager later) + `create_tenant_owner_invitation` / `set_provisioning_status` / `accept_tenant_invitation` / `my_pending_tenant_invitations` / `api.is_platform_staff`; function `supabase/functions/provision-tenant` (actor from the JWT only, same-`request_id` retry re-runs only the invite); validator shared by generated copy (`scripts/sync-edge-provisioning.mjs`); pgTAP 0073; not yet applied / deployed to Cloud DEV |
| 4B-3 | admin console `/admin/tenants` (platform staff): list, create form, status, retry (JA/EN) | UX + general review, live QA. **DONE in code** (2026-10-20): 0135 `api.platform_tenant_provisioning_list` (staff-only, no PII), console with create + retry by the same `request_id`, Owner accept flow `flow=tenant_invite` + in-app banner (DEBT-110 a/b); reviews DB/security, UX, general PASS (P3s → DEBT-111..113) |
| 4B-4 | Owner first-run wizard (store → shift types → staff invites → modules) + Manager appointment (DEBT-091) | UX review, live QA |
| 4C | 6-tenant test (standard, other location, minimal modules, two locations, failed/retried, full) + usage measurement (DEBT-097) | Lead report → Founder |

## 8. Founder decisions (2026-10-19) and open inputs

Decided:
- **Trial:** 30 days, no card at sign-up; after it ends 7 days read-only,
  then sign-in closed; data kept 90 days after closing.
- **Plans at launch:** one plan, all Cafe modules, no limits on staff or
  locations. Customer-facing name: open (after the product line-up below).
- **Design consequence (Lead):** a package is **a list of modules**
  (`core.packages` / `core.package_modules`, migration 0129), never hardcoded
  as "Cafe = everything"; plans (`core.entitlement_plans`) stay billing tiers.
  Provisioning and the Owner wizard change modules only through
  `core.set_tenant_package` / `core.set_tenant_module_override` (server code
  with the service role, after its own permission check). Splitting the suite into several smaller apps later
  must be a configuration change, not a migration of tenant data. Part of
  4B-1.

Open:
- Product line-up (one suite vs several apps; ingredient-delivery app) —
  Lead analysis given to the Founder 2026-10-19, decision pending.
- Prices, yearly discount (Stage 4H billing).
- Whether ORUWA staff or the client starts provisioning (sales flow): the
  plan assumes ORUWA staff first; self-serve sign-up later behind billing (Stage 4H).

## 9. Risks

- Template drift between code and DB → the version a tenant was provisioned
  with is `core.tenant_packages.package_version` (0129, single source); the
  validator rejects unknown versions.
- Auth email deliverability for Owners (DEBT-083 template still English) —
  fix the template before 4C.
- Two Managers editing the same settings (DEBT-091 b) — last-write-wins
  today; measure in 4C, add optimistic concurrency where it matters.
