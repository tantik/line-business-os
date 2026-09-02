# Operations module-ON smoke — Cloud DEV runbook (Step 4)

**Status:** ready to run · **Environment:** Supabase Cloud DEV **only**
(`line-business-os-dev` / `pehcoenozjtsjdvjietj`) · **Production:** do not touch.

## Purpose

Prove on Cloud DEV that the existing Operations foundation (migrations
`0099`–`0105`, `0111`, applied to Cloud DEV 2026-08-29) can be **enabled for a
dedicated smoke tenant** without breaking tenant isolation, location isolation,
RBAC, RLS, the module-entitlement boundary, existing Cafe behaviour, or any
other tenant.

This is **not** Operations UI, **not** Cafe HACCP content, **not** WP1
completion. It is the go/no-go gate before Manager/Staff Operations UX work.

## What "Operations ON" actually is

`core.has_module_access(tenant_id, 'operations')` (migration `0093`) is a pure
lookup of `core.tenant_modules.is_enabled` for `(tenant_id, module='operations')`.
It is **fail-closed**: no row ⇒ no access. It is ANDed with
`core.has_permission[_in_tenant](...)` and a domain/location rule on every
tenant-facing RLS policy, `api.*` view, and `api.operations_*` RPC.

`core.module_registry` lists `operations` as lifecycle `beta` (migration `0111`)
— that is metadata + the `core.can_enable_module()` pre-check only, **not** the
runtime gate. Entitlement/plan gating is deliberately **not** wired into
`has_module_access`.

So "enable Operations for smoke-tenant-b" =

```sql
insert into core.tenant_modules (tenant_id, module, is_enabled)
values ('<smoke-tenant-b uuid>', 'operations', true)
on conflict (tenant_id, module) do update set is_enabled = true;
```

and nothing else. `core` is **not** exposed to PostgREST, so this is a direct
Postgres write (psql or Supabase Studio SQL editor), not an `api.*` call.

## Smoke tenant

| Field | Value |
|---|---|
| tenant | `smoke-tenant-b` — `37088bfe-14f9-4604-af39-61dd09d37b0c` (`kind = demo`) |
| location | `Smoke Cafe B` — `a902c7f6-…` (verify the full uuid in Studio before running) |

If either id has drifted, pass the real ones to the smoke script with
`-v smoke_tenant=<uuid> -v smoke_location=<uuid>`.

## The smoke script — `scripts/smoke/operations-cloud-dev-module-on-smoke.sql`

Self-contained. **Commits nothing** — the whole run is one transaction that ends
in `ROLLBACK`. It creates synthetic actors (a tenant-wide Manager, an
L1-scoped Employee, an L2-only Manager, and a Manager on a throw-away
never-entitled tenant), enables `operations` for the smoke tenant, runs every
Step-4 scenario as a real `authenticated` role-hop through the `api.*` facade,
then rolls everything back. No Supabase Auth users are created. No cleanup step
is needed because nothing is committed.

### Run it

```bash
# DATABASE_URL = the Cloud DEV direct Postgres connection string (session pooler
# or direct 5432). Never paste it into a file; never echo it.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -f scripts/smoke/operations-cloud-dev-module-on-smoke.sql
```

Or paste the file into **Studio → SQL Editor** and run it (Studio wraps
statements in a transaction; the trailing `ROLLBACK` still applies).

### Expected output (stderr NOTICEs + final banner)

```
NOTICE:  PREFLIGHT OK: tenant=smoke-tenant-b ... location=...
NOTICE:  OPERATIONS_MODULE_ON = PASS
NOTICE:  ENABLED_TENANT = PASS (templates N -> N+1, expected_tasks callable)
NOTICE:  DISABLED_TENANT = PASS (no read; write RPC fails closed: operations_module_disabled)
NOTICE:  CROSS_TENANT_ISOLATION = PASS (no cross read, no cross write; N smoke rows visible)
NOTICE:  ROLE_BOUNDARY = PASS (employee: read yes, configure no, resolve no, execute yes)
NOTICE:  LOCATION_BOUNDARY = PASS (L1-scoped template invisible + immutable to an L2-only actor)
NOTICE:  SECRET_SAFETY = PASS
==================================================================
 OPERATIONS CLOUD DEV MODULE-ON SMOKE — ALL SCENARIOS PASSED
 ...
ROLLBACK
```

**PASS** = psql exits `0` and the banner prints. **FAIL** = any `RAISE
EXCEPTION` (non-zero exit); the message names the failing scenario. Because the
transaction rolls back, a failed run leaves Cloud DEV exactly as it was.

### Scenario ↔ Step-4 mapping

| Step-4 scenario | Script check | Category |
|---|---|---|
| A — enabled tenant | Manager reads `api.operations_templates`, creates a template via `api.operations_create_template`, calls `api.operations_expected_tasks` | `ENABLED_TENANT` |
| B — disabled tenant | never-entitled tenant: 0 rows through the facade **and** `api.operations_create_template` ⇒ `operations_module_disabled` | `DISABLED_TENANT` |
| C — cross-tenant | smoke Manager sees 0 rows of the other tenant; unfiltered read returns only smoke rows; cross-tenant create rejected | `CROSS_TENANT_ISOLATION` |
| D — role boundary | Employee: read yes; `create_template` ⇒ `operations_permission_denied`; holds `task.execute`, not `exception.resolve` | `ROLE_BOUNDARY` |
| E — location boundary | L1-scoped template invisible to an L2-only Manager and 0 rows on his UPDATE | `LOCATION_BOUNDARY` |
| secret safety | script reads/prints no key or PII | `SECRET_SAFETY` |

## If a persistent enable is ever wanted (NOT this step)

To click Operations through on Vercel Preview you would need a **committed**
`core.tenant_modules` row for the smoke tenant (and real Auth users). That is a
separate, explicitly Founder-approved action. To do it and then undo it:

```sql
-- enable (persistent)
insert into core.tenant_modules (tenant_id, module, is_enabled)
values ('37088bfe-14f9-4604-af39-61dd09d37b0c', 'operations', true)
on conflict (tenant_id, module) do update set is_enabled = true;

-- ... verify ...

-- disable again (data is preserved, just hidden)
update core.tenant_modules set is_enabled = false
where tenant_id = '37088bfe-14f9-4604-af39-61dd09d37b0c' and module = 'operations';
```

`is_enabled = false` (not `delete`) matches the pgTAP-proven ON→OFF→ON
lifecycle: templates/items/history stay in storage, hidden, and reappear
unchanged if re-enabled.

## Local mirror

`supabase/tests/0055_operations_module_on_smoke.sql` (pgTAP, runs in
`pnpm exec supabase test db`) is the local equivalent — the same Step-4
scenario matrix on a fixture shaped like the Cloud DEV smoke tenants. Keep the
two in sync.
