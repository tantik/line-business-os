# Demo vs Client Template

Both are **tenants**, configured via `tenant.kind`, `settings`, and seed data.
**Do not** create separate codebases.

## Demo tenant (`kind = 'demo'`)

- Fake but realistic data for sales calls.
- May allow guided demo access.
- Must NOT contain real client PII.
- Seeded by `supabase/seed/seed.sql` (structure) + `pnpm db:seed` (PII demo data).
- Examples: *Mame To Cha Tokyo* (cafe → Workforce), *Mirawi Demo Salon* (salon →
  Booking).

## Client template tenant (`kind = 'client_template'`)

- Clean starter settings, no fake customer PII.
- Production auth enabled, strict RLS.
- Cloned to onboard a real client quickly.

## Onboarding a real client

1. Clone the `client-template` tenant row + its default settings/modules.
2. Create the client's first `tenant_owner` membership + role assignment.
3. Configure their LINE channel in `core.line_channels` (secrets encrypted).
4. Enable modules in `core.tenant_modules`.

Differences between demo and real tenants live entirely in data, never in code.
